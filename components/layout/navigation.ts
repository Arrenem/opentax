import type { IconName } from '@/components/ui/Icon';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  /** 使う頻度の目安。ナビゲーション上で階層の意味を伝える */
  cadence?: string;
  items: NavItem[];
}

/** 毎日使う画面。サイドバー最上段とモバイルのタブバーに置く */
export const DAILY_NAV: NavItem[] = [
  { href: '/', label: 'ホーム', icon: 'home', description: '今日やること' },
  { href: '/review', label: 'レビュー', icon: 'review', description: 'Agentの仕訳を確定' },
  { href: '/journals', label: '仕訳帳', icon: 'journal', description: '取引の一覧と手入力' },
  { href: '/documents', label: '証憑', icon: 'evidence', description: '領収書・請求書の保存' },
];

/** 頻度の低い画面。グループとしてまとめ、モバイルでは「メニュー」の下に置く */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'billing',
    label: '請求',
    cadence: '取引ごと',
    items: [
      { href: '/billing', label: '帳票', icon: 'billing', description: '見積書・請求書・領収書' },
      { href: '/projects', label: '案件', icon: 'project', description: '顧客ごとの仕事' },
      { href: '/customers', label: '顧客', icon: 'customers', description: '帳票の発行先' },
    ],
  },
  {
    id: 'reports',
    label: 'レポート',
    cadence: '月次',
    items: [
      { href: '/reports/pl', label: '損益計算書', icon: 'chart', description: '売上・経費・所得' },
      { href: '/reports/bs', label: '貸借対照表', icon: 'balance', description: '資産・負債・資本' },
      { href: '/ledger', label: '総勘定元帳', icon: 'ledger', description: '勘定科目ごとの明細' },
    ],
  },
  {
    id: 'closing',
    label: '決算・申告',
    cadence: '年次',
    items: [
      { href: '/tax-return', label: '確定申告', icon: 'tax', description: '所得税・消費税・控除' },
      { href: '/assets', label: '固定資産', icon: 'asset', description: '減価償却' },
      { href: '/export', label: 'エクスポート', icon: 'download', description: 'e-Tax XTX・CSV' },
    ],
  },
  {
    id: 'settings',
    label: '設定',
    items: [
      { href: '/settings', label: '事業設定', icon: 'settings', description: '事業者情報・申告区分' },
      { href: '/agent-connections', label: 'Agent接続', icon: 'agent', description: 'MCPトークンと権限' },
    ],
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 現在のパスが属するグループ（DAILY_NAV の画面なら undefined） */
export function findNavGroup(pathname: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.items.some((item) => isActivePath(pathname, item.href)));
}

/** 新規作成のショートカット。サイドバーとタブバー中央の「＋」から開く */
export const QUICK_ACTIONS: Array<NavItem & { tone: string }> = [
  { href: '/documents?upload=1', label: '証憑を追加', icon: 'camera', description: 'レシートや請求書を撮影・アップロード', tone: 'bg-accent/10 text-accent' },
  { href: '/journals?new=1', label: '仕訳を入力', icon: 'pencil', description: '手入力で取引を記録', tone: 'bg-positive/10 text-positive' },
  { href: '/billing/new?kind=invoice', label: '請求書を作成', icon: 'billing', description: '案件から請求書を発行', tone: 'bg-[#af52de]/10 text-[#af52de]' },
  { href: '/billing/new?kind=estimate', label: '見積書を作成', icon: 'send', description: '案件から見積書を発行', tone: 'bg-warning/10 text-warning' },
];
