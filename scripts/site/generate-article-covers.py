#!/usr/bin/env python3
"""Render photo-and-short-title article covers from a code-native SVG template.

The source photographs are used unchanged. Typography is rendered as vector
paths using checked-in Noto Sans JP fonts, then rasterized to JPEG by the installed
sharp/libvips renderer. No network or browser is required. Body diagrams and
article prose are never read or changed. Requires fontTools and npm ci.

python3 scripts/site/generate-article-covers.py [--only SLUG] [--check]
"""
from __future__ import annotations
import argparse, base64, hashlib, html, json, subprocess, tempfile
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[2]
FONTS = {b: TTFont(ROOT/'public/fonts'/f'NotoSansJP-{n}.ttf')
         for b, n in [(False, 'Regular'), (True, 'Bold')]}
WIDTH, HEIGHT, SAFE_X = 1200, 630, 80
TITLE_SIZE = 72


def text_paths(text, x, y, size, bold=False, fill='#171718'):
    font = FONTS[bold]
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    paths, advance = [], 0
    for char in text:
        assert ord(char) in cmap, f'Missing glyph: {char}'
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        paths.append(f'<path transform="translate({advance},0)" d="{pen.getCommands()}"/>')
        advance += font['hmtx'][name][0]
    # 16:9 list cards crop 40px at each side of this 1.91:1 OG image.
    # All text stays inside a further 40px inset; never truncate or shrink.
    assert advance * scale <= WIDTH - 2 * SAFE_X, (text, advance * scale)
    group = f'<g aria-label="{html.escape(text, quote=True)}" fill="{fill}" transform="translate({x},{y}) scale({scale},-{scale})">'
    return group + ''.join(paths) + '</g>'


def cover_svg(photo, lines, category):
    assert len(lines) == 2 and all(lines), 'Exactly two editorial title lines are required'
    payload = (ROOT/photo['path']).read_bytes()
    assert hashlib.sha256(payload).hexdigest() == photo['sha256'], photo['path']
    raw = base64.b64encode(payload).decode()
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}">'
    svg += '<defs><linearGradient id="shade" x1="0" y1=".3" x2="1" y2=".5" gradientUnits="objectBoundingBox"><stop offset=".1" stop-color="#f5f5f7" stop-opacity=".98"/><stop offset=".52" stop-color="#f5f5f7" stop-opacity=".84"/><stop offset="1" stop-color="#f5f5f7" stop-opacity=".20"/></linearGradient></defs>'
    svg += f'<image width="{WIDTH}" height="{HEIGHT}" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/jpeg;base64,{raw}"/><rect width="{WIDTH}" height="{HEIGHT}" fill="url(#shade)"/>'
    svg += text_paths('OpenTax / 会計ガイド', SAFE_X, 107, 30, fill='#69696e')
    for index, line in enumerate(lines):
        svg += text_paths(line, SAFE_X, 290 + 108 * index, TITLE_SIZE, True)
    svg += text_paths(category, SAFE_X, 548, 28, fill='#69696e')
    return svg + '</svg>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    directory = ROOT/'content/articles'
    specs = json.loads((directory/'covers.json').read_text())['covers']
    photos = json.loads((directory/'cover-photos.json').read_text())
    manifest_path, visual_path = directory/'manifest.json', directory/'visual-assets.json'
    articles = json.loads(manifest_path.read_text())
    visuals = json.loads(visual_path.read_text())
    categories = {c['id']: c['name'] for c in json.loads((directory/'categories.json').read_text())}
    expected = {a['slug'] for a in articles if a['slug'] != 'freee-cost-review'}
    assert set(specs) == expected and len(expected) == 54, 'All 54 non-benchmark articles need a cover'
    if args.only:
        assert args.only in expected, 'Unknown cover slug'
    renders, count = [], 0
    with tempfile.TemporaryDirectory(prefix='opentax-covers-') as temp:
        for article in articles:
            slug = article['slug']
            if slug not in specs or (args.only and args.only != slug):
                continue
            spec, photo = specs[slug], photos[specs[slug]['photo']]
            svg = cover_svg(photo, spec['titleLines'], categories[article['category']])
            source = Path(temp)/(slug + '.svg'); source.write_text(svg)
            destination = ROOT/'site/article-assets'/slug/'share.jpg'
            target = Path(temp)/(slug + '.jpg') if args.check else destination
            renders.append({'source': str(source), 'target': str(target), 'expected': str(destination)})
            alt = ' '.join(spec['titleLines'])
            provenance = {k: photo[k] for k in ['credit', 'sourceUrl', 'licenseUrl', 'licenseName', 'accessedAt']}
            provenance.update({'creator': 'OpenTax編集部', 'generator': 'scripts/site/generate-article-covers.py',
                               'sourcePhoto': photo['path'], 'sourcePhotoSha256': photo['sha256'],
                               'template': 'photo-short-title-v1', 'titleLines': spec['titleLines']})
            asset = {'path': f'/article-assets/{slug}/share.jpg', 'alt': alt,
                     'caption': alt, 'width': WIDTH, 'height': HEIGHT, 'kind': 'cover',
                     **{k: provenance[k] for k in ['credit', 'sourceUrl', 'licenseUrl', 'licenseName', 'accessedAt']},
                     'showCredit': False}
            article['images'] = [asset if i['path'] in [asset['path'], f'/article-assets/{slug}/share.png'] else i for i in article['images']]
            article['thumbnailTitle'] = '\n'.join(spec['titleLines'])
            for key in ['thumbnailImage', 'socialImage', 'representativeImage']:
                article[key] = asset['path']
            visuals[slug]['share'] = {'src': asset['path'], 'width': WIDTH, 'height': HEIGHT,
                                      'alt': alt, 'caption': alt, 'kind': 'cover', 'provenance': provenance}
            count += 1
        job_file = Path(temp)/'jobs.json'; job_file.write_text(json.dumps(renders))
        renderer = """const fs=require('node:fs/promises'), sharp=require('sharp');
(async()=>{for(const j of JSON.parse(await fs.readFile(process.argv[1],'utf8'))){
 await sharp(j.source).jpeg({quality:86,mozjpeg:true,chromaSubsampling:'4:4:4'}).toFile(j.target);
 const meta=await sharp(j.target).metadata();
 if(meta.width!==1200||meta.height!==630)throw Error('Wrong cover dimensions');
 if(process.argv[2]==='check' && !(await fs.readFile(j.target)).equals(await fs.readFile(j.expected)))throw Error('Stale cover: '+j.expected);
}})().catch(e=>{console.error(e);process.exitCode=1});"""
        subprocess.run(['node', '-e', renderer, str(job_file), 'check' if args.check else 'write'], cwd=ROOT, check=True)
        if not args.check:
            for job in renders:
                Path(job['expected']).with_suffix('.png').unlink(missing_ok=True)
    for file, value in [(manifest_path, articles), (visual_path, visuals)]:
        result = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
        if args.check:
            assert result == file.read_text(), f'Stale cover metadata: {file.name}'
        else:
            file.write_text(result)
    print(f'{"Verified" if args.check else "Rendered"} {count} photo covers; benchmark, prose and body diagrams unchanged.')


if __name__ == '__main__':
    main()
