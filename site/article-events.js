/* Controlled publication metadata only; never DOM text, input, query, or hash. */
document.addEventListener('DOMContentLoaded', () => {
  const config = window.opentaxAnalytics;
  if (location.hostname !== 'opentax.fragmentware.com' || navigator.globalPrivacyControl === true
    || navigator.doNotTrack === '1' || !/^G-[A-Z0-9]+$/.test(config?.measurementId)
    || !window.opentaxAnalyticsInitialized || !Array.isArray(window.dataLayer)) return;
  let metadata;
  try { metadata = JSON.parse(document.getElementById('article-metadata')?.textContent || '{}'); } catch { return; }
  if (metadata.status !== 'published' || !/^[a-zA-Z0-9_-]{1,80}$/.test(metadata.id)
    || !['pricing', 'comparison', 'free', 'migration', 'oss-ai', 'how-to'].includes(metadata.category)
    || !['explanation', 'comparison', 'alternative', 'howto'].includes(metadata.articleType)
    || !['end-only', 'comparison-entry', 'contextual-example'].includes(metadata.productPlacement)) return;
  const publicPaths = new Set(config.publicPaths);
  const relatedPaths = new Set((metadata.relatedPaths || []).filter((p) => /^\/articles\/[a-z0-9-]+$/.test(p) && publicPaths.has(p)));
  const parameters = { content_group: 'article', article_id: metadata.id, article_category: metadata.category,
    article_type: metadata.articleType, product_placement: metadata.productPlacement };
  const send = (name) => { if (!window['ga-disable-' + config.measurementId]) window.dataLayer.push(['event', name, { ...parameters }]); };
  send('article_view');
  const end = document.querySelector('[data-article-complete]');
  if (end && typeof IntersectionObserver !== 'undefined') {
    let complete = false;
    const observer = new IntersectionObserver((entries) => {
      if (!complete && entries.some((entry) => entry.isIntersecting)) { complete = true; send('article_complete'); observer.disconnect(); }
    }, { threshold: 0.2 });
    observer.observe(end);
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || !link.closest('article')) return;
    let target;
    try { target = new URL(link.getAttribute('href'), location.href); } catch { return; }
    if (target.origin !== location.origin || !publicPaths.has(target.pathname)) return;
    if (relatedPaths.has(target.pathname)) send('related_article_click');
    else if (target.pathname === '/') send('opentax_link_click');
    else if (['/docs/self-hosting', '/docs/mcp'].includes(target.pathname)) send('setup_docs_click');
    if (link.matches('[data-article-cta]')) send('article_cta_click');
  });
});
