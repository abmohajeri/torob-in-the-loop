# Torob in the Loop: Design Review Synthesis

Sources: six critic reviews (Product, UX, Intelligence, Dataset, Shopper/Seller, Demo director). Every number was checked against raw.db (6,476 shops, 225,903 products, 331,506 offers). Data snapshot: **2026-10-13 (۲۱ مهر ۱۴۰۵)**. Today: Thursday 2026-10-22.

This file adds to PRD.md and ARCHITECTURE.md. **Where they disagree, this file wins.**

---

## 0. Executive decisions (conflicts resolved)

| # | Conflict | Decision | Why |
|---|---|---|---|
| D1 | Hero journey: sneakers (from the brief) vs earbuds/A07 (many sellers) | **Keep sneakers for Step 1 and the store finder; use Galaxy A07 64/4 (27 sellers, Jomhouri/Aladdin cluster) for exact-product compare, ask and plan.** Earbuds (Anker R50i NC, 23 shops) are the backup. | Sneakers are the brief's own example, and judges will try them. 856 of 865 have one seller, so sneakers must lead to a *need-level* store finder, which counts as visible intelligence. Comparing exact offers needs a dense product. |
| D2 | Freshness thresholds (≤3 d / ≤14 d / 30–90 d) | Measure age **against `meta.dataAsOf`, not `new Date()`**. Buckets: `تازه` ≤14 d, `معمولی` 15–60 d (neutral), `قدیمی` 61–180 d (amber), `خیلی قدیمی` >180 d (red), `نامشخص`. Separately, the reason `likely_outdated` fires when age is over 30 d and price is below 0.8 × freshMedian. | With the current rule nothing is fresh and the whole UI turns amber. Anchoring keeps the buckets meaningful. Card text always shows the honest absolute age. |
| D3 | Visit-time handling: auto-shift vs banner vs time-travel chip | One `ctx.visitAt` plus one `AppMeta.clock {now, demo}`. If less than 35% of results are open at arrival, show the banner with a one-tap shift to the next ≥70%-open window. **Do not shift silently.** The demo clock is off by default; scenarios turn it on, and while on, a «ساعت نمایشی» pill is always visible. | Honest, and gives judges the same experience at any hour. |
| D4 | Mode badge «هوشمند/پایه» in the header | Remove it from the header and put it in /about. Label AI output «دستیار Torob in the Loop». | «پایه» looks broken if the LLM goes down. |
| D5 | Deterministic demo vs seeded PRNG | Use a disclosed `DEMO_SCENARIOS` mode with outcomes assigned by order within a batch, plus `DEMO_TIME_SCALE`. Outside demo mode, keep the PRNG. Simulated calls are always labelled. | Every take is repeatable, with no deception. |
| D6 | Installment as a hard filter vs tiers | Use **tiers, never an empty list**. «ندارد» appears only when an inquiry actually returned that answer. | Only 240 of 3,792 offer shops declare a provider. |
| D7 | Colour tokens (MASTER.md vs index.css) | **OVERRIDDEN by the team (user requirement): the `ui-ux-pro-max` skill owns the UI. `design-system/torob-in-the-loop/MASTER.md` (E-commerce palette: emerald `#059669`/`#047857`, orange `#EA580C`/`#C2410C`, bg `#ECFDF5`, Vazirmatn) is authoritative; index.css is re-themed to it.** Keep the semantic intent: solid green = verified/open; orange = «بپرس» / live calls / CTAs. | Team decision — all front-end/UI/UX work must follow the UI UX Pro Max skill. |
| D8 | Bale bot P1 vs P2 | **P1 stretch.** Do it only after the P0 items, and only if a token is available. The seller inbox web page is P0 and is enough for J5. | Limited hours. The inbox already proves two-sided value. |
| D9 | Shopping case (پرونده) | Ship a P0 **lite** version: a client-derived 4-step strip plus inquiries grouped by batch. Server-side `ShoppingCase`, pre-departure re-check and the post-visit loop are P1. | Covers the rubric's «پیگیری» visibly without a new persistence layer on day one. |
| D10 | Multi-item basket | P2. Cut unless spare time. | Low rubric yield per hour. |

---

## 1. Prioritised backlog by area

Legend: **P0** must ship before the demo · **P1** ship if parallel capacity allows · **P2** cut candidates. Owners are suggestions for parallel engineers.

### 1.1 Data / ETL (owner: data)

| ID | Pri | Item | Spec |
|---|---|---|---|
| DT1 | P0 | **Fix `dataAsOf`** | In the TEXT columns, map the literal `'null'` to SQL NULL **before** any `max()`. Today, 769 `'null'` rows sort after `'2'`. `dataAsOf = 2026-10-13T00:02:35Z`, exposed in `/api/meta`. |
| DT2 | P0 | Price rules for the real distribution | Missing (null or empty, 15,083 rows): show «قیمت اعلام نشده — بپرسید» and sort after priced offers. Below 1,000 Toman (1,645 rows): suspicious, never shown as a number; label «قیمت نامعتبر (احتمالاً تماسی)». Above 1e10 (211 rows): flag only when the category median is below 1e9. For products with 1–2 offers: suspicious if price < category p1 or > p99 × 3. **Model-family outlier:** price < 0.35 × the median for the same brand + model key, labelled «قیمت خیلی پایین‌تر از مدل‌های هم‌نام — احتمالاً طرح یا خطای ثبت» (catches the S25 Ultra listed at ۱۹٫۳۵ م). Suspicious prices are excluded from min and median. Keep the 0-price branch only as a guard (0 rows hit it). |
| DT3 | P0 | Brand recovery | Order: dataset brand → spec `برند`/`شرکت سازنده` (41,329 products; strip سایر/متفرقه/نامشخص) → title alias → null. Store `brand_source`. Hide the brand facet when less than 20% of a category's results have a brand. |
| DT4 | P0 | Hours | Drop the 23,329 `00:00–00:00` placeholders. Merge overlapping or duplicate shifts. Flag a second shift that starts before 06:00. There are 0 overnight shifts. 2,003 shops have `{}`, which means hours are unknown. Tehran time (`Asia/Tehran`), Saturday is the first day of the week. |
| DT5 | P0 | Shop tiers | `has_offers`. Tier A: has offers (3,792). Tier B: categories only (887), labelled «فقط دستهٔ فعالیت اعلام شده؛ کالایی ثبت نکرده». Tier C: neither (1,797), shown only on the map and mall pages, **never** in "where to buy X". |
| DT6 | P0 | Offer attributes (`offers.attrs`) | Use word-boundary regexes over seller title and description: condition (new/akband/used/stock/open_box), authenticity (replica/claims_original), registry (registered/not_active), bundle (with_charger), each with `source:'seller_text'`. Product-level `is_replica`: the catalog title contains «طرح …», «درجه یک», «های کپی», «فیک» or «مستر کوالیتی» (86 phone products). **Cheque fix:** match only the standalone words چک/چکی, or «با چک»/«فروش چکی»/«چک صیادی». The substring rule was about 94% false positives (کوچک). |
| DT7 | P0 | Split list-valued specs | Split `سایز`, `رنگ`, `رنگ‌بندی` and `سایز بندی` on «،», «,» and spaces into separate `product_facets` values. Sneaker sizes after splitting: 37 on 203 products, 41 on 187, 43 on 113. |
| DT8 | P0 | Variant grouping key | Normalise brand + model to `model_key` (AirPods Pro 2 is split across 3 or more product ids; A07 comes as 64/4, 128/4 and 128/6). Used by the availability ladder and the outlier rule. |
| DT9 | P1 | Mall clustering | Remove diacritics and ZWNJ. Treat leading ء/ئ/ا/اع as variants (اعلاء→علاء→علا). Normalise digits. **The branch number is part of the key** (علاالدین۲ ≠ ۳). Cluster by key first; use the 250 m radius only to split same-key malls, never to merge different keys. Never infer a mall from coordinates (45 shops share one point). Add a hand-written `data/malls.json` for the top ~20 malls. Test: the 547 علا…الدین addresses collapse to at most 4 malls. Expose sibling malls (same base name, different number, within 500 m). |
| DT10 | P1 | Address parser | Handle طبقه (65% of addresses), the typo طیقه, منفی یک/زیرزمین=-1, همکف=0, «آخر» = the highest floor seen in that mall, and واحد (37%). A «پلاک» that appears before the mall segment is a street plaque and must not be shown as a unit. Add 30 hand-labelled unit tests. Target at least 90% floor extraction. When confidence is low, show «آدرس کامل: …». |
| DT11 | P1 | Payments cleanup | Providers: ترب‌پی 190, اسنپ‌پی 89, دیجی‌پی 61, تارا 37, ازکی‌وام 5. **Drop** the shop names wrongly stored as providers (حلما, جیتکس مارکت, دکان ابزار). Channel is in_person or unknown, never online. Min/max are always null, so build no UI for them. Respect category scoping (تارا applies only to mobile/digital and laptop). Description hint «قسط» (301 offers) becomes tier 3. |
| DT12 | P1 | Fast delivery / warranty | Fast delivery is true (1,168) / false (433) / null (4,875); the filter means true only. Text hint «ارسال فوری» (757) adds an offer badge only. Warranty is null on 82% of offers, which means unknown: show nothing, never «بدون گارانتی» (explicit «بدون گارانتی» exists on only 1,625). |
| DT13 | P1 | Seller-title cleanup | Strip everything after `|` and phrases like قیمت و خرید/قیمت و مشخصات/خرید آنلاین (12,854 titles). Exclude the 1,036 redacted titles from the fallback. Show seller titles only as «عنوان فروشنده: …». |
| DT14 | P1 | Variant dedupe | 9,557 (shop, product) pairs have more than one offer. Show them as «۲ قیمت: ۳۹٫۲–۴۱ م (رنگ/مدل متفاوت)». |
| DT15 | P0 | DATA-REPORT + `/api/meta/data-quality` | Hit counts for every rule from the actual run (§4). CI asserts they stay within ±5%. |

### 1.2 Services / search (owner: services)

| ID | Pri | Item | Spec |
|---|---|---|---|
| SV1 | P0 | **Need-level store finder** `getStoresForNeed(need, ctx)` | `need = {categoryId|group, brand?, audience?, budgetMin/Max?, size?, keywords?}`. Returns `NeedStoresResponse {stores: AssortmentStore[], clusters, excludedByFilters}`. `AssortmentStore = {shop, availability, matchCount, samples≤4, priceMin, priceMax, brands[], sizes[], freshShare, score, reasons}`. Score = 0.35·log(matchCount) + 0.25·budget fit + 0.2·distance + 0.1·open at visit + 0.1·update discipline. Endpoint: `GET /api/need/stores`. A shortlist variant, `GET /api/shortlist/stores?ids=`, returns coverage per shop. |
| SV2 | P0 | **Availability ladder** | Shared type `Availability = 'exact'|'variant'|'similar'|'category_only'`, with fixed copy: «همین کالا را ثبت کرده» · «نسخهٔ دیگری از همین مدل (حافظه/رنگ/ساخت)» · «{n} مدل مشابه ثبت کرده — این مدل را ندارد» · «فقط دستهٔ فعالیت اعلام شده؛ کالایی ثبت نکرده». |
| SV3 | P0 | Routing rule | Lead with «کجا بروم؟» (need mode) when sellerCount < 3, OR the group is fashion/shoes_bags/watch_jewelry/lighting/home_kitchen, OR the user came from discovery without picking a model. The product page in single-seller mode shows «این مدل فقط در ۱ فروشگاه ثبت شده — {n} فروشگاه نزدیک مدل‌های مشابه دارند». This applies to 84% of products. |
| SV4 | P0 | **Freshness anchored to the snapshot** | `freshnessOf(iso, dataAsOf)` per D2. `PriceStats.freshMedian` is the median of prices ≤14 d old, computed only when there are at least 3, shown as «قیمت رایج (تازه)». Reason `likely_outdated` gets the chip «احتمالاً قیمت قدیمی — قبل از رفتن بپرسید». The «ارزان‌ترین» sort shows two groups: «ارزان‌ترین با قیمت تازه», then «ارزان‌تر ولی قدیمی (نیاز به استعلام)». In smart ranking, cap the price sub-score at 0.6 for prices older than 60 d. `ShopLite.updateDiscipline` (share of prices updated in the last 14 d) gives the badge «فروشندهٔ به‌روز — ۹۲٪ قیمت‌ها در ۲ هفتهٔ اخیر» or the caveat «بیشتر قیمت‌های این فروشگاه قدیمی است», plus 0.1 in ranking extras. |
| SV5 | P0 | **Visit-time engine** | `openStateAt(shop, at)` returns `open | closing_soon(<45m) | between_shifts(reopen) | closed_today(nextOpen) | unknown`. It is evaluated at **visitAt + etaMin** (arrival) everywhere: ranking, badges, alternatives, plan, simulator. A precomputed hours histogram gives `nextGoodWindow()`, the next window with at least 70% of relevant shops open. If "open now" returns nothing, fall back to the soonest opening: «الان هیچ فروشنده‌ای باز نیست؛ زودترین بازگشایی: شنبه ۹:۳۰ — پاساژ علاءالدین». |
| SV6 | P0 | **Range as a first-class concept** | `UserContext.range = {kind:'radius'|'areas'|'time'|'route', km?, areas?, maxMinutes?, dest?}`. Keep `maxDistanceKm` as an alias. Never return empty: include `nearestCluster` in the response, with copy «در محدودهٔ انتخابی فروشنده‌ای ثبت نشده. نزدیک‌ترین خوشه: جمهوری (پل حافظ) — ۲۱ فروشنده، حدود ۳۵ دقیقه با مترو» and actions [محدوده را تا آنجا گسترش بده] [از فروشگاه‌های دسته‌مرتبط همین‌جا بپرس]. The route kind (corridor within 800 m) is P1. |
| SV7 | P0 | Clusters | `ClusterSummary {centroid, label, storeCount, priceMin, priceMax, openAtVisit, etaFromUser}`, built per product with single-link clustering at ≤300 m. Card copy: «بهترین جا برای خرید حضوری: ۲۱ فروشنده در ۳۰۰ متر — با ۱۰ دقیقه پیاده‌روی حضوری مقایسه کنید». |
| SV8 | P0 | **Budget reality check** | If budgetMax is below p10 of non-replica prices for the (category, brand), OR at least 70% of in-budget hits are basic, replica or outlier, return a `budgetReality` notice: «با ۲۵ میلیون فقط گوشی‌های ساده یا طرح سامسونگ پیدا شد. ارزان‌ترین گوشی هوشمند سامسونگ اصل: گلکسی A07 از ۳۸٫۹ میلیون در ۲۷ فروشگاه.» with [بودجه تا ۴۵ میلیون] [گوشی ساده هم خوبه] [برندهای دیگر زیر ۲۵ میلیون] [کالاهای «طرح» را هم نشان بده]. Brand queries hide replicas behind the chip «۱۲ کالای طرح/کپی پنهان شد — نمایش». |
| SV9 | P0 | **Installment tiers** | `installmentTier: 'in_person'|'declared_unknown_channel'|'seller_text'|'none_recorded'`. When installment is on, group results instead of filtering them. If fewer than 3 stores land in the top tiers, return actions (see W6). |
| SV10 | P0 | Alternatives honour context | Apply the same hard filters as `getStores`. Relax one constraint at a time and say which one. `AlternativesRequest.origin` measures distance from the failed shop. Add `AltReason` values `over_budget` and `no_installment`. Each alternative carries a relative chip: «همان پاساژ، طبقهٔ ۳ — ۲ دقیقه پیاده» · «۴۰۰ هزار ارزان‌تر» · «تا ۲۰:۰۰ باز است». `similarProducts` respects the budget, prefers the same brand and storage, and shows the difference. Footer section «اگر هیچ‌کدام نشد» lists tier-B shops in the same mall. |
| SV11 | P0 | **Insights module** | Pure function `insights(ctx, stores, inquiries, plan) → Insight[]`, used by both the LLM and rules modes. Rules: stale price · closing before arrival · same-passage cluster · suspiciously cheap · installment channel unknown · traffic zone/metro · trade-off · Thursday/Friday. |
| SV12 | P1 | Trade-off card | `StoresResponse.tradeoffs = {nearestOpen, cheapestFresh, mostReliable, bestScore}` with deterministic sentences: «ارزان‌ترین قیمت تازه ۲٫۱ میلیون ارزان‌تر از نزدیک‌ترین فروشگاه است، اما ۲۵ دقیقه دورتر (مترو)» · «اگر عجله دارید: نزدیک‌ترین فروشگاه باز — ۶ دقیقه پیاده، تا ۱۹:۰۰ باز است». |
| SV13 | P1 | Deadline-aware plan ordering | Each stop has a window `[opensAt, min(closesAt, holdUntil)]`. Brute force for 6 stops or fewer; otherwise nearest-neighbour + 2-opt with a lateness penalty. Keep same-mall stops consecutive. Explain the order: «ترتیب را عوض کردم: فروشگاه الف ساعت ۱۴ تعطیل می‌کند…». |
| SV14 | P1 | Priority / urgency | `UserContext.priority: balanced|price|time|certainty` plus `needBy`. Weight presets per the Intelligence review. Chip «همین امروز لازم دارم». |
| SV15 | P1 | Call targeting | `callPriority = rankScore × uncertainty`. «از ۳ فروشگاه برتر بپرس» picks shops by it and explains: «این ۳ را انتخاب کردم چون رتبهٔ بالا دارند ولی قیمتشان قدیمی است». Questions are auto-selected per shop. |
| SV16 | P2 | Shopping list → cluster coverage | Cut unless spare time. |

### 1.3 Contact / follow-up (owner: contact)

| ID | Pri | Item | Spec |
|---|---|---|---|
| CT1 | P0 | **Follow-up digest in chat** | New `LiveEvent {type:'assistant.message'}`, persisted in chat_messages. When a batch settles, a rules composer writes: «نتیجه پیگیری ۳ فروشگاه:\n• فروشگاه ب: موجود، ۱۲٫۸ میلیون (۴٪ گران‌تر از قیمت ثبت‌شده) — تا ۱۸:۰۰ نگه می‌دارد\n• فروشگاه الف: جواب نداد؛ ساعت ۱۶:۳۰ دوباره تماس می‌گیرم\n• فروشگاه ج: تمام کرده بود؛ ۲ جایگزین در همین پاساژ پیدا کردم\nپیشنهاد من: فروشگاه ب — ارزان‌ترین گزینهٔ تأییدشده و ۴ دقیقه پیاده از شما.» Quick replies: [برنامهٔ رفتن به فروشگاه ب را بچین] [از جایگزین‌ها هم بپرس] [منتظر تماس دوم بمان]. Add one-line mid-state messages for the first no-answer only. |
| CT2 | P0 | **No calls to closed shops** | New status `scheduled_at_open`, with `nextAttemptAt = opensAt + 5–10 min`. Copy: «فروشگاه الان بسته است؛ تماس شنبه ۱۰:۰۵ انجام می‌شود. پیامتان همین حالا در صندوق فروشنده ثبت شد.» Simulate a `closed` outcome only when hours are unknown or the user forces «همین الان بپرس». |
| CT3 | P0 | **Demo scenarios + time scale** | With `DEMO_SCENARIOS=1` (or the /about toggle), outcomes go by position in the batch: #1 no_answer → retry → answered, in stock, +4–6%, held until 18:00; #2 in stock, unchanged price, installment as declared; #3 out of stock → auto alternatives in the same passage. A second batch gets `over_budget`. `DEMO_TIME_SCALE` 1/3/10× scales ringing, transcript pacing and retry. The seed is the scenario name. Test: the same scenario 3 times gives an identical transcript. |
| CT4 | P0 | Questions / variant | Extend `InquiryQuestion` with `variant|registry|condition|cash_vs_installment|return_policy` and add `variant?: {key,value}[]`. Presets per group: shoes «سایز ۴۳ مشکی موجود است؟» «اصل است یا طرح؟»; mobile «رجیستر شده و قابل فعال‌سازی است؟» «آکبند و پلمپ است؟» «قیمت نقد و قسط چقدر فرق دارد؟»; lighting «نصب و ارسال دارید؟»; all groups «امکان تعویض دارید؟». In the simulator, shoe sizes are independent of model stock: «۴۲ تمام شده، ۴۱ و ۴۳ داریم». Questions are auto-added: installment when installment is on, کالابرگ when it is set, «نشانی دقیق داخل پاساژ» when location confidence is not high, «ساعت کاری امروز» when the visit is today. |
| CT5 | P0 | **Seller inbox closes the loop** | Header: «امروز ۷ نفر دربارهٔ کالاهای شما پرسیدند · ۳ قیمت شما بیش از ۳۰ روز قدیمی است». One-tap replies (each target at least 44px): stock [موجود است] [موجودی محدود] [تمام شده] · price [همان قیمت] [قیمت جدید…] · hold [تا ۱۷] [تا ۱۸] [تا ۱۹] [نگه نمی‌داریم]. A toggle, on by default, «این قیمت و موجودی برای همهٔ خریداران نمایش داده شود», writes a global VerifiedInfo with source `seller_inbox`. After sending, show «پاسخ برای مشتری ارسال شد». The picker lists «فروشگاه‌هایی که از آن‌ها سؤال شده» first. Buyers see the badge «پاسخ مستقیم فروشنده», which ranks above simulated answers. |
| CT6 | P0 | Honest disclosure | Every simulated artifact says so: «تماس شبیه‌سازی‌شده · نسخه نمایشی» with a «چرا؟» sheet: «شماره‌های دیتاست ترب نمایشی است. در نسخه واقعی همین گفتگو با تماس خودکار یا پیام در بله انجام می‌شود و فروشنده‌ها از صفحه فروشنده هم جواب می‌دهند.» Before an AI call: «این سؤال‌ها را از طرف شما می‌پرسم؛ نام و شمارهٔ شما گفته نمی‌شود». Never write «تماس گرفته شد» unless a call actually happened. |
| CT7 | P1 | «خودم می‌پرسم» + «پاسخ را ثبت کن» | Build a ready-made message from the chosen questions: «سلام وقت بخیر. گوشی سامسونگ A07 (۶۴/۴، رجیستر شده) موجود دارید؟ قیمت نقد امروز؟ با اسنپ‌پی می‌شود خرید کرد؟ امروز تا چه ساعتی باز هستید؟» with [کپی متن]. A mini-form records the answer as `user_reported`. Phone numbers are masked: «۰۹۱۲ ••• ••۴۵ (شماره نمایشی دیتاست)». No `tel:` links. |
| CT8 | P1 | Plan re-confirm + hold tracking | Persist the plan in state.db. Run a job at departAt − 45 min that re-asks stock: «۴۵ دقیقه تا حرکت: فروشگاه دوم گفت تمام شده؛ در همان پاساژ جایگزین پیدا کردم» [جایگزین را جایش بگذار]. Hold countdown: «نگه‌داشته شده تا ۱۸:۰۰ — ۲ ساعت و ۱۰ دقیقه مانده». Action «دیر می‌رسم» extends the hold. |
| CT9 | P1 | Richer states | `callback_promised` (about 8%): «فروشنده گفت ساعت ۱۷ خبر می‌دهد؛ اگر خبری نشد خودم ساعت ۱۷:۱۰ دوباره تماس می‌گیرم». Escalation ladder: call 1 → call 2 → seller inbox → ask neighbours on the same floor. Partial answers keep unknowns null: «نامشخص — فروشنده نگفت». |
| CT10 | P1 | Post-visit loop | «امروز به جمهوری رفتید؛ خرید کردید؟» [خریدم به قیمت …] [نخریدم: گران بود / نداشت / بسته بود / پیدا نکردم]. This creates a crowd report «آخرین قیمت گزارش‌شده توسط خریدار — ۲ ساعت پیش». Show closed reports: «۲ نفر در ۳ ساعت گذشته گزارش دادند بسته است». |
| CT11 | P1-stretch | Bale bot | `/start <shopId>` deep link, a QR code on /seller, inline buttons [موجود است] [تمام شده] [قیمت جدید] [تا ساعت … نگه می‌دارم]. Show it on a real phone in the video if it ships. |

### 1.4 Agent (owner: agent)

| ID | Pri | Item | Spec |
|---|---|---|---|
| AG1 | P0 | Blocks first, text after | Run the rules intent detector first. For search and stores intents, execute the tool and emit the block within about 300 ms, then pass it to the LLM as an earlier tool result. The LLM writes at most 3 sentences plus next steps. Show one status line that replaces itself: «جستجو در ۲۲۵ هزار کالا… · ۲۷ فروشنده پیدا شد · بررسی ساعت کاری شنبه ۱۱:۰۰…», collapsing to «۳ کار انجام شد ▾». |
| AG2 | P0 | Short handles + fact guard | Tools label entities P1…/S1…/I1…, and the executor maps them back to ids. An unknown handle returns a tool error, not a crash. After each answer, extract numbers and times; drop the sentence if a number is not in this turn's tool payloads, or if a registered price is described with «تأیید/الان» wording. Temperature ≤0.3. LLM_MAX_STEPS = 6, then a forced summary. |
| AG3 | P0 | New tools | `find_stores_for_need`, `check_visit(shop_ids, at?)`, `explain_ranking`, and `inquiry_status` returning a digest. `set_priority` is folded into `update_preferences`. Each tool returns `next_actions`. NLU learns «سر راه», «تا نیم ساعت», «فقط جمهوری», «همین امروز», «سایز ۴۳». |
| AG4 | P0 | Situational brief in the system prompt | «اکنون: پنجشنبه ۳۰ مهر ۱۵:۲۰ — ۷۸٪ فروشگاه‌های نتایج اخیر تا ۱۴ بسته شده‌اند؛ کاربر قسطی می‌خواهد؛ ۲ استعلام در جریان…». |
| AG5 | P0 | Ask before acting | «از این ۳ فروشگاه درباره موجودی و قیمت بپرسم؟» [بله، بپرس] [تغییر سؤال‌ها]. Skip the confirmation when the user said «بپرس/زنگ بزن». Before any "go now" request, check arrival against closing: «تا برسید (۳۵ دقیقه) فقط ۱۵ دقیقه به بسته شدن مانده؛ اول تماس بگیرم؟» |
| AG6 | P1 | Rules-mode parity | Reference resolver («اولی/دومی/همون مغازه/ارزون‌ترینش»). Refinements re-run with a patch: «زیر ۱۵ تومن باشه» → «بودجه را ۱۵ میلیون گذاشتم؛ ۴ مدل باقی ماند.» Event phrases («بسته بود/جواب نداد/نداشت/گرون بود») route to alternatives. A 40-prompt eval runs in CI in both modes; show the score on /about as «آزمون هوشمندی: ۳۸ از ۴۰». |
| AG7 | P1 | `agent_plan` block | «۱. پیدا کردن مدل‌ها ✓ ۲. فروشنده‌های نزدیک ← ۳. استعلام ۳ فروشگاه برتر ۴. چیدن برنامه», with steps ticked as tools finish. |
| AG8 | P1 | Cached fallback for demo queries | If the LLM provider is down, scripted queries still produce full answers. LLM failure falls back silently to rules mode. |

### 1.5 Web pages / components (owner: web, two engineers)

| ID | Pri | Item | Spec (detail in §2) |
|---|---|---|---|
| W1 | P0 | Single sticky header+context row (52px) | Logo mark plus value chips: «فردوسی · ۳ کیلومتر» «تا ۴۵ میلیون» «قسطی +۱» «شنبه ۱۱:۰۰». Unset chips show as ghosts, e.g. «+ بودجه». The row hides on scroll down. The tab bar hides while the keyboard is open, and a sticky action bar replaces the tab bar rather than stacking on it. Target: fixed UI ≤30% of the screen at rest. |
| W2 | P0 | Filter sheets with live counts and undo | Location sheet: 4 tabs (اطراف من/محله‌ها with counts/حداکثر زمان رسیدن/سر راهم (P1)). Budget sheet: quantile presets and number inputs that accept ۰–۹ and 0–9. Visit-time sheet: «همین الان · امروز عصر · شنبه صبح · انتخاب روز و ساعت» plus the live line «در این زمان ۲۳ از ۲۸ فروشگاه باز هستند». Footer «نمایش ۲۱ فروشگاه». Undo toast: «۲۸ فروشگاه ← ۲۱ (باز در زمان مراجعه) · برگرداندن». When the agent changes a chip, it pulses and a caption shows «دستیار «قسطی» را روشن کرد · برگرداندن». |
| W3 | P0 | Compact store card (~150px) + multi-select | See §2.3. Includes «چرا رتبه ۱؟». |
| W4 | P0 | Need-mode store finder screen (StoreCoverage) | See §2.2. |
| W5 | P0 | AskSheet + live call board | See §2.4. |
| W6 | P0 | Installment tiers UI | Groups «قسطی حضوری (اعلام فروشنده) · ۳» (solid) / «قسطی اعلام شده، حضوری بودنش نامشخص · ۴» with the line «ممکن است فقط برای خرید آنلاین باشد» (outline) / «در توضیحات فروشنده آمده · ۲» (dashed) / a collapsed group «قسطی بودن ثبت نشده · ۷۴» with [از ۵ فروشگاه نزدیک بپرس قسطی دارند؟]. Empty top tier: «در ۵ کیلومتری هیچ فروشنده‌ای قسطی حضوری ثبت نکرده.» [از ۵ فروشگاه نزدیک بپرس] [شعاع ۱۰ کیلومتر] [مدل‌های مشابه با فروشنده قسطی]. Kalabarg note: «کالابرگ برای هیچ فروشگاهی در داده‌های ترب ثبت نشده؛ نتایج را حذف نمی‌کنیم و در استعلام می‌پرسیم.» |
| W7 | P0 | Trust labels | Three shapes: solid + BadgeCheck = verified («۵ دقیقه پیش»); outline + Clock = registered with its age; dashed + question mark = unknown, always paired with «بپرس». Green only for verified or open. Stock defaults to «موجودی: تأیید نشده». Unknowns are combined into one chip «۳ مورد نامشخص · بپرسیم؟». No hover tooltips; use tap sheets instead, including «این برچسب‌ها یعنی چه؟». Result card: registered price struck through with «ثبت‌شده ۹ روز پیش», then «تأییدشده تلفنی ۱۰:۴۲ — ۴۱٫۵ میلیون (+۶٪)», then «موجود — نگه‌داری تا ۱۸:۰۰». Offer badges labelled «طبق عنوان فروشنده»: «طرح (غیراصل)», «کارکرده», «استوک», «رجیستر شده», «نات‌اکتیو», «همراه شارژر». Comparison warning: «این قیمت برای گوشی بدون رجیستری است». |
| W8 | P0 | Visit-time banner + badges | Banner: «الان پنجشنبه ساعت ۱۶:۲۰ است و ۲۱ از ۲۸ فروشگاه بسته‌اند. برای شنبه ۱۰ صبح برنامه بچینم؟» [شنبه ۱۰:۰۰] [فقط بازهای الان (۷)]. Badges: «شنبه ۱۰:۰۰ · باز» · «۲۵ دقیقه تا بسته شدن» · «تعطیلی ظهر · ساعت ۱۶:۰۰ باز می‌شود» · «جمعه تعطیل» · «ساعت کاری ثبت نشده · بپرسیم؟». Day-aware greeting on home. |
| W9 | P0 | Chat = previews | At most 3 rows plus «دیدن همه ۲۴ نتیجه». Compare, plan, map and mall each render as one summary card with [مشاهده کامل]. Blocks render live from the React Query cache. Older blocks dim with the tag «نتایج قبلی». Show the parse while typing: «فهمیدم: [گوشی موبایل ×] [سامسونگ ×] [تا ۴۵ میلیون ×]…» (via `GET /api/parse`). The assistant's last search pre-fills the جستجو tab. An «از دستیار بپرس» FAB appears on product, shop and plan pages. |
| W10 | P0 | Plan + on-site mode | See §2.5. |
| W11 | P0 | Shop page + in-mall guide | See §2.6. |
| W12 | P0 | Shopping-case strip (lite) | A sticky strip on product, stores, inquiries and plan pages: «① انتخاب کالا ✓ ② پیدا کردن فروشنده ✓ ③ مقایسه ● ④ هماهنگی و مراجعه ○», each step tappable. The پیگیری‌ها tab groups inquiries by batch: «گوشی A07 · ۳ فروشگاه · ۲ پاسخ داده‌اند». Show a while-away digest on return (SSE gets suspended on mobile): «در غیاب شما: ۲ پاسخ رسید، ۱ فروشگاه جواب نداد و ۳ جایگزین پیدا شد». |
| W13 | P0 | Scenario launcher + desktop judge panel | See §3. |
| W14 | P1 | Discovery stepper | One question at a time with a narrowing counter «۸۶۵ مدل ← ۴۳۰ ← ۹۰ ← ۱۲». Sneaker questions: budget [تا ۳٫۵ م] [۳٫۵ تا ۷] [۷ تا ۱۱] [بیشتر از ۱۱]; size ۳۷–۴۵ with counts, noted «سایز فقط برای ۴۵٪ مدل‌ها ثبت شده؛ بقیه را از فروشگاه می‌پرسیم»; use [روزمره] [پیاده‌روی و دویدن] [باشگاه] [مجلسی]; مردانه/زنانه as a soft filter: «۵۷۷ مدل جنسیت مشخصی ندارند؛ آن‌ها هم نمایش داده می‌شوند». Rule: an attribute with less than 60% coverage filters as "match OR unknown" and says so. Shortlist max 3, leading to «کجا همه را یک‌جا پرو کنم؟». |
| W15 | P1 | Comparison at 390px | Verdict first, 2 columns, «فقط تفاوت‌ها» on by default. Store comparison opens with a winners strip: «ارزان‌ترین: X · نزدیک‌ترین: Y (۴ دقیقه) · دیرتر باز: Z (تا ۲۱:۰۰) · قسطی: فقط Y». The «فقط شرایط یکسان» toggle compares only like conditions. Spread chip: «ارزان‌تر: نات‌اکتیو». |
| W16 | P1 | Home | Greeting, value line, a 56px input with placeholder «مثلاً: گوشی سامسونگ A07 قسطی نزدیک جمهوری», quick starts, a «ادامه خرید» card, 8 category tiles, «چطور کار می‌کند؟» in 4 steps, and a transparency strip «۲۲۵ هزار کالا · ۶٬۴۷۶ فروشگاه حضوری در مناطق منتخب تهران · قیمت‌ها اعلام فروشنده است؛ موجودی را ما می‌پرسیم». First run uses a non-blocking sheet: «از کجا راه می‌افتید؟». |
| W17 | P1 | States, formatting and a11y | Every empty state ends with an action. Split titles on « | » into a name plus variant chips. Wrap Latin model names in `<bdi>`. Prices: «۳۸٫۹ میلیون تومان» on cards, full digits on detail pages. Relative ages on cards, Jalali on detail pages. Saturday-first weeks. Tap targets ≥44px. Respect reduced motion. Playwright + axe at 390×844. Cache the plan, shop and mall pages offline: «آفلاین هستید — برنامه و راهنماها در دسترس است». |
| W18 | P1 | Getting-there card | Traffic zone + metro: «داخل محدوده طرح ترافیک — پیشنهاد: مترو · ایستگاه ملت ۶ دقیقه پیاده», plus a Neshan/Balad/Google chooser. |
| W19 | P1 | In-store checklist | Shoes: «عصر پرو کنید، با جوراب ورزشی امتحان کنید، دوخت و چسب زیره را ببینید». Mobile: «IMEI را با کد ‎*#06#‎ و سامانهٔ همتا چک کنید؛ پلمپ و کارت گارانتی را ببینید؛ فاکتور بگیرید». |
| W20 | P1 | /about data page + coverage map | See §4.3. |

### 1.6 Deploy (owner: infra)

| ID | Pri | Item | Spec |
|---|---|---|---|
| DP1 | P0 | `/api/health` | `{status, version, gitSha, catalog:{shops,products,offers}, dataAsOf, uptime, llm:'on'|'fallback', sse:'ok'}`. Footer on /about: «نسخه {sha} · مستقر روی لیارا». |
| DP2 | P0 | SSE through the proxy | Send `X-Accel-Buffering: no`, a heartbeat every 15 s, and reconnect with a while-away digest. |
| DP3 | P0 | Warm instance | Liara min instances or keep-warm. Preload catalog.db at boot. Warm routes before recording. |
| DP4 | P1 | Desktop QR «روی گوشی باز کنید» | Links to the same session. |

### 1.7 Demo / QA (owner: product + QA)

| ID | Pri | Item | Spec |
|---|---|---|---|
| DM1 | P0 | **Data-tested EXAMPLE_QUERIES** | Replace the list with: «کتونی مردانه سایز ۴۳ زیر ۸ میلیون» · «گوشی سامسونگ A07 قسطی نزدیک جمهوری» · «ایرپاد ۴ با قیمت تازه» · «هندزفری بلوتوث نویزکنسل زیر ۳ میلیون نزدیک فردوسی» · «ماشین اصلاح نزدیک میدان فردوسی» · «دوربین مداربسته برای مغازه» · «لوستر برای پذیرایی». Remove «گوشی سامسونگ قسطی زیر ۲۵ میلیون» as an example. It is kept only as the budget-reality demo beat. |
| DM2 | P0 | `apps/server/test/golden-journeys.test.ts` | Runs the 5 journeys against catalog.db with a pinned clock (Saturday 11:00) and location (میدان فردوسی). Asserts: ≥5 products; ≥3 stores in range; ≥1 installment store (any tier); ≥1 alternative open at visit; an in-mall guide with high confidence; the budget-reality card fires for «سامسونگ زیر ۲۵ میلیون». CI fails if the data or rules drift. |
| DM3 | P0 | `docs/DEMO.md` | Exact queries, shop ids and expected screens for §3. |
| DM4 | P1 | Playwright per journey at 390×844 | Results non-empty and plausible; axe passes. |

---

## 2. Definitive screen-by-screen UX spec (390×844)

### 2.1 Journey 1 (Step 1): «کتونی می‌خوام، مدلش رو نمی‌دونم»
1. **Home** → quick-start chip «کتونی می‌خوام، نمی‌دونم چه مدلی».
2. **Discovery stepper** (card in chat or on /search): Q1 budget → Q2 size (counts) → Q3 use → Q4 gender (soft). Counter «۸۶۵ مدل ← … ← ۱۲». [رد شدن] and [قبلی] are always available.
3. **Results**: 6 single-column cards with a 96px image. Reason chips «مطابق بودجه» «سایز ۴۳ در مشخصات» «نزدیک‌ترین: فردوسی، ۸۰۰ متر». Actions [+ فهرست کوتاه] [مقایسه]. Removable chips above the list: «تا ۸ میلیون × · سایز ۴۳ × · مردانه ×».
4. Shortlist tray → «کجا همه را یک‌جا پرو کنم؟».

### 2.2 Journey 1 (Steps 2–3): need-mode store finder (StoreCoverage)
- Header: «۴۰ فروشگاه کتانی در ۱ کیلومتری میدان فردوسی».
- Cluster card on top: «بهترین جا برای خرید حضوری: ۲۱ فروشنده در ۳۰۰ متر …» [برنامهٔ بازدید از ۴ فروشگاه برتر این خوشه].
- Rows, grouped by `AvailabilityLadder` rung: shop + «۲ از ۳ مدل انتخابی شما» + thumbnails + «+۲۲۶ مدل کتانی دیگر» + «۳٫۲–۹٫۸ م» + brands + sizes + «باز تا ۱۹:۰۰» + distance.
- Similar section, labelled «مشابه، نه دقیقاً همین». Category-only shops sit last in a dashed section, «ممکن است داشته باشند (فقط دسته فعالیت — موجودی نامشخص)», with the primary action «بپرس».
- Multi-select → [مقایسه] opens a need-mode comparison with rows تعداد مدل مطابق، بازهٔ قیمت، برندها، سایزهای ثبت‌شده، باز در زمان مراجعه، فاصله/زمان، روش پرداخت.
- [از هر ۳ بپرس] opens the AskSheet prefilled with «کتانی مردانه سایز ۴۳ زیر ۸ میلیون دارید؟ چه مدل‌هایی؟».

### 2.3 Journey 2: exact product, «سامسونگ A07 قسطی نزدیک جمهوری»
1. Typing shows the parse chips. If the user typed «زیر ۲۵ میلیون», the **BudgetRealityCard** appears first (SV8). Tap [بودجه تا ۴۵ میلیون].
2. **Product page**: name plus variant chips «۶۴ گیگ · رم ۴». Price summary «۳۸٫۹–۵۷ میلیون · قیمت رایج (تازه) ۴۲ م». Single-seller notice when applicable. Sticky bar [فروشنده‌ها ({n})] [مقایسه].
3. **Stores list**:
   - Header: «۲۷ فروشنده · اختلاف قیمت ثبت‌شده تا ۱۸ میلیون · ارزان‌ترین ۴ دقیقه پیاده از شما» + «۵ فروشگاه با فیلترهای شما پنهان شد · نمایش».
   - Sort segments «پیشنهادی · ارزان‌ترین · نزدیک‌ترین · قیمت جدیدتر».
   - Trade-off strip (P1).
   - Installment tiers when قسطی is on.
   - Toggle «فهرست | نقشه» (one pin per passage, e.g. «علاءالدین · ۹ · از ۳۸٫۹»).
   - Area cards: «جمهوری/علاءالدین — ۱۹ فروشنده در ۴۰۰ متر · از ۳۸٫۹ م · ۲۵ دقیقه با مترو».
4. **Store card (collapsed, ~150px)**:
   - Row 1: rank, name, checkbox.
   - Row 2: «۳۹٫۲ میلیون» + one trust line.
   - Row 3: «باز تا ۱۹:۰۰» + «۶۰۰ متر · ۸ دقیقه پیاده (تخمینی)».
   - Row 4: «علاءالدین ۲ · طبقه ۶ · واحد ۶۲۲».
   - Row 5: up to 2 reason chips + «۳ مورد نامشخص · بپرسیم؟».
   - Actions: [بپرس] [مسیر] [به برنامه].
   - Expanded: payments with channel, warranty, variants, and «چرا رتبه ۱؟», a sheet with plain reasons and factor bars.
   - Selecting cards opens a sticky bar: «۳ فروشگاه انتخاب شد» [از هر ۳ بپرس] [مقایسه] [به برنامه].

### 2.4 Step 4: AskSheet → call board → digest
- **AskSheet** (70%): «از ۳ فروشگاه بپرسم؟».
  - Chips موجودی ✓ قیمت امروز ✓, plus contextual ones (ساعت کاری امروز, نگه‌داشتن تا ۱۷/۱۸/۱۹, قسطی/ترب‌پی, سایز/رجیستری variant, نشانی دقیق, کالابرگ, سؤال دلخواه).
  - Privacy line and the simulated pill with «چرا؟».
  - Footer «نتیجه‌ها معمولاً کمتر از یک دقیقه می‌رسد؛ لازم نیست صبر کنید — در «پیگیری‌ها» هم می‌آید.» CTA [شروع تماس‌ها]. Secondary option [خودم می‌پرسم] (P1).
- **Call board** (`/inquiries?batch=`): 3 stacked cards, about 112px each.
  - States: «در حال شماره‌گیری…» → «در حال گفتگو» + a streaming transcript line → result chips.
  - Result chips: «موجود · تأییدشده», «۴۱٫۵ میلیون ↑۶٪ از قیمت ثبت‌شده», «تا ۱۸:۰۰ نگه می‌دارند», «پاسخ نداد · تماس دوباره ۱۶:۴۲ (۲:۵۹)» with [همین حالا دوباره], «الان بسته است · تماس خودکار شنبه ۱۰:۰۵».
  - Tapping a card opens the transcript sheet.
  - One aria-live region for final outcomes only.
- **Summary card** once 2 or more calls resolve: «بهترین گزینه الان: … — موجود، ۴۰٫۹ میلیون، تا ۱۸:۰۰ نگه می‌دارند» [افزودن به برنامه بازدید] [مقایسه پاسخ‌ها]. When a shop is unreachable: «… پاسخ نداد؛ ۳ جایگزین باز در همین پاساژ پیدا شد».
- **Chat digest** (CT1) is posted to دستیار, with an unread dot on the tab and a toast.

### 2.5 Journey 3: plan + «رسیدم ولی بسته بود»
- **Plan page**:
  - Summary «۳ توقف · ۲۵ دقیقه پیاده · ۱٫۴ کیلومتر». Leave-by line: «اگر تا ۱۶:۱۰ راه بیفتید، همه فروشگاه‌ها هنگام رسیدن باز هستند».
  - 180px static map.
  - Timeline. Each stop shows the time, «هنگام رسیدن: باز (تا ۱۹:۰۰)», the verified result and the hold countdown.
  - Connectors between stops: «۴ دقیقه پیاده · همین پاساژ ← یک طبقه بالاتر». Same-mall group header: «پاساژ علاءالدین — ۲ توقف».
  - Warning: «ساعت ۱۶ پنجشنبه حدود نیمی از فروشگاه‌ها بسته‌اند».
  - Sticky [شروع مسیر] [اشتراک‌گذاری].
- **On-site**: the current stop expands into the in-mall guide plus a 2×2 grid of 56px buttons: «بسته بود» «پیدایش نکردم» «موجود نداشت» «گران‌تر بود».
  - **بسته بود**: within 300 ms an 85% sheet opens: «بسته بود؟ ۳ فروشگاه باز در همین پاساژ همین گوشی را دارند». Distance is measured from the closed shop: «۲ دقیقه پیاده از همین‌جا · طبقه همکف · باز تا ۱۹:۰۰ · ۴۰٫۹ م (ثبت‌شده ۹ روز پیش)». Actions [جایگزین کن در برنامه] (the timeline re-flows and highlights for 1.5 s) [اول بپرس]. Toast: «گزارش «بسته بود» ثبت شد؛ به خریداران دیگر هم نشان می‌دهیم.»
  - **گران‌تر بود**: field «چند گفتند؟», alternatives sorted by price, and the tip «قیمت ثبت‌شده همین فروشگاه ۴۴ میلیون است (۹ روز پیش) — می‌توانید به آن اشاره کنید».
  - **موجود نداشت**: the same product at open shops nearby, plus [اول از ۲ فروشگاه بعدی بپرس].

### 2.6 Journey 4: «مغازه را در پاساژ پیدا نمی‌کنم»
- **Shop page order**: name/area/open/distance → **in-mall guide (above the fold)** → «این فروشگاه برای شما» → actions → hours table (today highlighted, «اعلام فروشنده») → payments → «دسته‌های فعالیت — نشانه موجود بودن کالا نیست» → reports → «منبع اطلاعات».
- **Guide stepper**: «پاساژ علاءالدین ۲» → «ورودی: خیابان جمهوری» → «طبقه ششم» → «واحد ۶۲۲» → landmark.
  - Confidence pill: «دقت نشانی: بالا — پاساژ، طبقه و واحد ثبت شده» / «متوسط» / «کم — پیش از رفتن بپرسید».
  - Sibling-mall warning: «توجه: «علاءالدین» چند ساختمان دارد؛ این فروشگاه در علاءالدین ۲ است.»
  - Guesses are labelled as guesses: «حدس Torob in the Loop: …».
- «همسایه‌های همین طبقه: واحد ۶۱۸ · ۶۲۵ · ۶۳۰» plus [همه فروشگاه‌های پاساژ، طبقه‌به‌طبقه], which opens /mall/:slug.
- [نشان دادن به نگهبان یا فروشنده]: full-screen card at 36–40px with wake lock.
- [پیدایش نکردم]: same-floor shops that carry the product + [از فروشگاه نشانی دقیق را بپرس].
- Demo shop: پاساژ علاءالدین ۲، طبقهٔ ۶، واحد ۶۲۲ (high confidence; confirm via the demo-check).

### 2.7 Journey 5: seller reply
- `/seller` (also the side panel on desktop): the asked shop is listed first. Card: product + «قیمت ثبت‌شده شما: ۴۴٬۰۰۰٬۰۰۰ تومان · ۹ روز پیش» + question chips + «مشتری حدود ۱۶:۴۰ می‌رسد».
- One-tap replies, then [ارسال پاسخ], then the nudge «قیمت شما در ترب ۹ روز است به‌روز نشده؛ این پاسخ تا ۲۴ ساعت به‌عنوان قیمت تأییدشده نمایش داده می‌شود.»
- The buyer card crossfades to «پاسخ مستقیم فروشنده», with the toast «پاسخ مستقیم فروشنده: موجود، ۴۲٫۹ میلیون، تا ۱۸:۰۰ نگه می‌دارد».
- P1: «به‌روزرسانی سریع» list of the seller's stale offers.

---

## 3. Demo script outline (5:00) and judge-readiness

**Setup:**
- Scenario mode on, disclosed.
- Demo clock «شنبه ۱۱:۰۰», with the header pill «ساعت نمایشی».
- Origin «میدان فردوسی / مترو سعدی».
- `DEMO_TIME_SCALE=3`.
- Liara instance warm.
- Record at 390×844, 60 fps, with burned-in Persian captions that double as chapter labels («گام ۲: یافتن فروشنده در محدودهٔ دلخواه»).

**Scenario launcher** (home + desktop side panel; each card sets location, clock and context, then deep-links):
1. «کتونی می‌خوام، مدلش رو نمی‌دونم»
2. «سامسونگ A07 قسطی نزدیک جمهوری»
3. «رسیدم ولی بسته بود»
4. «مغازه را در پاساژ پیدا نمی‌کنم»
5. «نگاه فروشنده: جواب به استعلام»
6. «شروع از صفر»

The desktop panel also has tabs «نمای فروشنده» (live inbox) and QR/coverage. `/demo/duo` (P1) shows buyer and seller iframes side by side.

| Time | Beat | Shows |
|---|---|---|
| 0:00–0:20 | Hook: passage photo + phone. «قیمت ثبت‌شده قدیمیه، مغازه بسته‌ست، واحد رو پیدا نمی‌کنی. Torob in the Loop این مسیر رو چهار قدمه می‌کنه.» | Problem |
| 0:20–1:10 | **Step 1**: sneaker discovery stepper, narrowing counter, shortlist | Guided discovery |
| 1:10–1:50 | **Steps 2–3**: «۴۰ فروشگاه کتانی…», cluster card, need-mode comparison. Then switch to A07: budget-reality card → [بودجه تا ۴۵], store list, installment tiers, change the range chip so the results re-rank with undo | Search, compare, range, honesty |
| 1:50–2:50 | **Step 4**: «از هر ۳ بپرس», live board. #1 no answer → auto retry → in stock; #2 +6%; #3 out of stock → alternatives. Chat digest with recommendation | Follow-up intelligence |
| 2:50–3:20 | Split screen: seller taps «موجود است، ۴۲٫۹ م», and the buyer card flips to «پاسخ مستقیم فروشنده» | Two-sided |
| 3:20–4:10 | Pain points: plan with time windows and a Thursday warning; on site «بسته بود» → 3 alternatives in the same passage, one-tap swap; in-mall guide + «نشان دادن به نگهبان»; flip the clock to «جمعه» and watch the badges and banner change | Visit conditions |
| 4:10–4:35 | /about: counts, coverage map, freshness histogram, «کالابرگ: هیچ رکوردی — همیشه می‌پرسیم», «نام و شماره‌ها در دیتاست ساختگی‌اند؛ تماس شبیه‌سازی‌شده و صادقانه برچسب خورده». Coverage table with «امتحان کنید» links | Dataset honesty |
| 4:35–5:00 | Liara URL, `/api/health` JSON, phone scans the QR. «Torob in the Loop — از انتخاب تا جلوی در مغازه.» | Deploy |

Prepare a 15-second fallback clip for each beat. The cached LLM fallback for scripted queries must be on.

**/about#coverage table:**
- Rows: the 4 steps; the 5 video pain points (unknown model, stale price, closed shop, shop not findable in the passage, installment only); and the text requirements (works without chat; why + next step; easy range/budget/conditions changes; price ≠ change time ≠ stock; unknowns shown; RTL/mobile; ترب‌پی/installment with information type; کالابرگ; fast delivery).
- Columns: feature name and a «امتحان کنید» deep link.

---

## 4. Data handling rules (auditor, with counts)

### 4.1 Reference counts (DATA-REPORT and CI tolerance)

| Metric | Count |
|---|---|
| Shops / products / offers | 6,476 / 225,903 / 331,506 |
| Shops with offers (tier A) | 3,792 |
| Categories only (B) / neither (C) | 887 / 1,797 |
| Products with exactly 1 seller | 190,649 (84%) |
| Offer price null / below 1,000 / above 1e10 / zero | 15,083 / 1,645 / 211 / 0 |
| `last_price_changed_at` literal 'null' | 769 |
| Price months: 2026-10 / 09 / 08 / 07 / ≤06 | 128,845 / 87,626 / 28,370 / 18,402 / ~67k |
| Hours `{}` / placeholder shifts / overnight shifts | 2,003 / 23,329 / 0 |
| Friday closed (of 4,471 with hours) | 3,473 |
| Open share among offer shops with hours: Wed 11:00 / 20:00 / 21:00 / Thu 16:00 / Fri 12:00 | 97% / 19% / 8% / 51% / 20% |
| Shops with any payment option (all / among offer shops) / declaring in-person | 266 / 240 / 79 |
| Providers: ترب‌پی / اسنپ‌پی / دیجی‌پی / تارا / ازکی‌وام | 190 / 89 / 61 / 37 / 5 |
| Fast delivery true / false / null | 1,168 / 433 / 4,875 |
| Null brand / spec «برند» available | 168,269 (74%) / 41,329 |
| Empty specs / leaf categories | 81,304 / 3,428 |
| Warranty null | 272,563 (82%) |
| Redacted titles: product / seller | 849 / 1,036 |
| SEO-polluted seller titles | 12,854 |
| Multi-offer (shop, product) pairs | 9,557 |
| علا…الدین address variants | 547 |
| Address contains طبقه / واحد / پلاک | 4,224 / 2,380 / 5,091 |
| Areas: فردوسی / شیخ هادی / بهارستان | 3,282 / 1,587 / 616 |
| Instagram / website | 22 / 90 |
| Seller-text mentions: فیک / کپی / درجه یک / استوک / کارکرده / دست دوم / آکبند / رجیستر / نات اکتیو | 708 / 501 / 1,312 / 987 / 408 / 524 / ~600 / ~344 / 125 |
| Sneakers (کتانی و کفش اسپرت): products / 1-seller / shops | 865 / 856 / 49 |

### 4.2 Rules
1. **Freshness**: age = dataAsOf − changedAt. Buckets per D2. Cards show «۹ روز پیش»; detail pages show the Jalali date with the legend «سن قیمت نسبت به زمان تهیهٔ داده‌ها (۲۱ مهر ۱۴۰۵)». Show «زمان به‌روزرسانی نامشخص» for null.
2. **Price trust**: per DT2. Suspicious prices are never in min, median or rankings.
3. **Registered ≠ change time ≠ stock**: these are three separate fields everywhere. Stock is «تأیید نشده» until an inquiry or the seller confirms it.
4. **Unknown ≠ no**: null warranty, payment, hours or fast delivery render as unknown or nothing. Never «ندارد/بدون» unless it was explicitly recorded or answered.
5. **Hours**: per DT4. The open filter hides unknown-hours shops by default, with the toggle «نمایش فروشگاه‌های بدون ساعت کاری».
6. **Shop tiers**: per DT5. Tier C never appears in "where to buy".
7. **Payments**: per DT11. The badge states the information type: «اقساط حضوری با اسنپ‌پی (اعلام فروشنده)» / «ترب‌پی (نحوه پذیرش نامشخص)» / «در توضیحات به اقساط اشاره شده». Kalabarg is always «ثبت نشده — بپرسید».
8. **Seller text**: everything mined from it is labelled «طبق عنوان/توضیحات فروشنده». Word-boundary regexes only, including the fixed cheque rule.
9. **Brand**: per DT3, with the source shown on detail pages: «برند به‌صورت خودکار تشخیص داده شد».
10. **Malls/addresses**: per DT9 and DT10. Never infer a mall from coordinates alone.
11. **Contacts**: every phone number is fake. Mask it, never use `tel:`, and show the disclosure once on first run and in About. `name_is_real` (1.7%) is not a verification signal.
12. **Facets**: show only when coverage is at least 30%. Sparse attributes (under 60% coverage) filter as soft: match OR unknown.

### 4.3 /about «داده‌ها چقدر کامل است؟»
Show small bars and lines such as:
- «۷۴٪ محصولات برند ثبت‌شده ندارند؛ برند را از مشخصات و عنوان حدس زده‌ایم»
- «قیمت‌ها تا ۲۱ مهر ۱۴۰۵»
- «۲۱۱ قیمت غیرعادی کنار گذاشته شد»
- «۸۸۷ فروشگاه فقط دسته فعالیت دارند»
- «فقط ۴٪ فروشگاه‌ها روش پرداخت ثبت کرده‌اند»
- «حدود ۱۰٪ فروشگاه‌های تهران، از مناطق منتخب»

Also include the trust-label legend and the «در نسخهٔ واقعی» panel (real today vs. what production would plug in).

---

## 5. Parallel execution plan (few hours)

| Track | P0 items |
|---|---|
| Data | DT1–DT8, DT15 |
| Services | SV1–SV11 |
| Contact | CT1–CT6 |
| Agent | AG1–AG5 |
| Web A | W1, W2, W3, W6, W7, W8 |
| Web B | W4, W5, W9–W13 |
| Infra / QA | DP1–DP3, DM1–DM3 |

Contract changes first, in shared types (30 min): `Availability`, `AssortmentStore`, `NeedStoresResponse`, `ClusterSummary`, `UserContext.range/visitAt/priority`, `AppMeta.clock/dataAsOf`, `InquiryStatus += scheduled_at_open|callback_promised`, `InquiryQuestion += variant|registry|condition|cash_vs_installment|return_policy`, `AltReason += over_budget|no_installment`, `LiveEvent assistant.message`, `UIBlock insights|agent_plan`, `PriceStats.freshMedian`, `ShopLite.updateDiscipline`, `offers.attrs`.
