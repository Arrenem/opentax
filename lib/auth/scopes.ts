export const AGENT_SCOPES = ['read', 'journals:write', 'evidence:write', 'contacts:write', 'billing:write', 'assets:write', 'settings:write'] as const;
export type AgentScope = typeof AGENT_SCOPES[number];

export const SCOPE_LABELS: Record<AgentScope, string> = {
  read: '読み取り',
  'journals:write': '仕訳作成・保留中の編集',
  'evidence:write': '証憑の登録・編集',
  'contacts:write': '顧客・案件の編集',
  'billing:write': '帳票下書きの作成・編集',
  'assets:write': '固定資産の編集',
  'settings:write': '事業所設定の編集（振込先口座を除く）',
};
