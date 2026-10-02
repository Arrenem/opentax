/* Public static site only. No DOM text, copied code, query, hash, or user input is sent. */
(() => {
  const config = window.opentaxAnalytics;
  if (!config?.campaignAllowlist || location.hostname !== 'opentax.fragmentware.com' || window.opentaxAnalyticsInitialized) return;
  window.opentaxAnalyticsInitialized = true;
  const paths = new Set(config.publicPaths);
  const canonicalPath = (pathname) => {
    const path = pathname.replace(/index\.html$/, '').replace(/\.html$/, '');
    if (paths.has(path)) return path;
    if (paths.has(path + '/')) return path + '/';
    return '/404';
  };
  const pagePath = canonicalPath(location.pathname);
  const contentGroup = pagePath === '/' ? 'landing' : pagePath.startsWith('/docs/') ? 'documentation'
    : pagePath.startsWith('/articles/') || pagePath.startsWith('/blog/') ? 'article' : 'other';
  const referrer = (() => {
    try {
      const url = new URL(document.referrer);
      if (!['https:', 'http:'].includes(url.protocol)) return '';
      return url.origin === location.origin ? url.origin + canonicalPath(url.pathname) : url.origin + '/';
    } catch { return ''; }
  })();
  // Controlled publication vocabulary: arbitrary UTM strings (including names/emails) are discarded.
  const allowed = config.campaignAllowlist;
  const query = new URLSearchParams(location.search);
  const campaign = Object.fromEntries(Object.entries(allowed).map(([name, values]) => {
    const value = query.get('utm_' + name);
    return ['campaign_' + (name === 'campaign' ? 'name' : name), values.includes(value) ? value : ''];
  }));
  // Browser-level tracking preferences remain respected; no consent UI or stored-choice gate.
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1'
    || !/^G-[A-Z0-9]+$/.test(config.measurementId)) return;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  // Advertising storage stays denied. Analytics uses the ordinary Google tag defaults.
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('js', new Date());
  gtag('config', config.measurementId, {
    send_page_view: false,
    page_location: location.origin + pagePath,
    page_referrer: referrer,
    page_title: pagePath,
    content_group: contentGroup,
    ...campaign,
    campaign_term: '', campaign_id: '',
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: location.hostname,
    cookie_path: '/',
  });
  gtag('event', 'page_view', { content_group: contentGroup });
  const script = document.createElement('script');
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + config.measurementId;
  document.head.append(script);
  function send(name, parameters = {}) {
    if (window['ga-disable-' + config.measurementId]) return;
    gtag('event', name, { content_group: contentGroup, ...parameters });
  }
  const placement = (element) => element.closest('header') ? 'header'
    : element.closest('footer') ? 'footer' : element.closest('.side, .side-mobile') ? 'sidebar'
      : element.closest('.hero') ? 'hero' : element.closest('#start') ? 'start' : 'body';
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (link) {
      let url;
      try { url = new URL(link.getAttribute('href'), location.href); } catch { return; }
      const context = { link_placement: placement(link) };
      if (url.origin === location.origin) {
        const destination = canonicalPath(url.pathname);
        if (url.hash === '#start' && destination === pagePath) send('start_click', context);
        else if (destination !== pagePath && destination !== '/404') {
          const name = ['/docs/self-hosting', '/docs/mcp'].includes(destination) ? 'guide_click' : 'internal_link_click';
          send(name, { ...context, destination_path: destination });
        }
      } else if (url.hostname === 'github.com' && /^\/arrenem\/opentax(?:\/|$)/i.test(url.pathname)) {
        const target = /\/issues(?:\/|$)/.test(url.pathname) ? 'issues'
          : /\/blob\/|\/tree\//.test(url.pathname) ? 'source' : 'repository';
        send(target === 'repository' ? 'github_repository_click' : 'github_click', { ...context, github_target: target });
      }
    }
    const job = event.target.closest('[data-job]');
    if (job && /^[0-5]$/.test(job.dataset.job)) send('demo_select', { demo_index: Number(job.dataset.job) });
  });
  // Fired only after successful clipboard write; never include the copied content.
  document.addEventListener('opentax:code-copied', () => send('code_copy'));
})();
