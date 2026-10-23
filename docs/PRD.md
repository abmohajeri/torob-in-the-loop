# Torob in the Loop (Torob in the Loop) — Product Requirements

> دستیار هوشمند خرید حضوری از فروشگاه‌ها، پاساژها و مراکز خرید تهران — بر پایه داده‌های ترب
> Smart in-person shopping assistant for Tehran's shops, passages and malls — built on the Torob dataset.

This document is the product contract. Every build agent must read it. UI copy is Persian (RTL); this doc is English for precision, with Persian copy where wording matters.

---

## 1. The challenge, distilled

Source: `challenge-text.txt` + video transcript (Torob, product lead of the in-store team).

The assistant must guide a user through **four steps** of in-person shopping:

| # | Step | What the video asks |
|---|------|--------------------|
| 1 | **Decide what to buy** | User may not know the model ("I want sneakers but don't know which model"). Compare products & prices, learn the user's needs, recommend models. |
| 2 | **Find stores that have it** | Find stores carrying the product; use the user's location; suggest nearby **areas** and nearby **stores**. |
| 3 | **Compare stores** | By price, distance, working hours. |
| 4 | **Contact stores** | Ask about hours, **verify stale price/stock** (sellers rarely update), Q&A with the store (services like Google's "Let Google Call") so the user gets accurate info. |

Explicit pain points from the video:
- User doesn't know the right model → guided choice.
- Registered price is old → call/ask the store for updated price & stock.
- Seller doesn't answer, or user arrives and **store is closed** → instantly suggest **alternatives**.
- User finds the passage but **can't find the shop inside it** → use the shop's text info to give a precise in-passage location (floor/unit/wing/landmark).
- User wants **installment (قسطی/اعتباری) only** → filter to stores with credit-purchase services.
- Must use the Torob dataset; must be **deployed** (Liara suggested); **UI/UX quality is emphasized repeatedly**.

Explicit requirements from the text:
- Not every flow goes through chat: **cards, filters and buttons** let users progress without re-asking.
- Results and comparisons must show **why** something is recommended and **what the next step is**.
- User can easily change **area, budget and purchase conditions** and immediately see new results.
- **Never conflate**: registered price ≠ price-change time ≠ confirmed stock.
- **Show unknown information explicitly.**
- Persian, RTL, mobile-first.
- Product/UX first; scalable engineering second.
- Distinguish a shop that **has a specific product** (offer) from a business whose **activity category** merely matches (category ≠ availability).
- Torob Pay in-person acceptance + seller-declared installment services, **with the information type shown**; Kalabarg & fast delivery where registered.

### Scoring rubric (300)
| Criterion | Pts | How we win it |
|---|---|---|
| Product | 75 | All 4 steps end-to-end + every pain point has a dedicated feature (§3). |
| UX | 75 | Mobile-first PWA, chat **and** structured UI, persistent context bar, zero dead ends, clear "why" + "next step" on every card. |
| Intelligence | 50 | Tool-using agent; AI calls with verification; automatic follow-up & retries; alternatives engine; visit-condition reasoning (time/location/need). |
| Deploy | 40 | One-container Docker on Liara, zero native deps, health checks, persistent disk, CI, smoke test, documented runbook. |
| Technical | 40 | Typed monorepo, shared contracts, FTS5 search, tests, clean module boundaries, perf budgets, graceful LLM fallback. |
| Dataset | 20 | Every field used correctly, provenance labels, freshness, outliers & redactions handled, coverage disclosed. |

---

## 2. Dataset facts that shape the product (verified by profiling)

- `shops.csv` 6,476 shops; `products.csv` 225,903; `offers.csv` 331,506 (prices in **Toman**).
- **Geography is concentrated downtown**: area (`location_label`) فردوسی 3,282, شیخ هادی 1,587, بهارستان 616 (≈85%); 31 areas total. All coords inside Tehran. → "nearby areas" matters; walking between passages downtown is the common trip; downtown is inside the traffic-restricted zone → metro advice.
- **Addresses are rich**: پاساژ 3,179 shops, مجتمع 467, مرکز خرید 40, سرای 42, بازار 186; طبقه 4,224; واحد 2,380; پلاک 5,091; wings ("راهروی جنوبی", "لاین راست", "بخش غربی"), landmarks ("روبه روی کافه نادری", "نبش ..."). Floor formats: «همکف», «زیرزمین», «منفی یک», «۲-», «3/1», «آخر», «ششم», typo «طیقه». Units like «B12», «C13», «۴/۱۶۵».
- **Weekly hours**: 4,473 shops declared; per day `status ∈ {declared, closed, unsupported}`; up to 2 shifts; `00:00:00–00:00:00` is an empty placeholder; some nonsense (e.g. 02:00–08:00) → flag. Thursday short hours & Friday closures are common.
- **Contacts**: exactly one phone per shop, **all fake** (4,381 mobile `۰۹…`, 2,095 landline `۰۲…`). No WhatsApp/Bale in data.
- **Names**: 6,364/6,476 shop names are fake; the 112 real ones have Instagram (22) or website (90).
- **Payment options** (`payment_options` JSON): providers ترب‌پی (190 shops; 50 `in_person`), اسنپ‌پی (89), دیجی پی (61), تارا (37), ازکی‌وام (5) + a few junk provider names. `channel ∈ {in_person, unknown}` = the "information type". ~240 shops with offers have ≥1 provider. Min/max price mostly null/0 (=unknown).
- **Kalabarg: zero records anywhere** → always "ثبت نشده" + "ask the store" action.
- **Fast delivery**: true 1,168 / false 433 / null 4,875 (tri-state!). Offer descriptions mention «ارسال فوری» 757×; «قسط/اقساط» 301× (24 shops) → weaker, text-mined signal, labeled as such.
- **Offers**: 15,083 price = 0 (→ "price not registered"); absurd outliers up to 7e17 (211 offers > 10B Toman) → flag as suspicious, exclude from stats. `last_price_changed_at`: mostly 2026-09/10, tail back to 2020; 769 null. 9,557 (shop, product) pairs have multiple offers (variants) → group per shop, show min–max.
- 3,792 shops have offers; **887 shops have activity categories but no offers** (category-only candidates); 1,797 have neither.
- **Products**: 3,428 leaf categories; brand null for 74% (infer from title, labeled "inferred"); specs missing for 36%; 849 titles are «عنوان حذف‌شده برای انتشار» (fallback to a seller title, else generated "category + brand" with a note). Images hosted on `image.torob.com` (public, CORS `*`, cacheable).
- Arabic ي/ك in titles, mixed Persian/Latin digits, ZWNJ → shared normalizer for index **and** query.
- 187k products have exactly 1 offer; ~39k have ≥2 sellers (where store comparison shines).

---

## 3. Features (P0 = must ship, P1 = should, P2 = nice)

### 3.1 Shell & context (P0)
- PWA, RTL, Vazirmatn font, Persian digits everywhere, Jalali dates (`Intl` `fa-IR-u-ca-persian`), Tehran time (`Asia/Tehran`).
- Bottom tab bar: **دستیار** (assistant/home) · **جستجو** · **پیگیری‌ها** (inquiries, live badge) · **برنامه بازدید** (visit plan).
- **Context bar** (sticky, on assistant/search/product pages): chips `محدوده` · `بودجه` · `شرایط خرید` (قسطی/ترب‌پی/باز الان/گارانتی/ارسال فوری/کالابرگ) · `زمان مراجعه` · travel mode — each with a lucide icon (MapPin, Wallet, SlidersHorizontal, Clock, route mode icon); never emoji icons (design system: `design-system/torob-in-the-loop/MASTER.md`). Tapping opens a bottom sheet; changes **re-run results instantly** (search, stores, plan) and are visible to the agent.
- Location: GPS ("موقعیت فعلی من"), pick an area/landmark from a searchable list (dataset areas + Tehran landmarks + metro stations), or tap on map. Without location the app still works; distance UI shows a CTA to set it.
- Desktop: centered mobile shell + side panel (what this is, QR/"open on your phone").

### 3.2 Step 1 — Decide what to buy (P0)
- **Search** with Persian normalization, synonyms (کتونی→کتانی/اسنیکرز/کفش اسپرت, گوشی→موبایل…), prefix matching, typo-tolerant fallback, category detection.
- **NLU chips**: free text like «گوشی سامسونگ زیر ۲۰ میلیون نزدیک ونک قسطی» is parsed into removable chips (category, brand, budget, area, installment, open-now).
- Filters (bottom sheet): category, brand, price range, sellers ≥ N, "available near me (≤ X km)", installment/provider, open now, warranty, fast delivery. Sort: relevance · cheapest · most sellers · nearest.
- **Guided discovery «کمکم کن انتخاب کنم»**: 2–4 data-driven questions with chips (price tier from quantiles, top brands incl. inferred, audience مردانه/زنانه/بچگانه, high-coverage spec facets e.g. حافظه داخلی / سایز / جنس رویه, "only with sellers near me", "only with installment"). Each option shows a count. LLM (if on) may add a use-case question («برای دویدن یا استفاده روزمره؟») mapped to keywords.
- **Product card**: image, title, brand (+"تشخیص خودکار" when inferred), price range across sellers, #in-person sellers, nearest seller distance, freshness of prices, badges (قسطی در N فروشگاه). Every recommendation shows **why** chips («ارزان‌ترین در میان ۸ فروشنده», «۳ فروشنده نزدیک شما», «مطابق بودجه»). Actions: مشاهده فروشنده‌ها · افزودن به مقایسه.
- **Product comparison** (2–4): spec table with differences highlighted, price ranges, seller counts, nearest seller, installment availability, warranty types, + summary («کدام برای من بهتر است؟» — LLM if on; deterministic summary otherwise).

### 3.3 Step 2 — Find stores & areas (P0)
- Product page: gallery, specs, **price panel** (min / median / max of registered prices, spread, freshness histogram, "N sellers updated in the last 3 days").
- **Ranked stores** (smart score) with **reason chips** and next-step buttons (استعلام · مسیر · افزودن به برنامه). Sort toggles: هوشمند · ارزان‌ترین · نزدیک‌ترین · تازه‌ترین قیمت.
- **Areas summary** («محله‌های پیشنهادی»): stores carrying the product grouped by area with count, price range, distance/ETA from user, walkability (e.g. «۸ فروشنده در شعاع ۵۰۰ متری جمهوری — مقایسه حضوری آسان»).
- **Category-only candidates** («ممکن است داشته باشند»): shops whose declared activity category matches but have **no offer** for this product — visually separated, labeled «موجودی نامشخص — فقط دسته فعالیت»; primary action = «بپرس».
- Map view (Leaflet) of stores with price pins; tap → store sheet.

### 3.4 Step 3 — Compare stores (P0)
- Select 2–4 stores → comparison table: registered price (+date & freshness), confirmed price/stock (if inquired), distance & ETA by mode, open at visit time / closes at, weekly hours, warranty, payment providers (with info type), fast delivery, Kalabarg, in-mall location, data completeness. Best value per row highlighted; unknowns rendered as «نامشخص» with tooltip «فروشنده ثبت نکرده».

### 3.5 Step 4 — Contact & follow-up (P0)
- **«استعلام از فروشگاه»**: question picker — موجودی · قیمت به‌روز · ساعت کاری امروز · نگه‌داشتن کالا تا ساعت … · خرید قسطی/ترب‌پی · کالابرگ · نشانی دقیق داخل پاساژ · گارانتی · سؤال دلخواه.
- **Batch**: «از ۳ فروشگاه برتر بپرس» → parallel AI calls.
- **AI call agent** (simulated in this demo because dataset phones are fake; clearly badged «تماس شبیه‌سازی‌شده — نسخه نمایشی»): call screen with ringing → live transcript (streamed) → **structured verified result**: stock, updated price (vs registered, % change), hours today, hold-until, installment, Kalabarg, in-passage directions. Facts are decided by a deterministic, data-aware engine (closed shops don't answer; stale prices change more often) and only **verbalized** by the LLM → no hallucinated facts.
- **Seller inbox** (`/seller`): two-sided demo — a store opens its inbox, sees the question, answers with one tap (موجود است / تمام شده / قیمت جدید / نگه می‌داریم تا …). Buyer sees it live. Seller answers outrank simulated ones and are labeled «پاسخ مستقیم فروشنده».
- **Follow-up engine (پیگیری)**: per inquiry state machine — queued → calling → answered | no_answer | busy | closed → retry scheduled → (escalate to message) → resolved | unreachable. Automatic retries; on unreachable / out of stock → **alternatives auto-proposed** with a notification. Inquiries tab shows timelines, transcripts and results; live badge count.
- Verified info flows back everywhere: store rows show «قیمت تأییدشده ۱۲٫۸ میلیون — ۱۰ دقیقه پیش (تماس)» **next to** the registered price; stock shows «موجود — تأیید شده» vs default «موجودی تأیید نشده».

### 3.6 Alternatives engine (P0)
Triggered by: no answer, closed, out of stock, can't find shop, too expensive, user arrived & store closed. Returns, in order: (1) **same product** in stores **open now** nearby (same passage / walking distance first), (2) category-only shops in the same passage (ask them), (3) **similar products** (same category/brand, close price) available nearby. One tap to inquire or add to plan.

### 3.7 Visit plan (P0)
- Add stores (from cards/compare/inquiry results) → plan with optimal **stop order** (nearest-neighbor + 2-opt; same-mall stops grouped; floors ascending).
- Timeline: leave-by time, arrival per stop (ETA by mode), **open at arrival?**, closes at, «فقط ۲۰ دقیقه تا بسته شدن», Thursday early close / Friday closed warnings, "come tomorrow 10:00" suggestion.
- Per stop: in-passage guide (passage · floor · unit · wing · landmark), confirmed results, quick actions on site: **«بسته بود» · «پیدایش نکردم» · «موجود نداشت» · «گران‌تر بود»** → instant alternatives & crowd report.
- Trip advice: downtown traffic-restricted zone notice (approximate polygon) + nearest metro stations (OSM data) with walking distance; navigation deep links (نشان · بلد · Google Maps); share plan; **works offline** (service worker caches plan + guides — malls have poor signal).

### 3.8 In-passage wayfinding (P0)
- Address parser → `{mall name/kind, floor (num + label), unit, plaque, wing, landmark}` with confidence.
- **Mall page** (`/mall/:slug`): all dataset shops in that passage grouped by floor, categories present, entrance metro, «فروشگاه‌های همین طبقه». In-mall guide card: «پاساژ علاءالدین ۲ ← طبقه ۶ ← واحد ۶۲۲ · طبقات بالا با آسانسور/پله‌برقی · واحدهای این طبقه با ۶ شروع می‌شوند» (heuristic phrasing labeled as such), plus "ask store for exact directions" action.

### 3.9 Assistant (chat) (P0)
- Conversational entry on home; quick-start prompts; voice input (P1).
- Agent streams **status lines** («در حال جستجو در ۲۲۵ هزار کالا…», «مقایسه ۸ فروشنده…», «تماس با فروشگاه…»), short Persian text, and **rich blocks** (products, discovery questions, stores, comparisons, inquiries, plan, alternatives, areas, quick replies). Blocks are fully interactive (same components as pages).
- Agent can patch the user context (e.g. sets "installment only") → context bar updates visibly.
- **Graceful degradation**: with no LLM configured or on LLM failure, a deterministic Persian NLU agent handles the same flows (search, discovery, stores, compare, inquire, plan, alternatives). Badge in header shows mode subtly.

### 3.10 Transparency & data quality (P0)
Uniform components for: registered price + Jalali date + relative age + freshness color (≤3d fresh, ≤14d ok, ≤60d stale, older very stale); «قیمت ثبت نشده»; «قیمت غیرعادی — احتمالاً خطای ثبت»; stock default «تأیید نشده»; hours «اعلام فروشنده» vs «ثبت نشده»; payments «پذیرنده حضوری (اعلام فروشنده)» vs «نحوه پذیرش نامشخص»; text-mined hints «در توضیحات فروشنده آمده»; inferred brand; redacted title note; anonymized shop names note; Kalabarg «ثبت نشده». **Every unknown has an «بپرس» action.**
About page (`/about`): dataset stats, coverage map/areas (10% of Tehran shops, selected areas), freshness distribution, legend of labels, how ranking works, what is simulated.

### 3.11 P1 / P2
- P1: voice input (server STT via LLM gateway, fallback Web Speech), crowd reports on shop page, in-store checklist per category group (e.g. phones: رجیستری IMEI, کارت گارانتی, پلمب), price-position/negotiation tip, share links, dark mode.
- P2: Bale bot channel for sellers (Telegram-compatible API, enabled by `BALE_BOT_TOKEN`), Neshan routing/ETA if `NESHAN_API_KEY`, TTS for call audio.

---

## 4. Key user journeys (must be demo-perfect)

1. **"کتونی می‌خوام، نمی‌دونم چه مدلی"** → discovery questions (budget tier, brand, men/women) → 6 recommended sneakers with reasons → compare 2 → pick → stores ranked near «میدان فردوسی» → compare 3 stores → «از هر ۳ بپرس» → live calls: one no-answer (auto-retry scheduled), one price +6%, one in stock & will hold till 18:00 → add to plan → plan shows walking route between passages, floors & units.
2. **"گوشی سامسونگ قسطی زیر ۲۵ میلیون"** → installment filter auto-applied (chip visible) → only stores with BNPL providers, info type shown → no exact match nearby? → alternatives: same model at installment stores farther away / similar models nearby with installment / ask unknown stores.
3. **Arrived & closed**: in plan, tap «بسته بود» → 3 open stores within 300 m in the same/adjacent passage carrying it → one tap to call/add.
4. **Can't find the shop in the passage**: shop page → in-passage guide + same-floor neighbors + «از فروشگاه آدرس دقیق بپرس».
5. **Seller side**: open `/seller`, pick the shop that was asked, answer «موجود است، ۱۲٫۹ میلیون» → buyer's inquiry flips to «پاسخ مستقیم فروشنده» live.

## 5. Non-functional
- p95 API < 300 ms for search/product/stores on a 1-vCPU instance; first load < 250 KB JS gzip for the shell.
- Works without LLM; LLM timeouts ≤ 25 s with fallback.
- Accessible: tap targets ≥ 44px, color contrast AA, `aria` on controls, `prefers-reduced-motion`.
- No secrets in client; rate limiting on chat/inquiry endpoints; input validation (zod).
