# Torob in the Loop — Architecture & Build Contract

Read `docs/PRD.md` first (what & why). This file is **how**, and it is binding for every contributor/agent.

## 1. Overview

```
             ┌──────────────────────────── single container (Liara / Docker) ───────────────────────────┐
 Browser ──► │ Hono (Node 22) ── /api/* ──► services (catalog, read-only SQLite + FTS5)                  │
 (PWA, RTL)  │      │                    ├─► contact (inquiries, AI-call simulator, scheduler, seller inbox)│
             │      │                    ├─► agent (LLM tool-calling ⇄ OpenAI-compatible gateway | rules)  │
             │      │                    └─► EventBus ──► SSE (/api/events, /api/chat, seller events)       │
             │      └── static SPA (apps/web/dist)                                                         │
             │ catalog.db (image layer, read-only)        state.db (WAL, persistent disk /var/lib/torob-in-the-loop) │
             └─────────────────────────────────────────────────────────────────────────────────────────────┘
 Build time: dataset CSVs ──► packages/etl ──► data/catalog.db (normalized, enriched, FTS-indexed)
```

- **Zero native dependencies**: SQLite via Node's built-in `node:sqlite` (FTS5 included). Server is bundled by esbuild into one file → runtime image needs no `node_modules`.
- **Read-only catalog / read-write state split**: catalog is an immutable build artifact (scale out = more replicas); mutable state is small and lives on a disk.
- **LLM optional**: everything works with the deterministic Persian assistant; the LLM (any OpenAI-compatible gateway, e.g. Liara AI) adds conversation quality, never facts.

## 2. Repository layout & ownership

```
packages/shared/     contract: types.ts (API DTOs), text.ts (Persian normalization), format.ts, time.ts, geo.ts, constants.ts, context.ts
packages/etl/        catalog builder: src/build.ts, src/schema.sql, enrichment modules, data/*.json (taxonomy, synonyms, brands, places, osm/)
apps/server/src/
  index.ts app.ts config.ts logger.ts http.ts static.ts bus.ts deps.ts   ← composition (owner: lead)
  db/                 sqlite.ts catalog.ts state.ts state-schema.sql       ← (owner: lead)
  domain/             pure logic: hours, travel/metro, ranking, price, mall guide, nlu   ← catalog-services
  services/           Services implementation (types.ts is the contract)              ← catalog-services
  routes/catalog.ts   REST for services                                               ← catalog-services
  contact/ routes/{inquiries,seller,events,reports}.ts channels/                      ← contact
  agent/ routes/chat.ts                                                               ← agent
apps/web/src/         SPA (foundation first, then pages)                               ← web-*
docs/                 PRD, ARCHITECTURE, DATA, DEPLOY, DEMO
Dockerfile liara.json .liaraignore .dockerignore docker-compose.yml .github/          ← deploy
```

Rules:
- **Do not add npm dependencies.** Everything needed is installed (see package.json files). If something is truly missing, implement it or report it.
- **Do not edit files owned by another area** except: you may *append* optional fields/types to `packages/shared/src/types.ts` using minimal `Edit` insertions (never rewrite the file). Document additions in your final report.
- ESM everywhere; relative imports end with `.js` (TS resolves to `.ts`). Import shared code from `@titl/shared`.
- TypeScript strict + `noUncheckedIndexedAccess`. `npm run typecheck` must pass for your workspace.
- Money = integer Toman. Store/transport ISO UTC; display Tehran time & Jalali via shared `format.ts`.
- All user-facing copy is Persian, polite-friendly («شما»), with correct half-spaces (می‌خواهید، فروشگاه‌ها، به‌روز). Digits shown to users are Persian (use shared formatters).

## 3. Stack (pinned)

Node ≥ 22.13 · TypeScript 5.9 · Hono 4 + @hono/node-server 1 · zod 3 · node:sqlite (SQLite 3.51, FTS5) · esbuild · Vite 7 · React 19 · React Router 7 (`createBrowserRouter` from `react-router`) · TanStack Query 5 · Zustand 5 · Tailwind CSS 4 (`@tailwindcss/vite`, CSS-first `@theme`) · lucide-react 0.577 · sonner 2 (toasts) · vaul 1.1 (bottom sheets) · motion 12 (`motion/react`) · Leaflet 1.9 + react-leaflet 5 · qrcode.react 4 · @fontsource-variable/vazirmatn · Vitest 3 · Playwright.

## 4. Data pipeline (packages/etl)

`npm run data:build` → reads `DATASET_DIR` (default `../dataset` relative to repo root, i.e. `/Users/.../torob/dataset`) → writes `data/catalog.db` (schema: `packages/etl/src/schema.sql`) → `VACUUM`, `journal_mode=DELETE`, `ANALYZE`, FTS `optimize`. Must finish in < 3 min on a laptop. Log a quality report (counts per rule) and write it to `docs/DATA-REPORT.md`.

Parsing: `csv-parse` (RFC4180, multiline quoted fields, `relax_quotes`). The literal string `null` means NULL. JSON columns are JSON strings.

Enrichment rules (all deterministic, unit-tested):
1. **Text**: `cleanFa` for display strings, `normalizeForSearch` for every `*_norm` and FTS column.
2. **Prices** (`offers.price_toman`): `0`/empty → `missing`. Per product, compute median of positive prices; mark `suspicious` when `> 1e10` (10B Toman) or `< 1000`, or (product has ≥3 positive prices and price > 8× median or < median/8). Only `ok` prices feed stats/ranking; raw value kept in `raw_price`.
3. **Freshness**: `price_changed_at` copied (null kept). `data_as_of` meta = max timestamp.
4. **Variants**: multiple offers of the same (shop, product) are kept as rows; services aggregate per shop (min price, distinct seller titles).
5. **Titles**: catalog `persian_title` unless it is the redaction placeholder «عنوان حذف‌شده برای انتشار» → best non-redacted seller title (most frequent) with `title_source='seller'` → else «{category} {brand?}» with `title_source='generated'`. `title_en`: Latin text in title or spec «نام محصول» if Latin.
6. **Brand**: dataset `brand_name`; else infer from title using `data/brands.json` aliases (longest match, word-boundary) → `brand_inferred=1`. `null` stays null.
7. **Category group**: `data/taxonomy.json` maps every leaf category → group id (from shared `CATEGORY_GROUPS`) + aliases. Unmapped → `other` (report count).
8. **Audience** (fashion/shoes/watch/beauty/sports groups only): title contains مردانه/پسرانه→men, زنانه/دخترانه→women, بچگانه/کودک/نوزاد→kids, «مردانه و زنانه»/«یونیسکس»→unisex.
9. **Specs**: compact `[[key,value],…]` (drop section unless not «مشخصات کلی»; trim; dedupe). Facets (`product_facets`): per category, keys present in ≥30% of products with 2–25 distinct values (normalize value text: cleanFa, unify units like «گیگابایت»→«GB»); skip free-text keys (توضیحات, ابعاد, وزن…).
10. **Hours** → `WeeklyHours` JSON: per day `declared`→`open` with non-placeholder shifts (`00:00–00:00` dropped; `end <= start` → treat end as next day); `closed`→`closed`; `unsupported`→`unknown`; `{}` → `hours=NULL, hours_declared=0`. `suspicious=1` if any shift starts < 06:00 or > 23:00, lasts < 1 h, or total > 18 h.
11. **Address → in-mall location** (`floor_label, floor_num, unit, plaque, wing, landmark, mall_id, loc_confidence`): split on «،» / «,». Mall segment = first segment starting with پاساژ|مجتمع (تجاری)?|مرکز خرید|بازار|سرای|ساختمان|برج|تیمچه|مال (ignore segments starting with روبه‌روی/روبروی/مقابل/جنب/کنار/نبش/بعد از/قبل از/نرسیده — those are **landmarks**). Floors: «همکف»=0, «زیرزمین»/«منفی یک»/«-۱»/«۱-»=−1, «منفی دو»=−2, ordinal words (اول…دهم) and digits, «3/1» → label kept, num=3, typo «طیقه» accepted, «آخر» → label only. Unit: «واحد X», «غرفه X», «پلاک X» (plaque when no unit). Wing: «راهرو(ی) …», «لاین …», «بخش …», «بلوک …», «ضلع …». Confidence: high = mall + floor + unit/plaque; medium = two of them; low otherwise.
12. **Malls**: cluster shops by normalized mall key (normalizeForSearch, strip kind words, strip «ء»/«ا» variance e.g. علاءالدین≈علالدین, keep trailing numbers like «۲») **and** coordinates within 250 m of the cluster centroid. Display name = most frequent original spelling (cleaned). `slug` = `slugifyFa(name)-<id>`. Floors summary from member shops.
13. **Payments** → `PaymentOption[]`: provider name mapped with shared `PROVIDERS[*].aliases` (unknown names → `other`, keep label); channel as registered; min/max `0` → null. `installment=1` if any installment provider; `torobpay_in_person=1` if torobpay with channel `in_person`.
14. **Text hints** from offer descriptions (shop-level OR of its offers, offer-level in `offers.hints`): قسط|اقساط → installment; چک → cheque; ارسال فوری → fast_delivery; پرداخت درب محل|پرداخت در محل → pay_on_delivery.
15. **Warranty** → `WarrantyInfo`: provider «بدون گارانتی» → none; «تست و تحویل در حضور مشتری» → test_delivery; provider «شرکتی» or months → company; description containing اصالت → authenticity; تعویض → exchange; else other. Label in Persian (e.g. «۱۸ ماه گارانتی شرکتی», «تست و تحویل در حضور مشتری», «ضمانت اصالت کالا»).
16. **Phones**: `phone_kind` = mobile if starts with ۰۹/09 else landline. (All fake — UI says so.)
17. **name_is_real** = instagram or website present.
18. **Areas**: centroid per `location_label`, counts, `in_traffic_zone` via shared `inTrafficZone`.
19. **Metro**: from `data/osm/metro.json` (stations), lines from `routes.json` + `route_nodes.json` (match route stop/platform nodes to stations by name or ≤ 350 m). Normalize names (drop «ایستگاه مترو»). Source: © OpenStreetMap contributors (ODbL) — credit in About page.
20. **Places** gazetteer: areas (from data), metro stations, malls (≥5 shops), and `data/places.json` (curated Tehran landmarks/squares/neighborhoods with approximate coordinates, `weight` for ordering).
21. **Popularity** = `ln(1+shop_count)*1.0 + (images?0.3:0) + (spec_count>3?0.15:0) + (valid_price_count>0?0.3:0) + freshness bonus (fresh 0.25 / recent 0.15 / stale 0.05)`.
22. **FTS**: per product insert normalized `title`, `brand` (+aliases), `category` (leaf + group name + taxonomy aliases), `extra` (model, title_en, ≤5 distinct seller titles, top spec values ≤ 200 chars).
23. **Synonyms**: `data/synonyms.json` (`{ "کتونی": ["کتانی","اسنیکرز","کفش اسپرت"], … }`) → normalized into `synonyms`.
24. `packages/etl/fixtures/` — a small, **real-data** sample (≈300 shops incl. malls/hours/payments edge cases, their offers, ≈3k products) generated by `npm run data:fixtures`, used by server tests (`CATALOG_PATH=data/fixture.db`).

## 5. Search (services/search)

1. `parseQuery(q)` (domain/nlu.ts, Persian NLU, also used by the rules agent):
   - budget: «زیر|کمتر از|تا|حداکثر X (میلیون|میلیارد|هزار|تومن|تومان)», «بین X تا Y», «حدود X» (±20%), «بالای X»; Persian/Latin digits & words (یک…ده, نیم = 0.5, «۲.۵»). No unit and X < 1000 → millions.
   - installment: قسطی|اقساط|اقساطی|اعتباری|قسط + provider names (ترب‌پی…).
   - open now: «الان باز», «همین الان», «باز باشه».
   - area: «نزدیک|اطراف|حوالی|تو|در|سمت <place>» matched against `places` (areas, landmarks, metro, malls) → `areaLabel` + `location`.
   - audience words; brand (brands aliases); category (taxonomy aliases + category names; exact phrase > partial).
   - Remaining tokens (minus stopwords) → `keywords`. Chips for every extracted part.
2. Candidate retrieval: FTS5 `MATCH` with keywords (synonym-expanded `(a OR b)` groups, last token as prefix `tok*`, lightStem variants), AND across groups; fallback to OR if < 5 hits; fallback to `title_norm LIKE` (trigram-ish) if still empty → `didYouMean` from nearest category/brand by edit distance.
   Weighted `bm25(products_fts, 10.0, 6.0, 4.0, 1.5)`.
3. Filters: category/group/brand/audience/spec facets (via `product_facets`), price (overlap of [price_min, price_max] with budget), `minSellers`, context `installment` (`installment_shop_count>0`), `nearOnly` (≥1 seller within `maxDistanceKm||5`).
4. Rank = `-bm25_norm*1.0 + popularity*0.35 + (category match 0.6) + (brand match 0.4) + proximity bonus (nearest ≤2 km 0.4, ≤5 km 0.2)`; sorts override.
5. Per result compute `nearest`, `sellersNearby` (radius ctx.maxDistanceKm || 3), `reasons` (e.g. «ارزان‌ترین بین نتایج», «{n} فروشنده نزدیک شما», «مطابق بودجه», «قسطی در {n} فروشگاه», «قیمت‌ها تازه»). Compute distances only for the result page (≤ 24 items) — query offers by product_rid.
6. Facets over the full candidate set (cap 5k): top categories, brands (incl. inferred), price tiers (quantiles p25/p50/p75/p90 of candidate medians → budget/mid/premium/luxury), audiences, spec facets (only when one category dominates ≥ 60%), installment count, near count.
7. p95 < 150 ms on the full catalog.

## 6. Catalog services (services/*, domain/*)

- **hours** `openStatusAt(hours, at)`: Tehran wall clock (shared `tehranParts`); state `open` / `closing_soon` (≤ 45 min to close) / `opens_later_today` / `closed` (with next opening day/time, scanning 7 days) / `unknown` (no hours or day unknown). Persian labels: «باز است تا ۱۹:۰۰», «۳۰ دقیقه تا بسته شدن», «امروز ساعت ۱۶:۰۰ باز می‌شود», «بسته — شنبه ۱۰:۰۰ باز می‌شود», «ساعت کاری ثبت نشده». Overnight shifts supported.
- **travel** `travelEstimate(from, to, mode, at)`: shared `estimateTravelMinutes` (rush hours via `isRushHour`); for `metro` use nearest stations at both ends (walk ≤ 1.5 km each, else fall back to taxi and say so).
- **ranking** (StoreOffer.score 0–100): weights price 0.35 · distance 0.25 · open-at-visit 0.15 · freshness 0.15 · extras 0.10.
  - price: `1 - (p - min)/(max - min)` among valid prices of candidate stores (single → 1; missing/suspicious → 0.3).
  - distance: `exp(-km/4)`; no location → 0.5.
  - open: open 1 · closing_soon 0.5 · opens_later_today 0.6 · unknown 0.55 · closed 0.1.
  - freshness: fresh 1 · recent 0.75 · stale 0.4 · very_stale 0.15 · unknown 0.3.
  - extras: company warranty +0.3, hours declared +0.2, in-mall location confidence high +0.2, payment matches context +0.3; **verified in_stock within 24 h → score += 15 (cap 100)**; verified out_of_stock → score −40; crowd report «closed/out_of_stock» in last 12 h → −15.
  - Reasons: top 3 contributing factors + caveats (e.g. «قیمت ۴۰ روز پیش ثبت شده — استعلام کنید», «امروز بسته است»).
  - Hard filters from context: `installment`/`providers` (shop payment), `openNow` (open/closing_soon at visit time), `maxDistanceKm`, `warrantyOnly` (warranty kind company/test_delivery), `fastDelivery` (fast_delivery=1), budget (registered price within budget; missing price kept but flagged). `kalabarg` never filters (no data) — add reason «کالابرگ ثبت نشده — بپرسید». Count `excludedByFilters`.
- **getStores**: aggregate offers per shop for the product; category-only candidates = shops with `shop_categories.category_id = product.category_id` and **no** offer for this product, sorted by distance (≤ 10); areas = group stores by shop.area.
- **alternatives(reason)**: (1) same product at other shops, filtered to open-at-visit (for closed/no_answer/unreachable), excluding the failed shop, ranked by (same mall first, then distance); (2) category-only shops in the same mall/area; (3) similar products: same category (+brand bonus), price within ±35% of the product median, ≥1 seller nearby; for `too_expensive` sort by price.
- **plan**: open-at-arrival per stop using travel legs; order = nearest-neighbor from origin + 2-opt (≤ 8 stops), same-mall stops consecutive, floors ascending; dwell 10 min (+5 per extra product); warnings: closing ≤ 30 min after arrival, closed at arrival (suggest next opening), Thursday short hours, Friday closed, rush hour, traffic zone (advise metro/taxi); `leaveBy` = latest departure keeping all stops open; tips (metro stations with lines, «اول به طبقات بالاتر بروید…»). Save to state? (no — services are stateless; contact/agent may persist).
- **mall guide** `buildGuide(row)`: guide steps e.g. [«پاساژ علاءالدین ۲», «طبقه ششم», «واحد ۶۲۲»], plus heuristic hints labeled as such: unit number starting with floor digit («شماره واحدهای این طبقه معمولاً با ۶ شروع می‌شود»), wing/landmark lines.
- **places/reversePlace**: prefix + contains match on `places.name_norm`, weighted; reverse = nearest area/landmark within 2 km.
- **meta**: counts, data_as_of, features from config, providers, groups (with top categories), areas, map tile config, examples.

## 7. REST API (all JSON; context params per `shared/context.ts`: lat,lng,loc,locsrc,bmin,bmax,inst,prov,open,war,fast,kb,km,mode,at)

| Method & path | Input | Output | Owner |
|---|---|---|---|
| GET `/api/health` | – | `HealthResponse` | lead |
| GET `/api/meta` | – | `AppMeta` | services |
| GET `/api/places?q=&limit=` | – | `Place[]` | services |
| GET `/api/places/reverse?lat&lng` | – | `Place \| null` | services |
| GET `/api/search?q&category&group&brand&priceMin&priceMax&minSellers&nearOnly&audience&spec(repeat)&sort&page&limit` + ctx | | `SearchResponse` | services |
| GET `/api/suggest?q=` | | `SuggestResponse` | services |
| GET `/api/discover?q&category` + ctx | | `DiscoveryResponse` | services |
| GET `/api/products/:id` + ctx | | `ProductDetail` | services |
| GET `/api/products/:id/stores?sort&limit` + ctx | | `StoresResponse` | services |
| GET `/api/products/:id/similar?limit` + ctx | | `ProductSummary[]` | services |
| GET `/api/products/:id/areas` + ctx | | `AreaSummary[]` | services |
| GET `/api/compare/products?ids=a,b,c` + ctx | | `CompareProductsResponse` | services |
| POST `/api/compare/products/verdict` `{ids, context}` | | `{ verdict: string \| null }` | agent |
| GET `/api/compare/stores?product=&shops=a,b` + ctx | | `CompareStoresResponse` | services |
| GET `/api/shops/:id` + ctx | | `ShopDetail` | services |
| GET `/api/shops/:id/products?q&page&limit` + ctx | | `ShopProductsResponse` | services |
| GET `/api/shops?q=&limit=` | | `ShopLite[]` | services |
| POST `/api/shops/:id/reports` `{type, note?, sessionId}` | | `CrowdReport` | contact |
| GET `/api/malls/:slug` + ctx | | `MallDetail` | services |
| POST `/api/alternatives` `AlternativesRequest` | | `AlternativesResponse` | services |
| POST `/api/plan` `VisitPlanRequest & {context?}` | | `VisitPlan` | services |
| POST `/api/inquiries` `CreateInquiriesRequest` | | `{ inquiries: Inquiry[] }` | contact |
| GET `/api/inquiries?sessionId=` | | `{ inquiries: Inquiry[] }` | contact |
| GET `/api/inquiries/:id` | | `Inquiry` | contact |
| POST `/api/inquiries/:id/retry` · `/cancel` | | `Inquiry` | contact |
| GET `/api/events?sessionId=` (SSE) | | `LiveEvent` frames | contact |
| GET `/api/seller/shops?q=` | | `ShopLite[]` (shops with offers first) | contact |
| GET `/api/seller/:shopId/inquiries` | | `{ inquiries: Inquiry[] }` | contact |
| POST `/api/seller/:shopId/inquiries/:id/reply` `SellerReplyRequest` | | `Inquiry` | contact |
| GET `/api/seller/:shopId/events` (SSE) | | `SellerLiveEvent` frames | contact |
| POST `/api/chat` `ChatRequest` (SSE response) | | `AgentEvent` frames | agent |
| GET `/api/chat/history?sessionId=` | | `{ messages: ChatMessageDTO[] }` | agent |
| POST `/api/chat/reset` `{sessionId}` | | `{ ok: true }` | agent |
| POST `/api/transcribe` (multipart `audio`) | | `{ text: string \| null }` | agent |

Errors: `{ error: { code, message } }` (Persian message) via `ApiErr`. Validation with zod (`http.ts body()`). Rate limits: chat & inquiries per IP. **SSE frame format** (all streams): `data: <JSON>\n\n`; server sends `{type:'ping'}` every 15 s; headers `Cache-Control: no-cache`, `X-Accel-Buffering: no`. Use `streamSSE` from `hono/streaming`.

## 8. Assistant (apps/server/src/agent)

- `llm.ts`: fetch-based OpenAI-compatible client (`POST {LLM_BASE_URL}/chat/completions`, `Authorization: Bearer`, `stream: true`, tools). Parse SSE deltas incl. `tool_calls` fragments. Timeout `LLM_TIMEOUT_MS`, abort on client disconnect. `LLM_BASE_URL` may or may not end with `/`.
- Tools (JSON-schema function definitions; implementations call `Services`/`ContactModule`; each returns `{ llm: <compact JSON summary ≤ 1.5k chars>, block?: UIBlock, patch?: Partial<UserContext> }`):
  `search_products(query, category?, brand?, budget_min?, budget_max?, audience?, near_only?, sort?)` · `discovery_questions(query?, category?)` · `get_product(product_id)` · `compare_products(product_ids[2..4])` · `find_stores(product_id, sort?)` · `compare_stores(product_id, shop_ids[2..4])` · `nearby_areas(product_id?)` · `shop_info(shop_id)` · `mall_info(mall)` · `contact_stores(shop_ids[1..5], product_id?, questions[], custom_question?)` · `inquiry_status()` · `find_alternatives(reason, product_id?, shop_id?)` · `plan_visit(shop_ids[], product_id?, depart_at?, mode?)` · `update_preferences(location_label?, budget_min?, budget_max?, installment?, providers?, open_now?, warranty_only?, max_distance_km?, travel_mode?, visit_at?)` · `suggest_replies(options[{label,message}] ≤ 4)`.
- Loop: system prompt (Persian persona «Torob in the Loop»; Tehran time & weekday; user context; rules below) + last 8 turns (user text, assistant text, compact tool summaries) → stream → execute tool calls (emit `status` before each, Persian «در حال جستجو…») → append results → repeat ≤ `LLM_MAX_STEPS`. Emit `text` deltas, `block`s, `context` patches, `done`.
- Prompt rules: facts only from tools; registered price ≠ confirmed price ≠ stock; mention freshness when quoting prices; unknown → say so + offer to ask; vague need → `discovery_questions` (≤ 2 questions); short replies (≤ 3 sentences, UI blocks carry details, never re-list items in text); always end with a next step (`suggest_replies`); respect context & call `update_preferences` on new constraints; consider visit time vs hours/closing & travel; on closed/no-answer/out-of-stock → `find_alternatives` immediately; Persian, friendly.
- **Rules fallback** (`rules.ts`) when LLM disabled/fails: intent detection (search / help-me-choose / stores / compare / contact / plan / alternatives / hours / mall / thanks/help) from Persian keywords + session state (last products, last product, last stores, last inquiries) → same tools → templated Persian replies + quick replies. Mode reported in `done`.
- Persistence: `chat_messages` (state DB). Session working memory (last shown product ids, selected product, shop ids) kept in the assistant message `llm_messages` JSON.
- `compareVerdict` (fast model, ≤ 120 words, grounded in the comparison JSON) and `transcribe` (POST `{base}/audio/transcriptions`, model `STT_MODEL`).

## 9. Contact & follow-up (apps/server/src/contact)

- `createInquiries`: one inquiry per shop (`batchId` shared), snapshot `registeredPrice`, status `queued`, enqueue attempt job immediately (stagger 0.8 s per shop). Seller-inbox copy is always created (sellers see it in `/seller`).
- **State machine**: queued → calling → in_call → answered → resolved | (no_answer | busy | closed) → retry_scheduled (+`FOLLOWUP_RETRY_SECONDS`, ×1.5 backoff) → … → after `max_attempts` → unreachable → alternatives computed (`services.alternatives(reason:'unreachable'|'closed')`) + `notification`. Seller reply at any time → resolved with `resultSource='seller_inbox'` (cancels pending jobs). `out_of_stock` result → alternatives + notification too.
- **Simulation engine** (`simulator.ts`, demo mode): deterministic PRNG seeded by `inquiryId+attempt`.
  1. Outcome: shop closed at call time (hours) → `closed` (no pickup). Else answered 72% (85% on retries), no_answer 18%, busy 10%. Crowd report closed → +20% no_answer.
  2. Facts when answered: stock in 72% / limited 13% / out 15%; price unchanged if fresh (80%) else change; change % ∈ [+2, +12] (90%) or [−5, −1] (10%), rounded to 10,000 Toman; hours today from data (or plausible «تا ۲۰» if unknown, flagged); hold: if requested & in stock → until min(closing − 30 min, now + 3 h); installment: providers from data → «بله، با …»; else 25% «فقط چک» / 75% «خیر»; kalabarg: 10% yes; location: from parsed guide, plus a landmark hint; warranty from offer.
  3. Transcript lines: agent greeting naming «دستیار خرید Torob in the Loop», each question, store answers, closing. Verbalized by the LLM fast model when enabled (facts JSON in, strictly no new facts), else rich templates with variation. Stream lines with delays (900–1600 ms / `CALL_SPEED`), emitting `inquiry.line` + `inquiry.updated`.
- Scheduler: `setInterval` 1 s; claims due jobs from `jobs` (lock 30 s); restart-safe (pending `calling` inquiries older than 2 min are re-queued at boot).
- `verification.latestFor(productId, shopIds)` → newest resolved result within 24 h per shop → `VerifiedInfo`.
- Reports: insert; `reports.forShop`, `recentByShops`.
- SSE: `/api/events?sessionId` subscribes to bus; seller SSE per shop.
- Bale (P2, `channels/bale.ts`): if `BALE_BOT_TOKEN`, `POST https://tapi.bale.ai/bot<token>/sendMessage` with inline keyboard to linked chats (`/start <shopId>`), webhook `/api/channels/bale/webhook` (secret path segment) → sellerReply.

## 10. Web app (apps/web)

- Routes: `/` assistant home · `/search` · `/p/:id` product · `/p/:id/stores` (full list & map) · `/compare` (products, `?ids=`) · `/compare/stores?product=&shops=` · `/shop/:id` · `/mall/:slug` · `/inquiries` · `/inquiries/:id` (live call view) · `/plan` · `/seller` + `/seller/:shopId` · `/about` · `*` 404.
- State: `zustand` stores (persisted to localStorage): `useContextStore` (UserContext + setters), `useSession` (sessionId UUID), `useCompare` (product ids ≤4; store ids per product ≤4), `usePlan` (stops), `useRecent` (searches). Server data via TanStack Query with keys including encoded context so changing context refetches.
- `lib/api.ts`: typed fetchers for every endpoint (shared types), context appended via `contextToParams`. `lib/sse.ts`: `streamPost(url, body, onEvent, signal)` (fetch + ReadableStream SSE parser) and `useLiveEvents(sessionId)` (EventSource with reconnect → React Query cache updates + sonner toasts).
- Shell: sticky header (logo, location chip, mode badge), **ContextBar** (chips → vaul bottom sheets: Location (GPS / search places / map pick), Budget (presets + inputs), Conditions (toggles incl. provider multi-select, Kalabarg with "no data" note), Visit time (now / today at / tomorrow), Travel mode), bottom tab bar (دستیار · جستجو · پیگیری‌ها (live badge) · برنامه) respecting safe-area insets. Desktop ≥ 1024 px: centered 440 px app + side panel (intro, QR to open on phone, demo tips).
- **Design system is owned by the `ui-ux-pro-max` skill** (installed at `.claude/skills/ui-ux-pro-max`, invoke via the Skill tool). Source of truth: `design-system/torob-in-the-loop/MASTER.md` (read its "⭐ Torob in the Loop adaptations" section first) + page overrides in `design-system/torob-in-the-loop/pages/{assistant,search,product,stores,inquiry,visit-plan,seller}.md`. Every UI change must: read MASTER + the page override, run targeted skill searches (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux|style|color|icons` and `--stack react` / `--stack html-tailwind`), and pass the Pre-Delivery Checklist (`.claude/skills/ui-ux-pro-max/references/pro-rules.md`). Summary: E-commerce palette — primary emerald `#059669` (graphics) / `#047857` (solid buttons & text), accent orange `#EA580C` / `#C2410C` (CTA with white text), background `#ECFDF5`, white cards; Vazirmatn (variable, Arabic-script); lucide icons only, **no emoji icons**; Minimalism & Swiss base with Vibrant & Block-based accents; contrast ≥ 4.5:1 for text; touch ≥ 44 px; `prefers-reduced-motion`; `dvh` + safe areas. Radius: cards `rounded-2xl`, chips `rounded-full`. Base font 15–16 px, line-height ≈ 1.65, `tabular-nums` for prices.
- Core components (`components/`): `ui/` (Button, IconButton, Chip, Badge, Card, Sheet (vaul), Tabs, Skeleton, EmptyState, ErrorState, Spinner, Toggle, Segmented, Stepper), `data/` (**PriceTag** registered+freshness, **VerifiedBadge**, **FreshnessBadge**, **OpenStatusBadge**, **PaymentBadges** (with channel info), **WarrantyBadge**, **Unknown** («نامشخص» + why + optional «بپرس» action), **ReasonChips**, **DistanceEta**, **InMallGuide**, **DataNote**), `product/` (ProductCard, ProductGrid, CompareTray, SpecTable, PriceStatsPanel, Gallery), `store/` (StoreOfferCard, StoreList with sort tabs, CandidateShops, AreasStrip, StoreCompareTable, StoreMap), `inquiry/` (AskSheet question picker, CallScreen live transcript, InquiryCard, InquiryTimeline, ResultCard), `plan/` (PlanTimeline, StopCard, OnSiteActions), `chat/` (Composer with mic, MessageList, AssistantMessage rendering `UIBlock`s, StatusLine, QuickReplies), `map/` (LeafletMap lazy-loaded).
- Every card answers: what (title/price), **why** (ReasonChips), **trust** (freshness/verified/unknown), **next step** (primary button). No dead ends: empty/error states always offer an action (widen radius, remove filter, ask stores, try alternatives).
- PWA: `public/manifest.webmanifest`, icons, `public/sw.js` (cache-first for assets/fonts/torob images, network-first for API with offline fallback for `/api/plan`, shop & mall details already visited).

## 11. Deploy (Liara)

Single Docker image (Dockerfile multi-stage: deps → build web+server → runtime `node:22-*-slim` with `dist/` + `apps/web/dist` + `data/catalog.db`). `liara.json`: platform `docker`, port 3000, `healthCheck` (`/api/health`), disk `torob-in-the-loop-data` mounted at `/var/lib/torob-in-the-loop` (`STATE_DB_PATH=/var/lib/torob-in-the-loop/state.db`). Catalog shipped prebuilt (`data/catalog.db`, compressed upload < 128 MB). Env via Liara console (`LLM_*`, optional `BALE_*`, `NESHAN_API_KEY`). GitHub Actions: typecheck + tests + build on PR; deploy job with `liara deploy --api-token` when secrets exist. `scripts/smoke.sh <url>` hits health, search, product, stores, inquiry, chat.

## 12. Testing & quality gates

- Vitest unit tests: shared (normalize, format, context), etl (address/floor parser, hours, price validity, warranty, payments, brand inference), server domain (openStatusAt incl. overnight & Friday, ranking, nlu budget/area/installment parsing, plan ordering), contact (state machine, simulator determinism), agent (rules intents, LLM stream parser with a mock server).
- API tests with `app.request()` against `data/fixture.db`.
- Playwright e2e (mobile viewport 390×844, `fa` locale): search→product→stores→ask→live result→plan; assistant chat (rules mode); seller reply flow.
- Budgets: API p95 < 300 ms; initial JS < 250 KB gz; Lighthouse PWA/a11y ≥ 90.
