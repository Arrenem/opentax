import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../site/analytics.js', import.meta.url), 'utf8');
const settings = JSON.parse(await readFile(new URL('../site/analytics-settings.json', import.meta.url), 'utf8'));
function harness({ consent = '', url = 'https://opentax.fragmentware.com/', referrer = '', blocked = false, dnt = false, storageError = false } = {}) {
  const location = new URL(url);
  location.reload = () => { location.reloaded = true; };
  const listeners = {};
  const status = { setAttribute() {}, querySelector: () => ({}), addEventListener: (name, fn) => { listeners['consent:' + name] = fn; } };
  const scripts = [];
  const document = {
    referrer, cookie: '', createElement: (tag) => tag === 'div' ? status : {},
    body: { append() {} }, head: { append: (script) => scripts.push(script) },
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  const window = { addEventListener: (name, fn) => { listeners['window:' + name] = fn; }, opentaxAnalytics: { ...settings, publicPaths: ['/', '/privacy', '/404', '/docs/', '/docs/self-hosting', '/docs/mcp', '/articles/example'] } };
  const storage = { getItem: () => { if (storageError) throw Error(); return consent; }, setItem() {} };
  const context = vm.createContext({ document, window, location, localStorage: storage, navigator: { globalPrivacyControl: blocked, doNotTrack: dnt ? '1' : '0' }, URL, URLSearchParams, Set, Date });
  vm.runInContext(source, context);
  const calls = () => (window.dataLayer || []).map((args) => Array.from(args));
  const choose = (value) => listeners['consent:click']({ target: { closest: () => ({ dataset: { consent: value } }) } });
  const click = (href, region = '') => listeners.click({ target: { closest: (selector) => selector === 'a[href]' ? {
    getAttribute: () => href, closest: (selector) => selector === region ? {} : null,
  } : null } });
  return { window, scripts, calls, choose, click, listeners, document, context, location };
}

test('no consent / denial / DNT / preview / unavailable storage never load Google', () => {
  for (const options of [{}, { consent: 'denied' }, { consent: 'granted', blocked: true }, { consent: 'granted', dnt: true }, { consent: 'granted', url: 'https://preview.pages.dev/' }, { consent: 'granted', storageError: true }]) {
    const h = harness(options);
    assert.equal(h.scripts.length, 0);
    assert.equal(h.calls().length, 0);
  }
});
test('single config disables automatic PV and sends one explicit PV, even if initialized twice', () => {
  const h = harness({ consent: 'granted' });
  vm.runInContext(source, h.context);
  h.choose('granted');
  assert.equal(h.scripts.length, 1);
  assert.equal(h.scripts[0].referrerPolicy, 'no-referrer');
  assert.equal(h.calls().find(([name]) => name === 'config')[2].send_page_view, false);
  assert.equal(h.calls().filter(([name, event]) => name === 'event' && event === 'page_view').length, 1);
});
test('removes PII queries/hash, unknown paths, external referrer path and search terms', () => {
  const h = harness({ consent: 'granted', url: 'https://opentax.fragmentware.com/person@example.com?email=person@example.com&utm_source=person@example.com&utm_campaign=person@example.com&utm_term=private#secret', referrer: 'https://www.google.com/search?q=private&email=person@example.com' });
  const config = h.calls().find(([name]) => name === 'config')[2];
  assert.equal(config.page_location, 'https://opentax.fragmentware.com/404');
  assert.equal(config.page_title, '/404');
  assert.equal(config.page_referrer, 'https://www.google.com/');
  assert.equal(config.campaign_source, '');
  assert.equal(config.campaign_name, '');
  assert.equal(config.campaign_term, '');
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.ok(!JSON.stringify(h.calls()).includes('person@example.com'));
});
test('preserves controlled X/Tsukutta campaigns and source article → guide → GitHub funnel', () => {
  for (const sourceName of ['x', 'tsukutta']) {
    const h = harness({ consent: 'granted', url: `https://opentax.fragmentware.com/articles/example?utm_source=${sourceName}&utm_medium=social&utm_campaign=launch&utm_content=post` });
    const config = h.calls().find(([name]) => name === 'config')[2];
    assert.equal(config.campaign_source, sourceName);
    assert.equal(config.campaign_name, 'launch');
    assert.equal(config.campaign_content, 'post');
    h.click('/docs/self-hosting?private=secret#secret');
    h.click('https://github.com/arrenem/opentax?private=secret#secret', 'header');
    const events = h.calls().filter(([name]) => name === 'event');
    assert.equal(events[1][1], 'guide_click');
    assert.equal(events[1][2].content_group, 'article');
    assert.equal(events[1][2].destination_path, '/docs/self-hosting');
    assert.equal(events[2][1], 'github_repository_click');
    assert.equal(events[2][2].github_target, 'repository');
    assert.equal(events[2][2].link_placement, 'header');
    assert.ok(!JSON.stringify(events).includes('secret'));
  }
});
test('unrecognized external / unknown internal URLs are ignored and successful copy carries no content', () => {
  const h = harness({ consent: 'granted' });
  h.click('https://github.com/arrenem/opentax-other');
  h.click('https://example.com/private');
  h.click('/private/person@example.com');
  h.listeners['opentax:code-copied']({ detail: 'private copied code' });
  assert.equal(h.calls().filter(([name]) => name === 'event').length, 2);
  assert.ok(!JSON.stringify(h.calls()).includes('private'));
});
test('opt-in starts once; withdrawal disables subsequent events and removes cookies', () => {
  const h = harness();
  h.choose('granted');
  h.click('/docs/mcp');
  h.document.cookie = '_ga=test; _ga_HWFFMYR32H=test';
  h.choose('denied');
  const before = h.calls().length;
  h.click('/docs/self-hosting');
  h.listeners['opentax:code-copied']({});
  assert.equal(h.calls().length, before);
  assert.equal(h.window['ga-disable-G-HWFFMYR32H'], true);
  assert.ok(h.document.cookie.includes('Max-Age=0'));
  h.choose('granted');
  assert.equal(h.location.reloaded, true);
  assert.equal(h.scripts.length, 1);
});
test('withdrawal in another tab or storage clearing stops this tab', () => {
  const h = harness({ consent: 'granted' });
  h.listeners['window:storage']({ key: null, newValue: null });
  const before = h.calls().length;
  h.click('/docs/self-hosting');
  assert.equal(h.calls().length, before);
  assert.equal(h.window['ga-disable-G-HWFFMYR32H'], true);
});
test('build injects exactly once in every output page and manifest matches pages', async () => {
  const out = new URL('../site/dist/', import.meta.url);
  const files = [];
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(item.name + (item.isDirectory() ? '/' : ''), dir);
      if (item.isDirectory()) await walk(url);
      else if (item.name.endsWith('.html')) files.push(url);
    }
  }
  await walk(out);
  assert.ok(files.length >= 12);
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    assert.equal(html.match(/src="\/analytics\.js"/g)?.length, 1);
    assert.equal(html.match(/src="\/analytics-config\.js"/g)?.length, 1);
    assert.ok(!html.includes('googletagmanager'));
  }
  const configContext = { window: {} };
  vm.runInNewContext(await readFile(new URL('analytics-config.js', out), 'utf8'), configContext);
  assert.equal(configContext.window.opentaxAnalytics.publicPaths.length, files.length);
});
