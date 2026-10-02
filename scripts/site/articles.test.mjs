import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildArticles, validateManifest, renderArticleMarkdown, safeHref } from './articles.mjs';
const article = { id:'test', slug:'test-guide', title:'記帳の基本', description:'記帳の基本を解説', summary:'売上と経費を記録します。', sourcePath:'content/articles/test.md', status:'draft', category:'how-to', articleType:'howto', productPlacement:'contextual-example', primaryKeyword:'記帳', secondaryKeywords:[], audience:'sole-proprietor', intent:'informational', authorId:'editorial', publishedAt:null, updatedAt:'2026-10-02', reviewedAt:null, sources:[{title:'一次資料',publisher:'公式',claim:'記帳',accessedAt:'2026-10-02',url:'https://example.org/source'}], relatedSlugs:[], reviewBlockers:['review'] };
const categories = [{id:'how-to',name:'記帳'}]; const authors=[{id:'editorial',name:'編集部'}];
test('rejects duplicate identities, unsafe sources and incomplete publication', () => {
  assert.throws(() => validateManifest([article,article],categories,authors), /Duplicate/);
  assert.throws(() => validateManifest([{...article,sourcePath:'../secret.md'}],categories,authors), /Unsafe/);
  assert.throws(() => validateManifest([{...article,status:'published',publishedAt:'2026-10-02'}],categories,authors), /review incomplete/);
});
test('source, tax-review and expired editorial dates fail closed', () => {
  const base={...article,status:'published',publishedAt:'2026-10-02',reviewedAt:'2026-10-02',reviewBlockers:[],sources:article.sources.map(s=>({...s,verified:true}))};
  assert.throws(()=>validateManifest([{...base,sources:[{...base.sources[0],accessedAt:'2099-01-01'}]}],categories,authors),/source review/);
  assert.throws(()=>validateManifest([{...base,taxReviewedAt:'2099-01-01'}],categories,authors),/tax review date/);
  assert.throws(()=>validateManifest([{...base,reviewDueAt:'2020-01-01'}],categories,authors),/overdue/);
  assert.throws(()=>validateManifest([{...base,sources:[{...base.sources[0],publisher:''}]}],categories,authors),/source review/);
  for (const state of [{publicationApproval:'pending'}, {evidenceGaps:['current official form']}, {verificationStatus:'additional-evidence-needed'}]) assert.throws(()=>validateManifest([{...base,...state}],categories,authors),/evidence or publication approval/);
});
test('raw HTML, obfuscated unsafe links and body h1 cannot become article HTML', () => {
  for (const href of ['javascript:alert(1)','data:text/html,test','//example.org','java\nscript:bad']) assert.throws(() => safeHref(href));
  assert.throws(() => renderArticleMarkdown('<script>alert(1)</script>',article,[article]), /raw HTML/);
  assert.throws(() => renderArticleMarkdown('# second title',article,[article]), /h2/);
  const code=renderArticleMarkdown('```text\n<script>unsafe</script>\n```',article,[article],true).html;
  assert.match(code,/class="codeblock"/); assert.match(code,/tabindex="0"/); assert.match(code,/&lt;script&gt;/); assert.doesNotMatch(code,/<script>/);
});
test('stable unique headings, accessible tables, local article links', () => {
  const result=renderArticleMarkdown('## 同じ見出し\n\n## 同じ見出し\n\n|項目|値|\n|---|---|\n|売上|100|\n\n[関連記事](test.md)',article,[article],true);
  assert.deepEqual(result.toc.map((t)=>t.id),['同じ見出し','同じ見出し-2']);
  assert.match(result.html,/tabindex="0"/); assert.match(result.html,/href="\/articles\/test-guide"/);
  assert.throws(()=>renderArticleMarkdown('[関連記事](test.md)',article,[article]),/unavailable/);
});
test('canonical local article links cannot bypass draft publication gate', () => {
  const published = {...article,status:'published'};
  const draft = {...article,id:'draft',slug:'draft-guide',sourcePath:'content/articles/draft.md'};
  for (const href of ['/articles/draft-guide','draft-guide','https://opentax.fragmentware.com/articles/draft-guide','/articles/draft-guide?utm_source=test#heading']) {
    assert.throws(()=>renderArticleMarkdown(`[関連](${href})`,published,[published,draft]),/unavailable/);
    assert.doesNotThrow(()=>renderArticleMarkdown(`[関連](${href})`,published,[published,draft],true));
  }
  for (const href of ['/articles/missing','/articles/test-guide/','/articles/test-guide.html','/articles/category/missing/']) assert.throws(()=>renderArticleMarkdown(`[関連](${href})`,published,[published,draft],true),/unavailable|noncanonical/);
  assert.doesNotThrow(()=>renderArticleMarkdown('[外部](https://external.example/articles/draft-guide)',published,[published,draft]));
});
test('drafts are excluded from production and preview schema escapes script text', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'opentax-articles-'));
  try {
    await mkdir(path.join(root,'content/articles'),{recursive:true}); await mkdir(path.join(root,'site'));
    for(const name of ['articles.css','article-events.js','article-og.png']) await cp(new URL(`../../site/${name}`,import.meta.url),path.join(root,'site',name));
    for(const [name,value] of Object.entries({manifest:[{...article,summary:'</script><script>bad</script>'}],categories,authors,pricing:{records:[]}})) await writeFile(path.join(root,'content/articles',`${name}.json`),JSON.stringify(value));
    await writeFile(path.join(root,article.sourcePath),'## 手順\n\n売上を記帳します。');
    const outDir=path.join(root,'dist'); assert.deepEqual(await buildArticles({root,outDir,siteUrl:'https://example.org'}),[]);
    const index=await readFile(path.join(outDir,'articles/index.html'),'utf8'); assert.match(index,/noindex/); assert.doesNotMatch(index,/href="\/articles\/test-guide"/);
    assert.deepEqual(await buildArticles({root,outDir,siteUrl:'https://example.org',preview:true}),[]);
    const preview=await readFile(path.join(outDir,'articles/test-guide.html'),'utf8'); assert.match(preview,/noindex/); assert.doesNotMatch(preview,/datePublished/); assert.match(preview,/&lt;\/script&gt;/); assert.equal((preview.match(/<h1>/g)||[]).length,1);
    const published={...article,status:'published',publishedAt:'2026-10-02',reviewedAt:'2026-10-02',reviewBlockers:[],sources:[{title:'一次資料',publisher:'公式',claim:'記帳',accessedAt:'2026-10-02',url:'https://example.org/source',verified:true,accessedAt:'2026-10-02'}]};
    await writeFile(path.join(root,'content/articles/manifest.json'),JSON.stringify([published]));
    await assert.rejects(readFile(path.join(outDir,'articles/draft-guide.html')),{code:'ENOENT'});
    const entries=await buildArticles({root,outDir,siteUrl:'https://example.org'}); assert.equal(entries.length,3); assert.ok(entries.every(e=>e.lastmod==='2026-10-02'));
    const draft={...article,id:'draft',slug:'draft-guide',title:'未公開の記帳ガイド',sourcePath:'content/articles/draft.md'};
    await writeFile(path.join(root,draft.sourcePath),'## 未公開\n\n下書きです。');
    await writeFile(path.join(root,'content/articles/manifest.json'),JSON.stringify([{...published,relatedSlugs:[draft.slug]},draft]));
    const cleanOut=path.join(root,'production');
    await buildArticles({root,outDir:cleanOut,siteUrl:'https://example.org',preview:true});
    assert.ok(await readFile(path.join(cleanOut,'articles/draft-guide.html'),'utf8'));
    const mixedEntries=await buildArticles({root,outDir:cleanOut,siteUrl:'https://example.org'});
    assert.ok(mixedEntries.every((entry)=>!entry.path.includes('draft-guide')));
    const productionArticle=await readFile(path.join(cleanOut,'articles/test-guide.html'),'utf8');
    const productionIndex=await readFile(path.join(cleanOut,'articles/index.html'),'utf8');
    assert.doesNotMatch(productionArticle + productionIndex,/draft-guide/);
    await assert.rejects(readFile(path.join(cleanOut,'articles/draft-guide.html')),{code:'ENOENT'});
    const withPrice={...published,pricingRefs:['rate'],applicableDate:'2026-10-02',reviewDueAt:'2099-01-01'};
    await writeFile(path.join(root,'content/articles/manifest.json'),JSON.stringify([withPrice]));
    await assert.rejects(buildArticles({root,outDir:cleanOut,siteUrl:'https://example.org'}),/unknown pricing/);
    for (const record of [{id:'rate',verified:false,accessedAt:'2026-10-02'}, {id:'rate',verified:true,accessedAt:'2099-01-01'}, {id:'rate',verified:true,accessedAt:null}]) {
      await writeFile(path.join(root,'content/articles/pricing.json'),JSON.stringify({records:[record]}));
      await assert.rejects(buildArticles({root,outDir:cleanOut,siteUrl:'https://example.org'}),/unverified pricing/);
    }
    await writeFile(path.join(root,'content/articles/pricing.json'),JSON.stringify({records:[{id:'rate',verified:true,accessedAt:'2026-10-02',effectiveFrom:'2099-01-01'}]}));
    await assert.doesNotReject(buildArticles({root,outDir:cleanOut,siteUrl:'https://example.org'}));
  } finally {await rm(root,{recursive:true,force:true});}
});
