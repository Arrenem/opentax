#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fields, PLAN_VERSION, validateConfig, buildPlan, planHash, doctor } from './plan.mjs';
import { loadState, saveState } from './state.mjs';
import { lockDirectory } from './execution-state.mjs';

let prompt;
let unlock;
try {
  const { values } = parseArgs({ options: {
    'dry-run': { type: 'boolean' }, resume: { type: 'boolean' }, doctor: { type: 'boolean' },
    apply: { type: 'boolean' }, verify: { type: 'boolean' }, config: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('npm run setup -- [--dry-run] [--config <JSON>] [--resume] [--apply | --verify | --doctor]\nDefault: local plan, then optional interactive provisioning. --apply resumes consent-gated provisioning. --verify inspects live resources and offers explicit synthetic checks. --doctor is offline, never a live success proof. --dry-run writes nothing and never logs in.');
  } else {
    if ((values.apply || values.verify) && (!process.stdin.isTTY || values['dry-run'] || values.doctor)) throw new Error('LIVE_REQUIRES_INTERACTIVE_CONSENT');
    if (values.apply && values.verify) throw new Error('FLAGS_CONFLICT');
    if (Number(values.resume) + Number(values.doctor) > 1 || (values.config && (values.resume || values.doctor || values.apply || values.verify))) throw new Error('FLAGS_CONFLICT');
    if (!process.stdin.isTTY && !values['dry-run'] && !values.doctor) throw new Error('INTERACTIVE_REQUIRED_USE_DRY_RUN');
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('NODE_22_REQUIRED');
    const directory = '.opentax';
    if (!values['dry-run'] && !values.doctor && process.stdin.isTTY) unlock = await lockDirectory(directory);
    const readSaved = () => loadState(directory);
    let state;
    if (values.resume || values.doctor || values.apply || values.verify) state = await readSaved();
    else {
      try { await readSaved(); throw new Error('STATE_EXISTS_USE_RESUME'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      state = { version: PLAN_VERSION, revision: 0, phase: 'draft', config: values.config ? validateConfig(JSON.parse(await readFile(values.config, 'utf8'))) : {} };
    }
    if (values.doctor) {
      if (state.phase !== 'planned') throw new Error('PLAN_INCOMPLETE_USE_RESUME');
      console.log(JSON.stringify(doctor(buildPlan(state.config)), null, 2));
      process.exitCode = 2;
    } else {
      console.log('OpenTax セットアップ計画（未リリース / オフライン）。クラウド操作は後段の工程ごとの同意後にだけ実行します。秘密鍵・パスワード・トークンは入力しないでください。');
      for (const [key, label] of fields) {
        if (state.config[key] !== undefined) continue;
        if (!process.stdin.isTTY) throw new Error('CONFIG_REQUIRED_NONINTERACTIVE');
        prompt ??= createInterface({ input: process.stdin, output: process.stdout });
        const answer = await prompt.question(`${label}: `);
        state.config = validateConfig({ ...state.config, [key]: answer }, true);
        if (!values['dry-run']) state = await saveState(directory, state, { expectedRevision: state.revision });
      }
      const plan = buildPlan(state.config);
      console.log(JSON.stringify(plan, null, 2));
      if (!values['dry-run'] && state.phase !== 'planned') {
        if (!process.stdin.isTTY) throw new Error('SAVE_REQUIRES_INTERACTIVE_CONFIRMATION_USE_DRY_RUN');
        prompt ??= createInterface({ input: process.stdin, output: process.stdout });
        const approval = await prompt.question('課金先・地域・権限・費用の計画を確認して保存: SAVE PLAN と入力 (実行の許可にはなりません): ');
        if (approval !== 'SAVE PLAN') throw new Error('PLAN_NOT_CONFIRMED');
        state = { ...state, phase: 'planned', planHash: planHash(plan) };
        state = await saveState(directory, state, { expectedRevision: state.revision });
      }
      if (!values['dry-run']) {
        prompt ??= createInterface({ input: process.stdin, output: process.stdout });
        const start = values.apply || values.verify || (await prompt.question(`実クラウド構築へ進む場合は BUILD ${state.config.projectId} と入力。Enter は計画のみで終了: `)) === `BUILD ${state.config.projectId}`;
        if (start) {
          const consent = async details => { console.log(JSON.stringify(details, null, 2)); return (await prompt.question(`この工程に同意する場合は YES ${details.id}: `)) === `YES ${details.id}`; };
          const { runLiveSetup } = await import('./live.mjs');
          const result = await runLiveSetup({ plan, directory, consent, verifyOnly: !!values.verify, announce: url => console.log(`本人がブラウザで開いて操作してください: ${url}`) });
          console.log(JSON.stringify(result, null, 2));
          if (!result.ready) process.exitCode = 2;
        } else console.log('計画を保存しました。クラウド操作なし。npm run setup -- --apply で開始できます。');
      } else console.log('Dry-run 完了。保存・ログイン・クラウド操作なし。');
    }
  }
} catch (error) {
  // Do not echo input, credential material, file contents or SDK error bodies.
  const code = /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'SETUP_INPUT_OR_STATE_ERROR';
  console.error(`${code}: ローカル計画は --resume で再開。入力・保存状態を確認してください。実行済み工程を保全して停止しました。自動削除は行いません。apply 中の失敗は次回の資源照合後に再開します。`);
  process.exitCode = 1;
} finally { prompt?.close(); await unlock?.(); }
