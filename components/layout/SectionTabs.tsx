'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findNavGroup, isActivePath } from './navigation';

/**
 * 同じグループの画面（例: 帳票・案件・顧客）を横に並べ、関係性と移動手段を示す。
 * 一覧画面のときだけ表示し、詳細・作成画面では戻るリンクに任せる。
 */
export function SectionTabs() {
  const pathname = usePathname();
  const group = findNavGroup(pathname);
  if (!group || !group.items.some((item) => item.href === pathname)) return null;

  return (
    <nav aria-label={group.label} className="no-print -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto">
        <span className="mr-1 shrink-0 text-[13px] font-medium text-ink-3">{group.label}</span>
        {group.items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                active ? 'bg-ink text-white' : 'bg-fill/[0.1] text-ink-2 hover:bg-fill/[0.16] hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
