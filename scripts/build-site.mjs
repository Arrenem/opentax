// Builds the public site (LP + documentation) into site/dist for Cloudflare Pages.
// The Markdown files in the repository are the single source; this script only renders them.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(root, 'site');
const outDir = path.join(siteDir, 'dist');
const repoUrl = 'https://github.com/arrenem/opentax';
const siteUrl = 'https://opentax.fragmentware.com';
// Existing OpenTax WEB stream. Public identifier, never an API secret.
// Explicit empty override can build an untracked preview.
const analyticsSettings = JSON.parse(await readFile(path.join(siteDir, 'analytics-settings.json'), 'utf8'));
const measurementId = process.env.SITE_GA4_MEASUREMENT_ID ?? analyticsSettings.measurementId;
if (measurementId && !/^G-[A-Z0-9]+$/.test(measurementId)) {
  throw new Error('SITE_GA4_MEASUREMENT_ID must be a GA4 G- measurement ID');
}

const groups = [
  {
    label: 'はじめる',
    pages: [
      { slug: 'self-hosting', src: 'docs/self-hosting.md', title: 'セルフホストガイド', summary: 'Firebase の準備から起動・公開まで' },
      { slug: 'mcp', src: 'docs/mcp.md', title: 'MCP 接続ガイド', summary: 'Claude・ChatGPT・Claude Code・Codex との接続とツール一覧' },
    ],
  },
  {
    label: 'しくみ',
    pages: [
      { slug: 'architecture', src: 'docs/architecture.md', title: 'アーキテクチャ', summary: 'エージェントと OpenTax の役割分担、認証、監査' },
      { slug: 'tax-rule-sources', src: 'docs/tax-rule-sources.md', title: '税制ルールと出典', summary: '実装している税制ルールと参照した公式資料' },
      { slug: 'known-limitations', src: 'KNOWN_LIMITATIONS.md', title: '既知の制限事項', summary: '未対応の範囲と注意点' },
    ],
  },
  {
    label: 'プロジェクト',
    pages: [
      { slug: 'disclaimer', src: 'DISCLAIMER.md', title: '免責事項', summary: '利用にあたっての注意' },
      { slug: 'contributing', src: 'CONTRIBUTING.md', title: 'コントリビューションガイド', summary: '不具合報告・税務ロジックの指摘・開発への参加' },
      { slug: 'security', src: 'SECURITY.md', title: 'セキュリティポリシー', summary: '脆弱性の報告方法' },
    ],
  },
];
const pages = groups.flatMap((g) => g.pages);
const bySource = new Map(pages.map((p) => [p.src, p]));

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Relative Markdown links point at repository files. Link to the rendered page when one
// exists, otherwise to the file on GitHub.
function resolveHref(href, fromSrc) {
  if (/^[a-z]+:|^#|^\//i.test(href)) return href;
  const [target, hash] = href.split('#');
  const repoPath = path.posix.normalize(path.posix.join(path.posix.dirname(fromSrc), target));
  const page = bySource.get(repoPath);
  if (page) return `/docs/${page.slug}${hash ? `#${hash}` : ''}`;
  return `${repoUrl}/blob/main/${repoPath}${hash ? `#${hash}` : ''}`;
}

const alertLabels = { NOTE: '補足', TIP: 'ヒント', IMPORTANT: '重要', WARNING: '注意', CAUTION: '警告' };

function render(markdown, src) {
  const slugCounts = new Map();
  const toc = [];
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === 'link') token.href = resolveHref(token.href, src);
    },
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, '');
        let id = plain.trim().toLowerCase().replace(/[\s　]+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
        const n = slugCounts.get(id) ?? 0;
        slugCounts.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: plain });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${depth}>\n`;
      },
      blockquote({ tokens }) {
        const body = this.parser.parse(tokens);
        const m = body.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);
        if (!m) return `<blockquote>${body}</blockquote>\n`;
        const kind = m[1];
        const rest = body.slice(m[0].length).replace(/^<\/p>\s*/, '');
        return `<div class="callout callout--${kind.toLowerCase()}"><p class="callout__k">${alertLabels[kind]}</p><p>${rest}</div>\n`;
      },
      table({ header, rows }) {
        const cell = (c) => `<${c.header ? 'th' : 'td'}${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</${c.header ? 'th' : 'td'}>`;
        const head = `<tr>${header.map(cell).join('')}</tr>`;
        const body = rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('');
        return `<div class="table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>\n`;
      },
      code({ text, lang }) {
        return `<div class="codeblock"><button class="copy" type="button" data-copy aria-label="コピー">コピー</button><pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(text)}</code></pre></div>\n`;
      },
    },
  });
  const html = marked.parse(markdown);
  return { html, toc };
}

function sidebar(activeSlug) {
  return groups
    .map(
      (g) => `<p class="side__k">${g.label}</p><ul>${g.pages
        .map((p) => `<li><a href="/docs/${p.slug}"${p.slug === activeSlug ? ' aria-current="page"' : ''}>${p.title}</a></li>`)
        .join('')}</ul>`
    )
    .join('');
}

function layout({ title, description, slug, body, toc = [] }) {
  const canonical = slug ? `${siteUrl}/docs/${slug}` : `${siteUrl}/docs/`;
  const tocHtml = toc.length
    ? `<aside class="toc" aria-label="このページの目次"><p class="side__k">このページの内容</p><ul>${toc
        .map((t) => `<li class="toc--${t.depth}"><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`)
        .join('')}</ul></aside>`
    : '';
  return `<!doctype html>
<html lang="ja" class="no-js">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(title)} — OpenTax ドキュメント</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="theme-color" content="#ffffff" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="${escapeHtml(title)} — OpenTax ドキュメント" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="/docs.css" />
</head>
<body class="docs-body">
  <header class="nav" data-nav>
    <div class="nav__inner container container--wide">
      <a href="/" class="brand" aria-label="OpenTax ホーム">
        <img src="/logo.svg" alt="" width="22" height="22" />
        <span>OpenTax</span>
        <span class="chip chip--muted">ドキュメント</span>
      </a>
      <nav class="nav__links" aria-label="サイト">
        <a href="/">トップ</a>
        <a href="/docs/"${slug ? '' : ' aria-current="page"'}>ドキュメント</a>
        <a href="${repoUrl}/issues" target="_blank" rel="noopener">不具合・要望</a>
      </nav>
      <a class="btn btn--dark btn--sm" href="${repoUrl}" target="_blank" rel="noopener">GitHub</a>
    </div>
  </header>

  <div class="docs-layout container container--wide">
    <details class="side-mobile">
      <summary>ドキュメント一覧</summary>
      <nav aria-label="ドキュメント">${sidebar(slug)}</nav>
    </details>
    <nav class="side" aria-label="ドキュメント">${sidebar(slug)}</nav>
    <main class="doc">
      ${body}
      ${slug ? `<p class="doc__edit"><a href="${repoUrl}/blob/main/${bySourceSlug(slug)}" target="_blank" rel="noopener">GitHub でこのページを編集する ↗</a></p>` : ''}
    </main>
    ${tocHtml}
  </div>

  <footer class="footer">
    <div class="container container--wide">
      <div class="disclaimer">
        <p class="disclaimer__k">プレビュー版について</p>
        <p>OpenTaxは開発中のオープンソース会計ソフトです。税務相談のサービスではなく、開発者は税理士などの資格を持っていません。帳簿や申告の内容はご自身で確認し、必要に応じて税理士などの専門家や税務署にご相談ください。</p>
      </div>
      <div class="footer__row">
        <a href="/" class="brand brand--sm"><img src="/logo.svg" alt="" width="18" height="18" /><span>OpenTax</span></a>
        <nav aria-label="フッター">
          <a href="${repoUrl}" target="_blank" rel="noopener">GitHub</a>
          <a href="/docs/">ドキュメント</a>
          <a href="${repoUrl}/blob/main/LICENSE" target="_blank" rel="noopener">ライセンス（AGPL-3.0）</a>
        </nav>
      </div>
    </div>
  </footer>
  <script src="/main.js" defer></script>
</body>
</html>
`;
}

function bySourceSlug(slug) {
  return pages.find((p) => p.slug === slug).src;
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, 'docs'), { recursive: true });
  for (const f of ['index.html', 'styles.css', 'docs.css', 'main.js', 'analytics.js', 'analytics.css', 'privacy.html', 'favicon.svg', 'logo.svg', '_headers', '404.html']) {
    await cp(path.join(siteDir, f), path.join(outDir, f));
  }

  for (const page of pages) {
    const md = await readFile(path.join(root, page.src), 'utf8');
    const { html, toc } = render(md, page.src);
    await writeFile(
      path.join(outDir, 'docs', `${page.slug}.html`),
      layout({ title: page.title, description: page.summary, slug: page.slug, body: html, toc })
    );
  }

  const index = `<h1>ドキュメント</h1>
<p class="doc__lead">OpenTax のセットアップ方法、AIエージェントとの接続方法、設計や税制ルールについてまとめています。すべてのドキュメントは <a href="${repoUrl}" target="_blank" rel="noopener">GitHub リポジトリ</a> の Markdown から生成しています。</p>
${groups
  .map(
    (g) => `<h2>${g.label}</h2><div class="cards">${g.pages
      .map((p) => `<a class="card-link" href="/docs/${p.slug}"><span>${p.title}</span><small>${p.summary}</small></a>`)
      .join('')}</div>`
  )
  .join('\n')}`;
  await writeFile(
    path.join(outDir, 'docs', 'index.html'),
    layout({ title: 'ドキュメント', description: 'OpenTax のセットアップ・AIエージェント接続・設計・税制ルールのドキュメント', slug: null, body: index })
  );

  const urls = ['/', '/privacy', '/docs/', ...pages.map((p) => `/docs/${p.slug}`)];
  await writeFile(
    path.join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${siteUrl}${u}</loc></url>`)
      .join('\n')}\n</urlset>\n`
  );
  await writeFile(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
  // One final pass covers every generated HTML page, including future articles.
  const htmlFiles = [];
  async function collect(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.name.endsWith('.html')) htmlFiles.push(file);
    }
  }
  await collect(outDir);
  const publicPaths = htmlFiles.map((file) => '/' + path.relative(outDir, file).replaceAll(path.sep, '/'))
    .map((url) => url.replace(/index\.html$/, '').replace(/\.html$/, ''));
  await writeFile(path.join(outDir, 'analytics-config.js'), `window.opentaxAnalytics = ${JSON.stringify({ measurementId, publicPaths, campaignAllowlist: analyticsSettings.campaignAllowlist })};\n`);
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    if (/googletagmanager|google-analytics|gtag\(/i.test(html)) throw new Error(`Duplicate analytics tag: ${file}`);
    await writeFile(file, html.replace('</head>', '<link rel="stylesheet" href="/analytics.css" />\n<script src="/analytics-config.js" defer></script>\n<script src="/analytics.js" defer></script>\n</head>'));
  }
  console.log(`Built ${pages.length + 1} doc pages into ${path.relative(root, outDir)}`);
}

await main();
