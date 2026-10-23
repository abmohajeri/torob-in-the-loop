# Torob in the Loop — Assistant & Follow-up Behavior Spec

Companion to `ARCHITECTURE.md` §8–§9. Defines *how the intelligence behaves*: the LLM agent, the deterministic Persian fallback, and the AI-call / follow-up engine. Persian strings here are the reference copy.

---

## A. LLM agent (apps/server/src/agent)

### A.1 System prompt (reference; keep it compact, English instructions, Persian output)

```
You are «Torob in the Loop» (Torob in the Loop), a smart IN-PERSON shopping assistant for Tehran.
You guide the user through: (1) choosing the right product/model, (2) finding stores that carry it near them
and suggesting nearby areas, (3) comparing stores (price, distance, opening hours), (4) contacting stores to
verify stock/price/hours and following up — then planning the visit.

Now in Tehran: {weekdayFa} {jalaliDate}، ساعت {HH:MM}.
User context: محدوده={location label|نامشخص}; بودجه={…|نامشخص}; شرایط={قسطی، ترب‌پی، باز در زمان مراجعه…|—};
زمان مراجعه={الان|…}; رفت‌وآمد={…}.
Working memory: focused product={id/title|—}; last results={ids}; last stores={ids}; open inquiries={n}.

RULES
1. Facts (products, prices, shops, hours, stock, distances, payment options) come ONLY from tool results.
   Never invent or estimate them.
2. Registered price ≠ verified price ≠ stock. When quoting a price say it is the registered price and how old
   it is («قیمت ثبت‌شده، ۲ هفته پیش»). Stock is unknown until a store confirms it.
3. Unknown info → say «ثبت نشده» and offer to ask the store (contact_stores).
4. Vague need (category without model, "نمی‌دونم کدوم") → call discovery_questions; ask at most 2 short
   questions; the UI shows the options as chips.
5. Be brief: ≤ 3 short sentences. The UI renders cards for every tool result — do NOT re-list products,
   stores or prices in text. Say what you did, the key insight, and the next step.
6. Always finish with suggest_replies (2–4 next steps the user can tap).
7. New constraints from the user (budget, installment/provider, area, open now, warranty, visit time, travel
   mode) → call update_preferences FIRST, then re-run the relevant tool.
8. Visit conditions: compare store hours with visit time + travel time; warn on closing soon, lunch break
   between shifts, Thursday short hours, Friday closures; downtown is in the traffic zone → suggest metro/taxi.
9. Store didn't answer / closed / out of stock / user couldn't find it / too expensive → call
   find_alternatives immediately and present the best option.
10. Before sending the user to a store whose registered price is older than 14 days, recommend verifying
    with contact_stores (offer it as a quick reply).
11. Calls are SIMULATED in this demo (dataset phones are fake); never claim a real phone call happened.
12. Write Persian, friendly and polite («شما»), with Persian digits.
```

### A.2 Tools (OpenAI function calling; implementations call `Services`/`ContactModule`)
Each returns `{ llm, block?, patch? }`: `llm` is a compact JSON summary (ids, titles ≤ 40 chars, prices, km,
open state, freshness, verified) capped ≈ 1.5k chars; `block` is the full `UIBlock` for the client.

| Tool | Params | Block | Notes |
|---|---|---|---|
| `search_products` | query, category?, brand?, budget_min?, budget_max?, audience?, near_only?, sort? | `products` (≤ 8) | context applied automatically |
| `discovery_questions` | query?, category? | `discovery` | then stop and wait for the user |
| `get_product` | product_id | `product` | |
| `compare_products` | product_ids (2–4) | `compare_products` | |
| `find_stores` | product_id, sort? | `stores` | includes areas + category-only |
| `compare_stores` | product_id, shop_ids (2–4) | `compare_stores` | |
| `nearby_areas` | product_id? | `areas` | |
| `shop_info` | shop_id | `shop` | |
| `mall_info` | mall (slug, id or name) | `mall` | |
| `contact_stores` | shop_ids (1–5), product_id?, questions[], custom_question? | `inquiries` | live updates via SSE |
| `inquiry_status` | – | `inquiries` | for "what did they say?" |
| `find_alternatives` | reason, product_id?, shop_id? | `alternatives` | |
| `plan_visit` | shop_ids[], product_id?, depart_at?, mode? | `plan` | |
| `update_preferences` | location_label?, budget_min?, budget_max?, installment?, providers?, open_now?, warranty_only?, max_distance_km?, travel_mode?, visit_at? | – (emits `context`) | location_label resolved via places |
| `suggest_replies` | options [{label, message}] (≤ 4) | `quick_replies` | |

Status lines (emitted before each tool): «در حال جستجو میان ۲۲۵ هزار کالا…», «در حال آماده کردن چند سؤال کوتاه…»,
«مقایسه مشخصات…», «پیدا کردن فروشنده‌های حضوری نزدیک شما…», «مقایسه فروشگاه‌ها…», «تماس با ۳ فروشگاه…»,
«یافتن جایگزین…», «برنامه‌ریزی مسیر بازدید…», «به‌روزرسانی ترجیحات شما…».

### A.3 Memory
`agent_memory.data` JSON: `{ focusProductId, lastProductIds[], lastShopIds[], lastInquiryIds[], lastQuery,
lastCategory, lastPlanShopIds[] }`. LLM history: last 8 turns as user/assistant text + a one-line tool digest
(«[ابزار find_stores: ۱۲ فروشنده؛ ارزان‌ترین … ]»), not raw JSON.

---

## B. Deterministic Persian assistant (rules mode)

Runs when no LLM is configured or the LLM call fails/times out (per turn). Must feel intentional, not broken.

Intent detection (normalized text, first match wins; uses `services.parseQuery` for entities):
| Intent | Triggers (examples) | Action |
|---|---|---|
| greet/help | سلام، چطوری، کمک، چی کار می‌کنی | intro + 4-step explanation + example quick replies |
| alternatives | بسته بود، تعطیل، جواب نداد، نداشت، تموم شده، پیدا نکردم، پیداش نکردم، گرون بود | `find_alternatives` (reason mapped) on memory focus product/shop |
| contact | بپرس، استعلام، زنگ بزن، تماس بگیر، موجودی، هنوز دارن | `contact_stores` top 3 stores of focus product (or named) with stock+price+hours |
| status | چی شد، جواب دادن، نتیجه | `inquiry_status` |
| plan | برنامه، مسیر، کجا اول برم، بریم | `plan_visit` with verified-in-stock shops else top 3 |
| compare stores | مقایسه فروشگاه(ها)، کدوم مغازه | `compare_stores` top 3 |
| compare products | مقایسه، فرقشون، کدوم بهتره | `compare_products` first 2–3 of last products |
| stores | کجا بخرم، کجا داره، فروشنده، مغازه، نزدیک‌ترین | `find_stores` focus product (or first result of a fresh search) |
| hours | ساعت کاری، تا کی بازه، الان بازه | `shop_info` for focus shop / top store |
| mall | پاساژ X، مجتمع X، طبقه چند | `mall_info` / `shop_info` |
| preferences only | «فقط قسطی»، «بودجه‌م ۱۰ میلیونه»، «من ونکم» (no product terms) | `update_preferences` + re-run last search |
| help-me-choose | نمی‌دونم، کدوم مدل، پیشنهاد بده، چی بخرم + category | `discovery_questions` + 6 popular products |
| search (default) | anything with product terms | `search_products` (+ discovery if category-only & > 30 results) |

Every rules reply = 1–2 sentences of templated Persian + blocks + 2–4 quick replies tailored to state, e.g.:
- after products: «مقایسه دو گزینه اول»، «فروشنده‌های {اولی}»، «فقط قسطی‌ها»، «ارزان‌ترها»
- after stores: «از ۳ فروشگاه اول بپرس»، «مقایسه فروشگاه‌ها»، «برنامه بازدید»، «فقط بازها»
- after inquiries: «نتیجه تماس‌ها؟»، «برنامه بازدید با فروشگاه‌های تأییدشده»
- after plan: «اگر بسته بود چه کنم؟»، «مسیر را در نقشه باز کن»

---

## C. AI-call & follow-up engine (apps/server/src/contact)

### C.1 Outcome rules (deterministic PRNG seeded by `inquiryId:attempt`)
1. **Closed at call time** (shop hours say closed/unknown-late-night) → status `closed`, no pickup;
   schedule next attempt at the next opening time (+5 min). Inquiry shows
   «فروشگاه الان بسته است؛ تماس خودکار در اولین ساعت کاری ({روز} {ساعت}) انجام می‌شود» and a demo button
   «همین حالا تماس بگیر (نسخه نمایشی)» that forces an immediate attempt treated as during working hours.
2. Otherwise: answered 72% (85% on retries), no_answer 18%, busy 10%; recent crowd report «بسته بود» → +20% no_answer.
3. **Demo choreography for batches (DEMO_MODE, batch of ≥ 3)**: to make the follow-up visible, the
   3rd shop of a batch has `no_answer` on attempt 1 (then normal odds); at least one shop answers on attempt 1.
4. Answered facts: stock in_stock 72% / limited 13% / out_of_stock 15%; price: fresh registered price → unchanged
   80%; otherwise changed: +2…+12% (90%) or −1…−5% (10%), rounded to 10,000 Toman (missing registered price →
   store quotes a plausible price within the product's registered min–max, flagged «قیمت تلفنی»);
   hours today from data (unknown → store states a time; result flagged «اعلام تلفنی»); hold (requested & in stock) →
   until min(closing − 30 min, now + 3 h); installment: declared providers → yes with those; else 25% «فقط چک»,
   75% no; Kalabarg: 10% yes; location: from parsed address (+ «از پله‌برقی که بالا بیایید سمت راست» style hint);
   warranty: from the offer.
5. Retry policy: no_answer/busy → `retry_scheduled` after `FOLLOWUP_RETRY_SECONDS` × 1.5^(attempt−1);
   after `max_attempts` → `unreachable` → alternatives + notification «… پاسخ نداد؛ ۳ جایگزین پیدا کردیم».
   out_of_stock → resolved + alternatives + notification. Seller-inbox reply at any time wins.

### C.2 Transcript templates (vary with seeded choice; LLM fast model may rephrase but must keep facts)
- System: «در حال شماره‌گیری {shop}…», «بوق آزاد…», «پاسخی دریافت نشد.», «خط اشغال است.»,
  «فروشگاه طبق ساعت کاری ثبت‌شده الان بسته است.»
- Store pickup: «سلام، بفرمایید.» · «بله، در خدمتم.» · «الو، بفرمایید؟»
- Agent intro: «سلام، وقت‌تون بخیر. از دستیار خرید «Torob in the Loop» تماس می‌گیرم؛ یکی از مشتری‌ها دنبال {product} است. چند سؤال کوتاه داشتم.»
- stock Q «{product} را الان موجود دارید؟» → in «بله، موجود داریم.» / «بله، چند تا داریم.» · limited «آخرین دانه‌اش مانده؛ اگر می‌آیید زودتر بیایید.» · out «نه متأسفانه، فعلاً تمام کرده‌ایم.» / «فعلاً نداریم؛ شاید هفته بعد بیاید.»
- price Q «قیمت امروزش چند است؟» → same «همان {price} تومان است.» · up «قیمتش کمی بالا رفته؛ الان {price} تومان است.» · down «الان {price} تومان حساب می‌کنیم.»
- hours Q «امروز تا چه ساعتی باز هستید؟» → «تا ساعت {close} هستیم.» / Thursday «امروز پنجشنبه است؛ تا {close} بیشتر نیستیم.» / two shifts «ظهر از {s1end} تا {s2start} می‌بندیم، بعدش تا {close} هستیم.»
- hold Q «امکانش هست تا رسیدن مشتری نگهش دارید؟» → «بله، تا ساعت {hold} به اسم Torob in the Loop نگه می‌دارم.» / «نگه نمی‌داریم، ولی فعلاً موجود است.»
- installment Q «امکان خرید قسطی یا با ترب‌پی دارید؟» → «بله، با {providers} می‌شود قسطی خرید.» / «فقط چک قبول می‌کنیم.» / «نه، فقط نقد و کارت.»
- kalabarg Q «کالابرگ قبول می‌کنید؟» → «نه، کالابرگ برای ما فعال نیست.» / «بله، کالابرگ هم قبول می‌کنیم.»
- location Q «دقیقاً کجای پاساژ هستید؟» → «{mall}، طبقه {floor}، واحد {unit}؛ {hint}.»
- warranty Q «گارانتی‌اش چیست؟» → «{warranty}.»
- Close: agent «خیلی ممنون، روز خوبی داشته باشید.» → store «خواهش می‌کنم، منتظرتان هستیم.»
- Result summary (one line): «موجود · ۱۲٫۹ میلیون (۳٪ بیشتر از قیمت ثبت‌شده) · تا ۲۰:۰۰ باز · تا ۱۸:۳۰ نگه می‌دارند».

### C.3 Timing
Line delays 900–1600 ms ÷ `CALL_SPEED`; ringing 2–4 s; a whole answered call ≈ 12–20 s at speed 1.
Batch calls run concurrently (staggered 0.8 s) so three call cards animate together in the UI.

### C.4 Notifications (LiveEvent `notification`)
- resolved: «{shop}: {summary}» (tone good / warn if out of stock or price up > 5%)
- retry: «{shop} پاسخ نداد؛ {n} دقیقه دیگر دوباره تماس می‌گیریم.»
- unreachable: «{shop} در دسترس نبود؛ {k} جایگزین پیدا شد.» (link to inquiry)
- seller reply: «پاسخ مستقیم فروشنده {shop}: {summary}»
