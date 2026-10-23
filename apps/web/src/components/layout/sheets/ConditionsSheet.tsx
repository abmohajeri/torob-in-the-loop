import { Clock, CreditCard, ShieldCheck, SlidersHorizontal, Ticket, Truck } from 'lucide-react';
import { INSTALLMENT_PROVIDERS, PROVIDERS } from '@titl/shared';
import { Sheet } from '../../ui/Sheet.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { Badge } from '../../ui/Badge.js';
import { ToggleRow } from '../../ui/Switch.js';
import { DataNote } from '../../data/DataNote.js';
import { useContextStore } from '../../../state/useContextStore.js';
import { activeConditionCount } from '../../../lib/context-labels.js';

/** «شرایط خرید» — installment + providers, open at visit time, warranty only, fast delivery, Kalabarg. */
export function ConditionsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const ctx = useContextStore((s) => s.ctx);
  const s = useContextStore.getState();
  const setInstallment = useContextStore((st) => st.setInstallment);
  const toggleProvider = useContextStore((st) => st.toggleProvider);
  const count = activeConditionCount(ctx);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="شرایط خرید"
      description="فقط فروشگاه‌هایی را جلو می‌آوریم که با شرایط شما جور باشند."
      icon={SlidersHorizontal}
      size="tall"
      footer={
        <div className="flex gap-2.5">
          <Button variant="ghost" size="lg" disabled={count === 0} onClick={() => s.resetConditions()}>
            پاک کردن
          </Button>
          <Button size="lg" fullWidth onClick={() => onOpenChange(false)}>
            تأیید
          </Button>
        </div>
      }
    >
      <div className="divide-y divide-line-soft">
        <ToggleRow
          icon={CreditCard}
          title="خرید قسطی / اعتباری"
          description="فروشگاه‌هایی که روش پرداخت اعتباری دارند."
          checked={!!ctx.installment}
          onCheckedChange={setInstallment}
        >
          {ctx.installment ? (
            <div className="mt-3 space-y-2">
              <p className="text-caption font-medium text-muted">کدام سرویس؟ (اختیاری)</p>
              <div className="flex flex-wrap gap-2">
                {INSTALLMENT_PROVIDERS.map((code) => (
                  <Chip key={code} size="sm" selected={ctx.providers?.includes(code) ?? false} onClick={() => toggleProvider(code)}>
                    {PROVIDERS[code].label}
                  </Chip>
                ))}
              </div>
              <DataNote>پرداخت اعتباری در داده‌های ترب برای پرداخت آنلاین ثبت شده؛ در خرید حضوری آن را از فروشنده می‌پرسیم.</DataNote>
            </div>
          ) : null}
        </ToggleRow>
        <ToggleRow
          icon={Clock}
          title={ctx.visitAt ? 'باز در زمان مراجعه' : 'الان باز باشد'}
          description="بر اساس ساعت کاری ثبت‌شده؛ اگر ساعت ثبت نشده باشد «نامشخص» نشان می‌دهیم."
          checked={!!ctx.openNow}
          onCheckedChange={(v) => s.setOpenNow(v)}
        />
        <ToggleRow
          icon={ShieldCheck}
          title="فقط با گارانتی"
          description="پیشنهادهایی که گارانتی‌شان در ترب ثبت شده است."
          checked={!!ctx.warrantyOnly}
          onCheckedChange={(v) => s.setWarrantyOnly(v)}
        />
        <ToggleRow
          icon={Truck}
          title="ارسال فوری"
          description="اگر نخواستید حضوری بروید، فروشگاه‌هایی که ارسال سریع دارند."
          checked={!!ctx.fastDelivery}
          onCheckedChange={(v) => s.setFastDelivery(v)}
        />
        <ToggleRow
          icon={Ticket}
          title="کالابرگ"
          badge={
            <Badge tone="warn" size="sm">
              داده ندارد
            </Badge>
          }
          description="در داده‌های ترب ثبت نشده؛ از فروشنده می‌پرسیم."
          checked={!!ctx.kalabarg}
          onCheckedChange={(v) => s.setKalabarg(v)}
        />
      </div>
    </Sheet>
  );
}
