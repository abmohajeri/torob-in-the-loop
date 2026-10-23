import { Compass, MessageCircleMore, Search } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ButtonLink } from '../components/ui/Button.js';
import { PageHeader } from '../components/layout/PageHeader.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { paths } from '../lib/paths.js';

export default function NotFoundPage() {
  useDocumentTitle('صفحه پیدا نشد');
  return (
    <>
      <PageHeader title="صفحه پیدا نشد" />
      <div className="px-4 pt-6">
        <div className="rounded-3xl bg-surface shadow-card">
          <EmptyState
            icon={Compass}
            size="lg"
            title="این صفحه را پیدا نکردیم"
            description="ممکن است نشانی اشتباه باشد یا صفحه جابه‌جا شده باشد. از اینجا ادامه دهید:"
            actions={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink to={paths.home} startIcon={MessageCircleMore}>
                  گفتگو با دستیار
                </ButtonLink>
                <ButtonLink to={paths.search()} variant="secondary" startIcon={Search}>
                  جستجوی کالا
                </ButtonLink>
              </div>
            }
          />
        </div>
      </div>
    </>
  );
}
