/** Hand-written data-quality caveats appended to docs/DATA-REPORT.md (kept in code so the report stays generated). */
export const CAVEATS = `
## 7. Caveats for the UI (read before showing data)

- **Shop names are anonymized** unless the shop has Instagram/website (\`shops.name_is_real = 1\`). Phone numbers are fake
  in the dataset — the UI must say so and never present them as verified.
- **Prices are seller-registered snapshots**, not live. Show freshness (\`price_changed_at\` vs. \`meta.data_as_of\`), never "today's price".
  \`price_status = 'missing'\` (0 / empty) and \`'suspicious'\` (> 10B, < 1,000 Toman, or > 8× / < ⅛ of the product median) are kept
  as rows with \`price = NULL\`; \`raw_price\` holds the registered value for transparency (values beyond 2^53 are clamped and the exact digits
  are in \`raw_price_text\`). Only \`ok\` prices feed min/median/max, category quantiles and ranking.
- **Same shop, same product, several offers** (variants such as colours/sizes) are separate rows — aggregate per shop (min price,
  distinct seller titles) before showing "N shops".
- **Opening hours**: \`hours = NULL\` means nothing was declared (unknown — not closed). \`unsupported\` days are \`unknown\`.
  \`hours_suspicious = 1\` schedules (e.g. 02:00–08:00, 24 h, < 1 h shifts) must be shown with a caution and should not drive
  hard "open now" filtering.
- **In-mall location is parsed from free-text addresses** — \`loc_confidence\` tells how much was found (high = mall + floor + unit/plaque).
  Floors like «طبقه آخر», «نیم‌طبقه» or lettered levels keep a label with \`floor_num = NULL\`. Landmark phrases («روبه‌روی پاساژ چارسو»)
  are *not* the shop's mall. Mall clusters are built from spelling-normalized names + 250 m proximity; a few tiny clusters may still
  duplicate a big one when seller pins are far off.
- **Payment options** are seller-declared; \`channel = 'unknown'\` means Torob does not know if the provider is accepted in person.
  Provider names that are not real providers (e.g. a shop name typed by mistake) are kept as \`other\` with their label.
  Kalabarg is never registered → always unknown.
- **Text hints** (installment / cheque / fast delivery / pay on delivery) are mined from seller descriptions — a weaker signal; label them
  «در توضیحات فروشنده».
- **Brands**: \`brand_inferred = 1\` brands were matched in the title (dictionary + dataset brand list, category-guarded); show them as
  brand but avoid stating them as verified.
- **Titles**: redacted catalog titles («عنوان حذف‌شده برای انتشار») are replaced by the most frequent seller title (\`title_source='seller'\`)
  or a generated «category + brand» title (\`'generated'\`).
- **Category-only shops** (declared activity categories but no offers) only *may* sell an item — present them as "might have it, ask first".
- **Metro data** © OpenStreetMap contributors (ODbL) — credit it on the About page.
`;
