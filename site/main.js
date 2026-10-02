(() => {
  const root = document.documentElement;
  root.classList.remove('no-js');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Nav border on scroll
  const nav = document.querySelector('[data-nav]');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Reveal on scroll
  const reveals = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  }

  // Hero demo: CLI agent × OpenTax GUI, three scenes on a loop
  const demo = document.querySelector('[data-demo]');
  if (demo) {
    const $ = (sel) => demo.querySelector(sel);
    const $$ = (sel) => [...demo.querySelectorAll(sel)];
    const termEl = $('[data-term]');
    const mainEl = $('[data-app-main]');
    const steps = $$('[data-step]');
    const cursor = $('[data-cursor]');
    const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

    const CANCEL = Symbol('cancel');
    let run = 0;        // bumps on every restart; stale timelines reject
    let fast = false;   // replay without delays (jumping to a later scene)
    let paused = true;  // off-screen or tab hidden

    const wait = (ms) => new Promise((resolve, reject) => {
      const token = run;
      if (fast) return token === run ? resolve() : reject(CANCEL);
      let left = ms;
      let last = performance.now();
      const tick = () => {
        if (token !== run) return reject(CANCEL);
        const now = performance.now();
        if (!paused) left -= now - last;
        last = now;
        if (left <= 0) resolve(); else setTimeout(tick, Math.min(left, 120));
      };
      setTimeout(tick, Math.min(ms, 120));
    });

    const tween = async (ms, fn) => {
      if (fast) { fn(1); return; }
      const frames = Math.max(1, Math.round(ms / 40));
      for (let f = 1; f <= frames; f += 1) { fn(f / frames); await wait(40); }
    };

    // ── Terminal
    const line = (html, cls = '') => {
      const el = document.createElement('div');
      el.className = `tl ${cls}`;
      el.innerHTML = html;
      termEl.append(el);
      while (termEl.children.length > 40) termEl.firstChild.remove();
      return el;
    };
    const gap = () => line('', 'tl--gap');
    const prompt = async (text, file) => {
      const el = line('', 'tl--user');
      const head = '<span class="t-prompt">&gt;</span> ';
      for (let i = 1; i <= text.length; i += 1) {
        el.innerHTML = head + text.slice(0, i).replace(/\n/g, '\n  ') + '<span class="caret"></span>';
        await wait(text[i - 1] === '\n' ? 180 : 42);
      }
      el.innerHTML = head + text.replace(/\n/g, '\n  ') + (file ? `\n  <span class="t-file">⎘ ${file}</span>` : '');
      await wait(450);
    };
    const tool = async (fn, args, ms = 900) => {
      const el = line(`<span class="t-tool is-run">⏺</span> <span class="t-fn">opentax.${fn}</span>${args ? ` <span class="t-dim">${args}</span>` : ''}`);
      await wait(ms);
      el.firstChild.classList.remove('is-run');
    };
    const out = (html) => line(`<span class="t-dim">⎿</span> ${html}`, 'tl--sub');
    const say = (html) => line(`<span class="t-tool">⏺</span> ${html}`, 'tl--reply');

    // ── GUI
    const navs = $$('[data-nav]');
    const urlEl = $('[data-url]');
    const badge = $('[data-badge]');
    const PATHS = { review: '/review', evidence: '/documents', billing: '/billing/inv-2026-0012' };
    const show = (view) => {
      $$('[data-view]').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
      navs.forEach((n) => n.classList.toggle('is-active', n.dataset.nav === view));
      urlEl.textContent = `opentax.example.com${PATHS[view]}`;
    };
    const setBadge = (n) => {
      badge.hidden = n === 0;
      badge.textContent = n;
      badge.classList.remove('is-bump');
      void badge.offsetWidth;
      badge.classList.add('is-bump');
    };
    const rowsEl = $('[data-rows]');
    const moreEl = $('[data-rows-more]');
    const countAll = $('[data-count-all]');
    const countFlag = $('[data-count-flag]');
    const row = (r) => {
      const li = document.createElement('li');
      if (r.flag) li.className = 'is-flag';
      if (r.fresh) li.className = 'is-new';
      li.innerHTML = `<span class="date num">${r.date}</span><span class="desc"><b>${r.name}</b><small>${r.acct}</small></span>`
        + `<span class="amt num">${r.amt}</span><span class="mk">${r.flag ? '!' : r.fresh ? '+' : '✓'}</span>`;
      return li;
    };
    const moveCursor = async (el) => {
      const box = mainEl.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      cursor.style.setProperty('--x', `${r.left - box.left + r.width * 0.55}px`);
      cursor.style.setProperty('--y', `${r.top - box.top + r.height * 0.55}px`);
      cursor.classList.add('is-on');
      await wait(1000);
    };

    const reset = () => {
      termEl.innerHTML = '';
      termEl.append(Object.assign(document.createElement('div'), { className: 'tl', innerHTML: '<span class="t-dim">$</span> claude' }));
      gap();
      rowsEl.innerHTML = '';
      moreEl.textContent = '';
      countAll.textContent = '0';
      countFlag.textContent = '0';
      badge.hidden = true;
      $$('.ev__paper, [data-ev-field], [data-ev-link], .inv > *, [data-inv-line], .inv__actions, [data-toast]')
        .forEach((el) => el.classList.remove('is-in'));
      $('[data-inv-sub]').textContent = yen(0);
      $('[data-inv-tax]').textContent = yen(0);
      $('[data-inv-total]').textContent = yen(0);
      const status = $('[data-inv-status]');
      status.textContent = '下書き';
      status.className = 'pill';
      const issue = $('[data-inv-issue]');
      issue.textContent = '発行する';
      issue.className = 'inv__issue';
      cursor.classList.remove('is-on');
      show('review');
    };

    const BANK = [
      { date: '09/01', name: '事務所家賃', acct: '地代家賃 / 普通預金', amt: '¥88,000' },
      { date: '09/03', name: 'AWS', acct: '通信費 / 普通預金', amt: '¥4,812' },
      { date: '09/10', name: '合同会社ミナト', acct: '普通預金 / 売掛金', amt: '¥220,000' },
      { date: '09/14', name: 'ヨドバシカメラ', acct: '消耗品費？ 工具器具備品？', amt: '¥38,280', flag: true },
      { date: '09/22', name: 'Adobe', acct: '通信費 / 普通預金', amt: '¥7,780' },
    ];

    const SCENES = [
      // 1. 銀行明細をまとめて登録
      async (progress) => {
        show('review');
        await prompt('9月の銀行明細。全部登録しておいて。', 'bank-2026-09.csv');
        progress(0.25);
        await tool('get_business_context', '', 700);
        await tool('search_journals', 'period=2026-09', 700);
        const done = tool('create_journals', 'items=37', 2400);
        let shown = 0;
        await tween(2200, (t) => {
          const n = Math.round(37 * t);
          countAll.textContent = n;
          while (shown < BANK.length && shown < Math.ceil(BANK.length * t)) {
            const r = BANK[shown];
            rowsEl.append(row(r));
            if (r.flag) countFlag.textContent = '1';
            shown += 1;
          }
          badge.hidden = n === 0;
          badge.textContent = n;
          moreEl.textContent = n > BANK.length ? `…ほか${n - BANK.length}件` : '';
        });
        await done;
        countFlag.textContent = '4';
        setBadge(37);
        progress(0.65);
        out('<span class="t-ok">✓</span> 37件を確認待ちとして登録しました');
        out('<span class="t-warn">!</span> 4件は判断に迷ったので、メモを残しました');
        await wait(500);
        const flagged = rowsEl.querySelector('.is-flag');
        const note = document.createElement('p');
        note.className = 'note';
        note.textContent = '用途が判別できません。業務用の周辺機器なら消耗品費で登録します。';
        flagged.append(note);
        await wait(700);
        say('レビュー画面で確認してください。');
        progress(1);
        await wait(2600);
      },
      // 2. 領収書を証憑として保存し、仕訳と紐づけ
      async (progress) => {
        gap();
        await prompt('この領収書の支出も登録して。', 'receipt-0928.jpg');
        progress(0.25);
        show('evidence');
        await tool('upload_evidence', 'type=receipt', 900);
        $('.ev__paper').classList.add('is-in');
        await wait(500);
        for (const f of $$('[data-ev-field]')) { f.classList.add('is-in'); await wait(220); }
        progress(0.55);
        await tool('create_journals', 'items=1', 900);
        $('[data-ev-link]').classList.add('is-in');
        setBadge(38);
        countAll.textContent = '38';
        rowsEl.prepend(row({ date: '09/28', name: 'コーヒースタンド', acct: '会議費 / 現金 · 証憑あり', amt: '¥1,320', fresh: true }));
        if (rowsEl.children.length > 5) rowsEl.lastElementChild.remove();
        moreEl.textContent = '…ほか33件';
        out('<span class="t-ok">✓</span> 領収書を保存し、会議費 ¥1,320 の仕訳と紐づけて登録しました');
        progress(1);
        await wait(2600);
      },
      // 3. 案件の請求書を下書き → あなたが発行
      async (progress) => {
        gap();
        await prompt('そういえばWebサイト改修の案件が終わった。\n請求書を発行して。');
        progress(0.2);
        await tool('search_projects', 'q="Webサイト改修"', 800);
        out('株式会社サンプル · 税抜 ¥300,000');
        show('billing');
        await tool('create_billing_draft', 'kind=invoice', 700);
        const parts = $$('.inv > *');
        parts[0].classList.add('is-in');
        await wait(250);
        parts[1].classList.add('is-in');
        for (const l of $$('[data-inv-line]')) { await wait(300); l.classList.add('is-in'); }
        parts[2].classList.add('is-in');
        await tween(700, (t) => {
          $('[data-inv-sub]').textContent = yen(300000 * t);
          $('[data-inv-tax]').textContent = yen(30000 * t);
          $('[data-inv-total]').textContent = yen(330000 * t);
        });
        $('.inv__actions').classList.add('is-in');
        progress(0.55);
        out('<span class="t-ok">✓</span> 請求書の下書きを作成しました（合計 ¥330,000）');
        say('発行はOpenTaxの画面から行ってください。');
        await wait(900);
        const issue = $('[data-inv-issue]');
        await moveCursor(issue);
        issue.classList.add('is-press');
        await wait(180);
        issue.classList.remove('is-press');
        issue.classList.add('is-done');
        issue.textContent = '発行済み';
        const status = $('[data-inv-status]');
        status.textContent = '発行済み';
        status.className = 'pill pill--ok';
        $('[data-toast]').classList.add('is-in');
        progress(1);
        await wait(900);
        cursor.classList.remove('is-on');
        await wait(2600);
        $('[data-toast]').classList.remove('is-in');
      },
    ];

    const select = (idx) => steps.forEach((s, i) => {
      s.setAttribute('aria-selected', String(i === idx));
      s.classList.toggle('is-done', i < idx);
      s.querySelector('.demo__bar i').style.transform = `scaleX(${i < idx ? 1 : 0})`;
    });
    const progressFor = (idx) => (p) => {
      steps[idx].querySelector('.demo__bar i').style.transform = `scaleX(${p})`;
    };

    const play = async (from) => {
      run += 1;
      const token = run;
      reset();
      try {
        fast = true;
        for (let i = 0; i < from; i += 1) await SCENES[i](() => {});
        fast = reduced;
        for (let i = from; ; i = (i + 1) % SCENES.length) {
          if (i === 0 && i !== from) reset();
          select(i);
          await SCENES[i](progressFor(i));
          if (reduced) return;
        }
      } catch (e) {
        if (e !== CANCEL) throw e;
      } finally {
        if (token === run) fast = false;
      }
    };

    steps.forEach((s, i) => s.addEventListener('click', () => { started = true; play(i); }));

    let started = false;
    let inView = false;
    const sync = () => {
      paused = !inView || document.hidden;
      if (!paused && !started) { started = true; play(0); }
    };
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { threshold: 0.25 }).observe(demo);
    } else {
      inView = true;
      sync();
    }
  }

  // Jobs tabs
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fmt = (obj) => esc(JSON.stringify(obj, null, 2))
    .replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="s">"$1"</span>')
    .replace(/: (-?\d[\d.]*|true|false)/g, ': <span class="n">$1</span>');

  const JOBS = [
    {
      tool: 'create_journals', scope: '仕訳の作成',
      args: { journals: [
        { transactionDate: '2026-09-14', debitAccount: '消耗品費', debitAmount: 38280, creditAccount: '普通預金', creditAmount: 38280,
          counterparty: 'ヨドバシカメラ', description: '周辺機器', taxType: 'standard10', taxIncluded: true,
          reviewNote: '用途が判別できないため要確認' },
        '…ほか36件',
      ] },
      result: '37件を確認待ちとして登録。誤りがあれば1件ずつ理由付きで返します。',
    },
    {
      tool: 'create_billing_draft', scope: '帳票の下書き',
      args: { kind: 'invoice', projectId: 'prj_webrenewal', issueDate: '2026-09-30', dueDate: '2026-10-31',
        lineItems: [{ description: 'Webサイト改修 9月分', quantity: 1, unitPrice: 300000, taxType: 'standard10', priceMode: 'exclusive', withholding: false }] },
      result: '請求書の下書きを作成。小計・消費税・合計はOpenTaxが計算します。',
    },
    {
      tool: 'upload_evidence', scope: '証憑の登録',
      args: { file_path: '~/Downloads/receipt-0914.pdf', documentType: 'receipt', transactionDate: '2026-09-14',
        counterparty: 'ヨドバシカメラ', amount: 38280 },
      result: '領収書のファイルを、AIが読み取った日付・金額・取引先と一緒に保管します。',
    },
    {
      tool: 'get_profit_and_loss', scope: '読み取り',
      args: { fiscalYear: 2026 },
      result: '確定済みの仕訳から、今年の損益を集計して返します。',
    },
    {
      tool: 'get_tax_return_preview', scope: '読み取り',
      args: { fiscalYear: 2026 },
      result: '帳簿をもとに、申告内容の見込みを返します。申告の前には必ずご自身で確認してください。',
    },
    {
      tool: 'create_fixed_asset', scope: '固定資産の編集',
      args: { name: 'MacBook Pro', acquiredOn: '2026-09-20', acquisitionCost: 298800, usefulLifeYears: 4,
        method: 'straight_line', businessUseRatio: 80 },
      result: '固定資産台帳に登録。減価償却は決まったルールで計算します。',
    },
  ];

  const jobs = document.querySelector('[data-jobs]');
  if (jobs) {
    const tabs = jobs.querySelectorAll('[data-job]');
    const toolEl = jobs.querySelector('[data-job-tool]');
    const scopeEl = jobs.querySelector('[data-job-scope]');
    const codeEl = jobs.querySelector('[data-job-code]');
    const resultEl = jobs.querySelector('[data-job-result]');
    const render = (idx) => {
      const job = JOBS[idx];
      toolEl.textContent = job.tool;
      scopeEl.textContent = `権限：${job.scope}`;
      codeEl.innerHTML = fmt(job.args).replace('"…ほか36件"', '<span class="k">…ほか36件</span>');
      resultEl.textContent = job.result;
    };
    const select = (idx) => {
      tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === idx)));
      if (reduced) { render(idx); return; }
      jobs.classList.add('is-switching');
      setTimeout(() => { render(idx); jobs.classList.remove('is-switching'); }, 180);
    };
    tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
    render(0);
  }

  // Copy buttons
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.parentElement.querySelector('code').innerText;
      try {
        await navigator.clipboard.writeText(text);
        document.dispatchEvent(new Event('opentax:code-copied'));
        btn.textContent = 'コピーしました';
      } catch {
        btn.textContent = 'コピーできませんでした';
      }
      setTimeout(() => { btn.textContent = 'コピー'; }, 1400);
    });
  });
})();
