import { readFile, writeFile, mkdir, cp, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { Marked } from 'marked';

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const required = ['id', 'slug', 'title', 'description', 'summary', 'sourcePath', 'status', 'category', 'articleType', 'productPlacement', 'primaryKeyword', 'audience', 'intent', 'authorId', 'updatedAt'];
export function safeHref(href) {
  if (typeof href !== 'string' || /[\u0000-\u0020\u007f\\]/.test(href) || /^\/\//.test(href)) throw new Error(`Unsafe link: ${href}`);
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) throw new Error(`Unsafe link protocol: ${href}`);
  return href;
}
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
export function validateManifest(articles, categories, authors) {
  if (![articles, categories, authors].every(Array.isArray)) throw new Error('Article registries must be arrays');
  const unique = (rows, key) => { const seen = new Set(); for (const row of rows) { if (!row[key] || seen.has(row[key])) throw new Error(`Duplicate or missing ${key}: ${row[key]}`); seen.add(row[key]); } };
  for (const key of ['id', 'slug', 'title', 'sourcePath']) unique(articles, key);
  unique(categories, 'id'); unique(authors, 'id');
  for (const article of articles) {
    for (const key of required) if (typeof article[key] !== 'string' || !article[key].trim()) throw new Error(`${article.slug}: missing ${key}`);
    if (!slugPattern.test(article.slug)) throw new Error(`Invalid article slug: ${article.slug}`);
    if (!['draft', 'published'].includes(article.status)) throw new Error(`Invalid status: ${article.status}`);
    if (article.status === 'published' && (article.evidenceGaps?.length || article.publicationApproval === 'pending' || article.verificationStatus === 'additional-evidence-needed')) throw new Error(`${article.slug}: evidence or publication approval incomplete`);
    if (!categories.some((c) => c.id === article.category) || !authors.some((a) => a.id === article.authorId)) throw new Error(`${article.slug}: unknown category or author`);
    if (path.isAbsolute(article.sourcePath) || article.sourcePath.split(/[\\/]/).includes('..') || !/^content\/articles\/[a-z0-9-]+\.md$/.test(article.sourcePath)) throw new Error(`Unsafe sourcePath: ${article.sourcePath}`);
    if (!validDate(article.updatedAt) || (article.publishedAt != null && (!validDate(article.publishedAt) || article.updatedAt < article.publishedAt)) || (article.status === 'published' && !validDate(article.publishedAt))) throw new Error(`${article.slug}: invalid dates`);
    if (!Array.isArray(article.sources) || !Array.isArray(article.relatedSlugs) || !Array.isArray(article.reviewBlockers) || !Array.isArray(article.secondaryKeywords)) throw new Error(`${article.slug}: missing registry arrays`);
    const today = new Date().toISOString().slice(0, 10);
    for (const source of article.sources) { if (!source.publisher || !source.claim || !validDate(source.accessedAt) || source.accessedAt > today) throw new Error(`${article.slug}: invalid source review fields`); if (!source.title || !/^https:\/\//.test(source.url)) throw new Error(`${article.slug}: invalid source`); safeHref(source.url); }
    if (article.status === 'published' && (!validDate(article.reviewedAt) || article.reviewBlockers.length || !article.sources.length || article.sources.some((s) => s.verified !== true || !validDate(s.accessedAt)))) throw new Error(`${article.slug}: publication review incomplete`);
    if (article.requiresTaxReview && article.status === 'published' && (!article.taxReviewerId || !authors.some((a) => a.id === article.taxReviewerId) || !validDate(article.taxReviewedAt))) throw new Error(`${article.slug}: tax review incomplete`);
    if ((article.requiresTaxReview || article.pricingRefs?.length) && (!validDate(article.reviewDueAt) || (!article.applicableDate && !article.applicableTaxYear))) throw new Error(`${article.slug}: missing applicability or next review date`);
    if (article.audience !== 'sole-proprietor' || !['explanation', 'comparison', 'alternative', 'howto'].includes(article.articleType) || !['end-only', 'comparison-entry', 'contextual-example'].includes(article.productPlacement)) throw new Error(`${article.slug}: invalid audience/type/placement`);
    const expectedPlacement = { explanation: 'end-only', comparison: 'comparison-entry', alternative: 'comparison-entry', howto: 'contextual-example' };
    if (expectedPlacement[article.articleType] !== article.productPlacement) throw new Error(`${article.slug}: mismatched editorial placement`);
    if (article.taxReviewedAt && (!validDate(article.taxReviewedAt) || article.taxReviewedAt > today)) throw new Error(`${article.slug}: invalid tax review date`);
    if (article.status === 'published' && article.reviewDueAt && article.reviewDueAt < today) throw new Error(`${article.slug}: review overdue`);
    if (article.updatedAt > today || (article.publishedAt && article.publishedAt > today) || (article.reviewedAt && (!validDate(article.reviewedAt) || article.reviewedAt > today || article.reviewedAt < article.publishedAt))) throw new Error(`${article.slug}: invalid editorial date`);
    if (article.cta) { if (/managed|マネージド|申込/i.test(article.cta.href + article.cta.label)) throw new Error(`${article.slug}: unsupported managed CTA`); if (!article.cta.label || !article.cta.href) throw new Error(`${article.slug}: invalid CTA`); safeHref(article.cta.href); }
  }
  for (const article of articles) for (const slug of article.relatedSlugs) if (!articles.some((a) => a.slug === slug) || slug === article.slug) throw new Error(`${article.slug}: invalid related article ${slug}`);
  for (const category of categories) if (!slugPattern.test(category.slug ?? category.id) || !(category.name ?? category.title)) throw new Error('Invalid category');
  for (const author of authors) if (!author.name) throw new Error('Invalid author');
  return articles;
}

export function validateArticleHref(href, article, articles, preview = false, siteUrl = 'https://opentax.fragmentware.com') {
  safeHref(href);
  const url = new URL(href, `${siteUrl}/articles/${article.slug}`);
  if (url.origin !== new URL(siteUrl).origin || !url.pathname.startsWith('/articles/')) return href;
  if (url.pathname === '/articles/') return href;
  if (url.pathname.startsWith('/articles/category/')) {
    const match = url.pathname.match(/^\/articles\/category\/([a-z0-9-]+)\/$/);
    if (!match || !articles.some((a) => a.category === match[1] && (preview || a.status === 'published'))) throw new Error(`${article.slug}: unavailable or noncanonical category link ${href}`);
    return href;
  }
  const match = url.pathname.match(/^\/articles\/([a-z0-9-]+)$/);
  const target = match && articles.find((a) => a.slug === match[1]);
  if (!target || (!preview && target.status !== 'published')) throw new Error(`${article.slug}: link to unavailable or noncanonical article ${href}`);
  return href;
}

export function renderArticleMarkdown(markdown, article, articles, preview = false, siteUrl = 'https://opentax.fragmentware.com') {
  const toc = []; const counts = new Map();
  const renderer = {
    html() { throw new Error(`${article.slug}: raw HTML is not permitted`); },
    heading({ tokens, depth }) {
      if (depth === 1) throw new Error(`${article.slug}: Markdown must start at h2`);
      const plain = tokens.map((t) => t.text ?? '').join('').replace(/<[^>]*>/g, '');
      const base = plain.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'section';
      const count = counts.get(base) ?? 0; counts.set(base, count + 1);
      const id = count ? `${base}-${count + 1}` : base;
      if (depth <= 3) toc.push({ depth, id, text: plain });
      return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    image() { throw new Error(`${article.slug}: article images require an approved asset implementation`); },
    code({ text, lang }) {
      return `<div class="codeblock"><pre tabindex="0" role="region" aria-label="横にスクロールできるコード例"><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(text)}</code></pre></div>\n`;
    },
    link({ href, title, tokens }) {
      safeHref(href);
      const [target, hash] = href.split('#');
      if (target.endsWith('.md') && !/^[a-z][a-z\d+.-]*:/i.test(target) && !target.startsWith('/')) {
        const sourcePath = path.posix.normalize(path.posix.join(path.posix.dirname(article.sourcePath), target));
        const related = articles.find((a) => a.sourcePath === sourcePath);
        if (!related || (!preview && related.status !== 'published')) throw new Error(`${article.slug}: link to unavailable article ${href}`);
        href = `/articles/${related.slug}${hash ? '#' + hash : ''}`;
      }
      validateArticleHref(href, article, articles, preview, siteUrl);
      return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}${/^https?:/.test(href) ? ' rel="noopener noreferrer"' : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
    table({ header, rows }) {
      const cell = (c) => `<${c.header ? 'th scope="col"' : 'td'}>${this.parser.parseInline(c.tokens)}</${c.header ? 'th' : 'td'}>`;
      return `<div class="table" tabindex="0" role="region" aria-label="横にスクロールできる比較表"><table><caption class="article-table-caption">項目別の比較・確認表</caption><thead><tr>${header.map(cell).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
    },
  };
  return { html: new Marked({ gfm: true, renderer }).parse(markdown), toc };
}

function layout({ title, description, canonical, body, schema, preview, metadata }) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} | OpenTax</title><meta name="description" content="${escapeHtml(description)}">${preview ? '<meta name="robots" content="noindex,nofollow">' : ''}<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="${metadata ? 'article' : 'website'}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:locale" content="ja_JP"><meta property="og:image" content="${escapeHtml(new URL('/article-og.png', canonical).href)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(new URL('/article-og.png', canonical).href)}"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/docs.css"><link rel="stylesheet" href="/articles.css"><script type="application/ld+json">${json(schema)}</script>${metadata ? `<script type="application/json" id="article-metadata">${json(metadata)}</script><script src="/article-events.js" defer></script>` : ''}</head><body class="docs-body article-body"><a class="article-skip" href="#content">本文へ</a><header class="nav"><div class="nav__inner container"><a href="/" class="brand"><img src="/logo.svg" alt="" width="22" height="22"><span>OpenTax</span></a><nav class="nav__links" aria-label="サイト"><a href="/">トップ</a><a href="/articles/" aria-current="page">記事</a><a href="/docs/">ドキュメント</a></nav></div></header><main id="content" class="article-container doc">${body}</main><footer class="footer"><div class="container footer__row"><a class="brand" href="/">OpenTax</a><nav aria-label="フッター"><a href="/articles/">記事一覧</a><a href="/docs/">ドキュメント</a><a href="/privacy">Privacy Policy</a></nav></div></footer></body></html>`;
}

export async function buildArticles({ root, outDir, siteUrl, preview = false }) {
  const registryDir = path.join(root, 'content/articles');
  const registry = async (name) => { const value = JSON.parse(await readFile(path.join(registryDir, `${name}.json`), 'utf8')); return Array.isArray(value) ? value : value[name === 'manifest' ? 'articles' : name]; };
  const [articles, categories, authors] = await Promise.all(['manifest', 'categories', 'authors'].map(registry));
  validateManifest(articles, categories, authors);
  const pricing = JSON.parse(await readFile(path.join(registryDir, 'pricing.json'), 'utf8'));
  const pricingRecords = Array.isArray(pricing) ? pricing : pricing.records;
  if (!Array.isArray(pricingRecords)) throw new Error('Invalid pricing registry');
  const today = new Date().toISOString().slice(0, 10);
  for (const article of articles) for (const id of article.pricingRefs ?? []) {
    const record = pricingRecords.find((r) => r.id === id);
    if (!record) throw new Error(`${article.slug}: unknown pricing reference ${id}`);
    if (article.status === 'published' && (record.verified !== true || !validDate(record.accessedAt) || record.accessedAt > today)) throw new Error(`${article.slug}: unverified pricing reference ${id}`);
  }
  for (const article of articles) { const source = await realpath(path.join(root, article.sourcePath)); const rootPath = await realpath(root); if (!source.startsWith(rootPath + path.sep)) throw new Error(`Source escapes repository: ${article.sourcePath}`); }
  const visible = articles.filter((a) => preview || a.status === 'published');
  const entries = []; const articleDir = path.join(outDir, 'articles'); await rm(articleDir, {recursive:true,force:true}); await mkdir(articleDir, { recursive: true });
  for (const asset of ['articles.css', 'article-events.js', 'article-og.png']) await cp(path.join(root, 'site', asset), path.join(outDir, asset));
  const write = async (file, options) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, layout({ preview, ...options })); };
  const cards = (items) => `<div class="cards">${items.map((a) => `<a class="card-link" href="/articles/${a.slug}"><span>${escapeHtml(a.title)}</span><small>${escapeHtml(a.description)}</small>${a.status === 'draft' ? '<small>確認中の下書き</small>' : ''}</a>`).join('')}</div>`;
  const breadcrumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: siteUrl + url })) });
  for (const article of visible) {
    const source = path.join(root, article.sourcePath); const actual = await realpath(source); const actualRoot = await realpath(root);
    if (!actual.startsWith(actualRoot + path.sep)) throw new Error(`Source escapes repository: ${article.sourcePath}`);
    const markdown = await readFile(source, 'utf8');
    const resolved = markdown.replace(/\{\{pricing:([a-z0-9-]+):([a-zA-Z0-9_]+)\}\}/g, (_, id, field) => { const record = pricingRecords.find((r) => r.id === id); const value = record?.[field]; if (!['string', 'number'].includes(typeof value)) throw new Error(`Unknown pricing reference: ${id}:${field}`); return escapeHtml(value).replace(/[|\n\r]/g, ' ').replace(/([\[\]()*_`!])/g, '\\$1'); });
    const { html, toc } = renderArticleMarkdown(resolved, article, articles, preview, siteUrl);
    if (article.cta) validateArticleHref(article.cta.href, article, articles, preview, siteUrl);
    const category = categories.find((c) => c.id === article.category); const categorySlug = category.slug ?? category.id; const categoryName = category.name ?? category.title;
    const author = authors.find((a) => a.id === article.authorId); const canonical = `${siteUrl}/articles/${article.slug}`;
    const crumbs = [['ホーム', '/'], ['記事', '/articles/'], [categoryName, `/articles/category/${categorySlug}/`], [article.title, `/articles/${article.slug}`]];
    const schema = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Article', headline: article.title, description: article.description, mainEntityOfPage: canonical, ...(article.publishedAt ? { datePublished: article.publishedAt } : {}), dateModified: article.updatedAt, inLanguage: 'ja', author: { '@type': author.type ?? 'Organization', name: author.name, ...(author.url ? { url: author.url } : {}) }, publisher: { '@type': 'Organization', name: 'OpenTax', url: siteUrl }, image: `${siteUrl}/article-og.png` }, breadcrumbs(crumbs)] };
    const related = visible.filter((a) => article.relatedSlugs.includes(a.slug));
    const body = `<nav class="article-breadcrumb" aria-label="パンくず"><a href="/articles/">記事</a> / <a href="/articles/category/${categorySlug}/">${escapeHtml(categoryName)}</a></nav><article><h1>${escapeHtml(article.title)}</h1><section class="article-summary" aria-label="この記事の要点"><p>${escapeHtml(article.summary)}</p></section>${article.applicableTaxYear || article.applicableDate ? `<p class="article-applicable">適用対象: ${[article.applicableTaxYear, article.applicableDate].filter(Boolean).map(escapeHtml).join(' · ')}</p>` : ''}<p class="article-meta">${escapeHtml(author.name)}${article.publishedAt ? ` · 公開 <time datetime="${article.publishedAt}">${article.publishedAt}</time>` : ''} · 更新 <time datetime="${article.updatedAt}">${article.updatedAt}</time>${article.reviewedAt ? ` · 編集確認 ${escapeHtml(article.reviewedAt)}` : ''}</p>${article.status === 'draft' ? '<p class="article-draft">確認中の下書き — 公開前のレビュー待ちです。</p>' : ''}${preview && article.status === 'draft' && article.reviewBlockers.length ? `<details class="article-review"><summary>公開前の確認事項</summary><ul>${article.reviewBlockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join('')}</ul></details>` : ''}${toc.length ? `<nav class="article-toc" aria-label="目次"><h2>目次</h2><ol>${toc.map((t) => `<li class="toc--${t.depth}"><a href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a></li>`).join('')}</ol></nav>` : ''}<div class="article-prose">${html}</div><section class="article-sources" data-article-complete><h2>参考資料・出典</h2><ul>${article.sources.map((s) => `<li><a href="${escapeHtml(s.url)}" rel="noopener noreferrer">${escapeHtml(s.title)}</a>${s.verified !== true ? ' <strong>本文の根拠として未確認</strong>' : ''}${s.publisher ? ` — ${escapeHtml(s.publisher)}` : ''}${s.accessedAt ? `（参照日: ${escapeHtml(s.accessedAt)}）` : '（参照日未確認）'}${s.applicableDate || s.applicableTaxYear ? ` · 適用対象: ${escapeHtml(s.applicableDate ?? s.applicableTaxYear)}` : ''}${s.claim ? `<p>${escapeHtml(s.claim)}</p>` : ''}</li>`).join('')}</ul></section>${article.correctionLog?.length ? `<section><h2>更新・訂正履歴</h2><ul>${article.correctionLog.map((entry) => `<li>${escapeHtml(typeof entry === 'string' ? entry : `${entry.date}: ${entry.description ?? entry.note ?? ''}`)}</li>`).join('')}</ul></section>` : ''}${article.cta ? `<aside class="article-cta"><a href="${escapeHtml(article.cta.href)}" data-article-cta>${escapeHtml(article.cta.label)}</a></aside>` : ''}${related.length ? `<section><h2>関連記事</h2>${cards(related)}</section>` : ''}</article>`;
    await write(path.join(articleDir, `${article.slug}.html`), { title: article.title, description: article.description, canonical, body, schema, metadata: { id: article.id, category: article.category, articleType: article.articleType, productPlacement: article.productPlacement, relatedPaths: related.map((a) => `/articles/${a.slug}`), status: article.status } });
    if (article.status === 'published') entries.push({ path: `/articles/${article.slug}`, lastmod: article.updatedAt });
  }
  const indexSchema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '個人事業主の会計・確定申告ガイド', url: `${siteUrl}/articles/` };
  await write(path.join(articleDir, 'index.html'), { title: '個人事業主の会計・確定申告ガイド', description: '個人事業主の記帳、会計ソフト選び、確定申告を支える実用ガイド。', canonical: `${siteUrl}/articles/`, body: `<h1>個人事業主の会計・確定申告ガイド</h1><p class="doc__lead">記帳や会計ソフト選び、確定申告に役立つ情報をまとめています。</p><nav class="article-categories" aria-label="記事カテゴリ">${categories.filter((c) => visible.some((a) => a.category === c.id)).map((c) => `<a href="/articles/category/${c.slug ?? c.id}/">${escapeHtml(c.name ?? c.title)}</a>`).join('')}</nav>${visible.length ? cards(visible) : '<p>記事は準備中です。</p>'}`, schema: indexSchema, preview: preview || !visible.some((a) => a.status === 'published') });
  if (visible.some((a) => a.status === 'published')) entries.unshift({ path: '/articles/', lastmod: visible.filter((a) => a.status === 'published').map((a) => a.updatedAt).sort().at(-1) });
  for (const category of categories) {
    const items = visible.filter((a) => a.category === category.id); if (!items.length) continue; const slug = category.slug ?? category.id; const name = category.name ?? category.title;
    await write(path.join(articleDir, 'category', slug, 'index.html'), { title: name, description: category.description ?? `${name}に関する個人事業主向けの実用記事。`, canonical: `${siteUrl}/articles/category/${slug}/`, body: `<nav class="article-breadcrumb"><a href="/articles/">記事一覧</a></nav><h1>${escapeHtml(name)}</h1>${category.description ? `<p class="doc__lead">${escapeHtml(category.description)}</p>` : ''}${items.length ? cards(items) : '<p>このカテゴリの記事は準備中です。</p>'}`, schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name, url: `${siteUrl}/articles/category/${slug}/` } });
    const published = items.filter((a) => a.status === 'published'); if (published.length) entries.push({ path: `/articles/category/${slug}/`, lastmod: published.map((a) => a.updatedAt).sort().at(-1) });
  }
  return entries;
}
