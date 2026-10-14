// Offline only: no SDK, credential discovery, shell commands or cloud mutations.
import { createHash } from 'node:crypto';

export const PLAN_VERSION = 2;
export const fields = [
  ['projectId', '新規の専用プロジェクト ID (6–30文字)'],
  ['googleAccount', '利用予定の Google アカウント (メール、ログインは別工程)'],
  ['billingAccount', '課金アカウント ID (XXXXXX-XXXXXX-XXXXXX、秘密情報は入力しない)'],
  ['region', '保存・実行リージョン (初期対応: asia-northeast1)'],
  ['ownerUid', 'Firebase 所有者 UID (未作成なら pending)'],
];

export function validateConfig(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CONFIG_INVALID');
  const validators = {
    projectId: v => /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(v),
    googleAccount: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254,
    billingAccount: v => /^[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$/.test(v),
    region: v => v === 'asia-northeast1',
    ownerUid: v => v === 'pending' || (v.length > 0 && v.length <= 128 && !/[\s\x00-\x1f\x7f]/.test(v)),
  };
  if (Object.keys(input).some(key => !Object.hasOwn(validators, key))) throw new Error('CONFIG_UNKNOWN_FIELD');
  const config = {};
  for (const [key] of fields) {
    if (partial && input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || !validators[key](input[key])) throw new Error(`CONFIG_INVALID_${key.toUpperCase()}`);
    config[key] = input[key];
  }
  return config;
}

export function buildPlan(input) {
  const config = validateConfig(input);
  const { projectId, region } = config;
  const runtime = `opentax-runtime@${projectId}.iam.gserviceaccount.com`;
  const steps = [
    { id: 'identity', resource: config.googleAccount, action: '本人が Google にログインし、選択アカウントとプロジェクト作成権限を確認。認証情報は CLI に入力しない。' },
    { id: 'project', resource: projectId, action: '新規専用プロジェクトを作成し Firebase を有効化。同じ設置 ID の資源だけ再開。無関係な既存 ID は拒否。' },
    { id: 'billing', resource: config.billingAccount, action: '課金先・Blaze 条件・料金を本人が実行時に明示確認して紐付け。' },
    { id: 'apis', resource: projectId, action: 'Firebase / Auth / Firestore / Storage / Cloud Run / Cloud Build / Artifact Registry / IAM Credentials API の必要性と権限をプレビュー。' },
    { id: 'database', resource: `${projectId}/(default)@${region}`, action: 'Native Firestore と索引を作成。既存 DB の地域・モード不一致なら停止。' },
    { id: 'storage', resource: `${projectId}-opentax-evidence@${region}`, action: '専用バケットを作成。存在・地域・公開アクセス禁止・設置 IDを照合し、既存データを上書きしない。' },
    { id: 'auth', resource: `${projectId}/opentax-web`, action: 'Web app の既存 ID を照合・再利用。Google 認証だけ設定し、メール/パスワード・匿名認証は無効。所有者を本人ログインで確定。' },
    { id: 'runtime-iam', resource: runtime, action: '実行専用 SA を作成。DB 利用、専用バケット操作、同一 SA に対する signBlob のみ。鍵ファイルは生成しない。' },
    { id: 'rules', resource: projectId, action: 'Firestore/Storage のクライアント直接アクセス拒否ルールと索引を差分確認後に配置。既存ルールは無確認で上書きしない。' },
    { id: 'deploy', resource: `${projectId}/${region}/opentax`, action: '固定 source revision とロックで会計 Next.js を Cloud Run にビルド。公開 Firebase 設定はビルド時、ADC/owner 制限は実行時。所有者未確定なら停止。' },
    { id: 'domains', resource: `${projectId}/auth-domains`, action: '取得した実際の HTTPS URL を承認済みドメインと OPENTAX_PUBLIC_URL に設定。URL を推測しない。' },
    { id: 'acceptance', resource: projectId, action: '隔離した合成データで DB、証憑署名読取、他 UID 拒否、合成データの復元、MCP のスコープを検証。MCP 同意は別操作。' },
  ].map(step => ({ ...step, status: 'not-executed', requiresActionTimeConsent: true }));
  return {
    version: PLAN_VERSION, mode: 'offline-preview', config,
    costPreview: ['Blaze と課金紐付けが必要。無料を保証しません。', 'Cloud Run、Cloud Build、Artifact Registry、Firestore、Storage/転送、バックアップが費用要素です。', '月額は未算定。予算アラートや Cloud Run の最大台数は総額の支出上限ではありません。'],
    permissions: [
      { principal: '本人/構築用ID', scope: '承認された新規プロジェクトと課金アカウント', purpose: 'project create / billing link / API enable / Firebase Auth & Web app configuration / DB & bucket create / rules & index deploy / build & deploy / IAM policy changes。必要な変更権限を工程ごとに表示。組織固有の制約は別途検証が必要。Owner/Editor を一括付与しない。' },
      { principal: runtime, scope: `projects/${projectId}`, purpose: 'roles/datastore.user (専用プロジェクトの DB データ操作。管理・課金権限なし)' },
      { principal: runtime, scope: `buckets/${projectId}-opentax-evidence`, purpose: 'roles/storage.objectUser (証憑の作成・読取・更新・削除。バケット管理権限なし)' },
      { principal: runtime, scope: `serviceAccounts/${runtime}`, purpose: 'iam.serviceAccounts.signBlob のみのカスタムロールをこの SA 自身に限定。project-wide Token Creator は付与しない。実クラウドで要検証。' },
    ],
    runtimeEnvironment: { FIREBASE_ADMIN_PROJECT_ID: projectId, OPENTAX_ACCESS_MODE: 'owner', ...(config.ownerUid === 'pending' ? {} : { OPENTAX_OWNER_UID: config.ownerUid }) },
    steps,
  };
}

export const planHash = plan => createHash('sha256').update(JSON.stringify(plan)).digest('hex');
export const acceptanceChecks = ['database-roundtrip', 'evidence-upload-signed-read', 'owner-login', 'other-owner-denied', 'mcp-read-and-scope-denial', 'backup-restore'];
export function doctor(plan) {
  // Local validation never constitutes live readiness or user consent.
  if (JSON.stringify(plan) !== JSON.stringify(buildPlan(plan.config))) throw new Error('PLAN_MISMATCH');
  return { ready: false, mode: 'offline-preview', configuration: 'valid',
    blockers: ['LIVE_VERIFICATION_REQUIRED', ...(plan.config.ownerUid === 'pending' ? ['OWNER_UID_PENDING'] : [])],
    checks: acceptanceChecks.map(id => ({ id, status: 'not-run' })),
    instanceUrl: null, mcpUrl: null };
}
