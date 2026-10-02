/* Public static site only. No DOM text, copied code, query, hash, or user input is sent. */
(() => {
  const config = window.opentaxAnalytics;
  if (!config?.campaignAllowlist || location.hostname !== 'opentax.fragmentware.com' || window.opentaxAnalyticsInitialized) return;
  window.opentaxAnalyticsInitialized = true;
  const key = 'opentax-lp-analytics-consent-v1';
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
  let consent = '';
  try { consent = localStorage.getItem(key) || ''; } catch { /* Storage unavailable: default off. */ }
  const blocked = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  let started = false;
  let active = false;
  const status = document.createElement('div');
  status.className = 'analytics-consent';
  status.setAttribute('role', 'region');
  status.setAttribute('aria-label', 'アクセス解析の設定');
  status.innerHTML = '<p>この公開サイトでは、同意した場合にGoogle AnalyticsのCookieで閲覧・導線を分析します。会計データや入力内容は送信しません。<a href="/privacy">プライバシー</a></p><div><button type="button" data-consent="granted">同意する</button><button type="button" data-consent="denied">同意しない</button><span role="status" aria-live="polite"></span></div>';
  document.body.append(status);
  const feedback = status.querySelector('[role="status"]');
  function gtag() { window.dataLayer.push(arguments); }
  function start() {
    if (started || blocked || !/^G-[A-Z0-9]+$/.test(config.measurementId)) return;
    started = true;
    active = true;
    window.dataLayer = window.dataLayer || [];
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
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
  }
  function updateStatus() {
    feedback.textContent = blocked ? 'ブラウザの追跡拒否設定により計測しません。'
      : consent === 'granted' ? 'アクセス解析に同意済みです。いつでも停止できます。'
        : consent === 'denied' ? 'アクセス解析は停止しています。' : '';
  }
  function applyConsent(next, persist = true) {
    if (next === consent) return;
    consent = next;
    if (persist) {
      try { localStorage.setItem(key, consent); } catch { /* Choice applies to this page only. */ }
    }
    if (consent === 'granted') {
      if (started) {
        // A clean reload avoids replaying prior denied events and issuing a second page_view.
        location.reload();
        return;
      }
      start();
    } else {
      active = false;
      window['ga-disable-' + config.measurementId] = true;
      if (started) gtag('consent', 'update', { analytics_storage: 'denied' });
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.trim().split('=')[0];
        if (name === '_ga' || name.startsWith('_ga_')) {
          document.cookie = name + '=; Max-Age=0; path=/';
          document.cookie = name + '=; Max-Age=0; path=/; domain=' + location.hostname;
        }
      }
    }
    updateStatus();
  }
  status.addEventListener('click', (event) => {
    const button = event.target.closest('[data-consent]');
    if (button) applyConsent(button.dataset.consent);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) {
      applyConsent(event.newValue === 'granted' ? 'granted' : 'denied', false);
    }
  });
  updateStatus();
  if (consent === 'granted') start();
  function send(name, parameters = {}) {
    if (!active || consent !== 'granted') return;
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
