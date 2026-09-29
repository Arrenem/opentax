'use client';

import { useAuth } from '@/hooks/useAuth';
import { Page, PageHeader, Section } from '@/components/ui/Page';
import { ListGroup, ListRow } from '@/components/ui/List';
import { Button } from '@/components/ui/Button';
import { useLogout } from '@/components/layout/useLogout';
import { DAILY_NAV, NAV_GROUPS } from '@/components/layout/navigation';

const GROUP_TONES: Record<string, string> = {
  daily: 'bg-accent/10 text-accent',
  billing: 'bg-[#af52de]/10 text-[#af52de]',
  reports: 'bg-positive/10 text-positive',
  closing: 'bg-warning/10 text-warning',
  settings: 'bg-fill/[0.14] text-ink-2',
};

export default function MorePage() {
  const { user, isTestUser } = useAuth();
  const handleLogout = useLogout();
  // タブバーに無い日常機能（証憑）もここから辿れるようにする
  const dailyExtras = DAILY_NAV.filter((item) => item.href === '/documents');

  return (
    <Page width="narrow">
      <PageHeader title="メニュー" subtitle="使う頻度ごとにまとめています" />

      <Section title="日々の記録">
        <ListGroup>
          {dailyExtras.map((item) => (
            <ListRow key={item.href} href={item.href} icon={item.icon} iconTone={GROUP_TONES.daily} title={item.label} subtitle={item.description} />
          ))}
        </ListGroup>
      </Section>

      {NAV_GROUPS.map((group) => (
        <Section
          key={group.id}
          title={group.label}
          action={group.cadence && <span className="text-xs text-ink-3">{group.cadence}</span>}
        >
          <ListGroup>
            {group.items.map((item) => (
              <ListRow
                key={item.href}
                href={item.href}
                icon={item.icon}
                iconTone={GROUP_TONES[group.id]}
                title={item.label}
                subtitle={item.description}
              />
            ))}
          </ListGroup>
        </Section>
      ))}

      <Section title="アカウント">
        <ListGroup>
          <ListRow icon="user" title={user?.email ?? '—'} subtitle={isTestUser ? 'テストモード（サンプルデータ）' : 'ログイン中'} />
        </ListGroup>
        <Button variant="danger-tinted" icon="logout" block onClick={handleLogout}>
          ログアウト
        </Button>
      </Section>
    </Page>
  );
}
