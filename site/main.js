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

  // Terminal: replay the demo line by line
  const term = document.querySelector('[data-term] code');
  if (term && !reduced) {
    const lines = term.innerHTML.split('\n');
    const caret = '<span class="caret"></span>';
    let i = 0;
    let started = false;
    term.innerHTML = caret;
    const step = () => {
      i += 1;
      term.innerHTML = lines.slice(0, i).join('\n') + (i < lines.length ? caret : '');
      if (i < lines.length) {
        const prev = lines[i - 1];
        const delay = prev.includes('⏺') ? 520 : prev.trim() === '' ? 160 : 260;
        setTimeout(step, delay);
      }
    };
    const start = () => { if (!started) { started = true; setTimeout(step, 500); } };
    if ('IntersectionObserver' in window) {
      const tio = new IntersectionObserver(([e]) => { if (e.isIntersecting) { start(); tio.disconnect(); } });
      tio.observe(term);
    } else {
      start();
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
