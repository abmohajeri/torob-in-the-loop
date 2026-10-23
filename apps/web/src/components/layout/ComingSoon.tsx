import type { ReactNode } from 'react';
import { Hammer, MessageCircleMore, type LucideIcon } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState.js';
import { ButtonLink } from '../ui/Button.js';
import { paths } from '../../lib/paths.js';

/** Tasteful «به‌زودی» state used by placeholder pages until their page engineer replaces them. */
export function ComingSoon({ icon = Hammer, title, description, children }: { icon?: LucideIcon; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 pt-6">
      <div className="rounded-3xl bg-surface shadow-card">
        <EmptyState
          icon={icon}
          size="lg"
          title={
            <>
              {title}
              <span className="ms-2 inline-flex translate-y-[-2px] items-center rounded-full bg-accent-tint px-2 py-0.5 align-middle text-caption font-bold text-accent-ink">به‌زودی</span>
            </>
          }
          description={description ?? 'این بخش در حال آماده شدن است. تا آن موقع می‌توانید از دستیار کمک بگیرید.'}
          actions={
            <ButtonLink to={paths.home} startIcon={MessageCircleMore}>
              گفتگو با دستیار
            </ButtonLink>
          }
        >
          {children}
        </EmptyState>
      </div>
    </div>
  );
}
