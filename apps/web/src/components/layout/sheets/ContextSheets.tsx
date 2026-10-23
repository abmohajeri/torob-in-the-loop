import { useUi } from '../../../state/useUi.js';
import { LocationSheet } from './LocationSheet.js';
import { BudgetSheet } from './BudgetSheet.js';
import { ConditionsSheet } from './ConditionsSheet.js';
import { VisitTimeSheet } from './VisitTimeSheet.js';
import { TravelModeSheet } from './TravelModeSheet.js';

/** Single host for all context sheets — open one from anywhere with `useUi().openSheet(id)` / `openContextSheet(id)`. */
export function ContextSheets() {
  const sheet = useUi((s) => s.sheet);
  const close = useUi((s) => s.closeSheet);
  const bind = (...ids: (typeof sheet)[]) => ({ open: ids.includes(sheet), onOpenChange: (o: boolean) => !o && close() });
  return (
    <>
      <LocationSheet {...bind('location', 'radius')} />
      <BudgetSheet {...bind('budget')} />
      <ConditionsSheet {...bind('conditions')} />
      <VisitTimeSheet {...bind('visitTime')} />
      <TravelModeSheet {...bind('travelMode')} />
    </>
  );
}
