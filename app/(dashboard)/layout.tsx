'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { useJournals } from '@/hooks/useJournals';
import { Icon, type IconName } from '@/components/ui/Icon';
import { QuickAddSheet } from '@/components/layout/QuickAddSheet';
import { useLogout } from '@/components/layout/useLogout';
import { DAILY_NAV, NAV_GROUPS, isActivePath, findNavGroup } from '@/components/layout/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isTestUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { journals: pending, refetch: refetchPending } = useJournals({ status: 'pending' });
  const handleLogout = useLogout();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // 画面遷移のたびに確認待ち件数を更新する（レビュー後にバッジを減らすため）
  useEffect(() => {
    void refetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-[2.5px] border-ink/15 border-t-ink/60" />
      </div>
    );
  }

  if (!user) return null;

  const pendingCount = pending.length;
  const inMenuSection = pathname === '/more' || Boolean(findNavGroup(pathname));

  return (
    <div className="min-h-dvh lg:flex">
      {/* ── デスクトップ: サイドバー ───────────────────────── */}
      <aside className="no-print sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-line/[0.06] bg-surface/55 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-2.5 px-6 pb-3 pt-5">
          <Logo />
          {isTestUser && <TestModeChip />}
        </div>

        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-ink text-sm font-medium text-white shadow-control transition hover:bg-ink/85 active:scale-[0.98]"
          >
            <Icon name="plus" size={18} strokeWidth={2.2} />
            新規作成
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3 pt-1" aria-label="メインナビゲーション">
          <ul className="space-y-0.5">
            {DAILY_NAV.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActivePath(pathname, item.href)}
                badge={item.href === '/review' ? pendingCount : undefined}
                prominent
              />
            ))}
          </ul>

          {NAV_GROUPS.filter((g) => g.id !== 'settings').map((group) => (
            <div key={group.id}>
              <p className="mb-1 flex items-baseline justify-between px-3 text-[12px] font-semibold text-ink-3">
                <span>{group.label}</span>
                {group.cadence && <span className="font-normal text-ink-3/80">{group.cadence}</span>}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActivePath(pathname, item.href)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-line/[0.06] px-3 py-3">
          <ul className="space-y-0.5">
            {NAV_GROUPS.find((g) => g.id === 'settings')?.items.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActivePath(pathname, item.href)}
              />
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2">
            <Avatar email={user.email} test={isTestUser} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{user.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="ログアウト"
              title="ログアウト"
              className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-fill/[0.1] hover:text-ink"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── モバイル: 上部バー ─────────────────────────────── */}
        <header className="no-print glass pt-safe sticky top-0 z-30 border-b border-line/[0.06] lg:hidden">
          <div className="flex h-[52px] items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2">
              <Logo compact />
            </Link>
            <div className="flex items-center gap-2">
              {isTestUser && <TestModeChip />}
              <Link href="/more" aria-label="メニューとアカウント">
                <Avatar email={user.email} test={isTestUser} />
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-[calc(92px+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      </div>

      {/* ── モバイル: 下部タブバー ─────────────────────────── */}
      <nav
        aria-label="タブバー"
        className="no-print glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line/[0.08] lg:hidden"
      >
        <div className="mx-auto grid h-[60px] max-w-lg grid-cols-5 items-center px-2">
          <TabLink href="/" label="ホーム" icon="home" active={pathname === '/'} />
          <TabLink href="/review" label="レビュー" icon="review" active={isActivePath(pathname, '/review')} badge={pendingCount} />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              aria-label="新規作成"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white shadow-float transition active:scale-90"
            >
              <Icon name="plus" size={24} strokeWidth={2.2} />
            </button>
          </div>
          <TabLink href="/journals" label="仕訳帳" icon="journal" active={isActivePath(pathname, '/journals')} />
          <TabLink href="/more" label="メニュー" icon="more" active={inMenuSection || isActivePath(pathname, '/documents')} />
        </div>
      </nav>

      <QuickAddSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Image src="/opentax-logo.svg" alt="" width={32} height={32} className="shrink-0 shadow-control" />
      <span className={`font-semibold tracking-tight text-ink ${compact ? 'text-[17px]' : 'text-[18px]'}`}>OpenTax</span>
    </span>
  );
}

function TestModeChip() {
  return (
    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning" title="サンプルデータを使用中">
      テスト
    </span>
  );
}

function Avatar({ email, test }: { email: string | null; test: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
        test ? 'bg-warning/15 text-warning' : 'bg-fill/[0.14] text-ink-2'
      }`}
    >
      {email?.[0]?.toUpperCase() ?? 'U'}
    </span>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  badge,
  prominent = false,
}: {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  badge?: number;
  prominent?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`group flex items-center gap-3 rounded-xl px-3 transition-colors ${prominent ? 'h-10 text-[15px]' : 'h-8 text-sm'} ${
          active ? 'bg-surface font-semibold text-ink shadow-card' : 'text-ink-2 hover:bg-fill/[0.08] hover:text-ink'
        }`}
      >
        <Icon name={icon} size={prominent ? 20 : 18} className={active ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2'} />
        <span className="flex-1 truncate">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="num min-w-[22px] rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
            {badge}
          </span>
        )}
      </Link>
    </li>
  );
}

function TabLink({ href, label, icon, active, badge }: { href: string; label: string; icon: IconName; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
        active ? 'text-accent' : 'text-ink-3'
      }`}
    >
      <span className="relative">
        <Icon name={icon} size={25} strokeWidth={active ? 2 : 1.6} />
        {badge !== undefined && badge > 0 && (
          <span className="num absolute -right-2.5 -top-1 min-w-[18px] rounded-full bg-negative px-1 text-center text-[10px] font-semibold leading-[18px] text-white ring-2 ring-white">
            {badge}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}
