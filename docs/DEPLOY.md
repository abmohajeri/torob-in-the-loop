# استقرار Torob in the Loop | Deploying Torob in the Loop

> نسخهٔ فارسی اول، سپس انگلیسی. | Persian first, English below.

## فارسی

### معماری استقرار در یک نگاه

- یک کانتینر Node 22 (`node:22-bookworm-slim`) روی پلتفرم **Docker** لیارا.
- سرور یک فایل باندل‌شده با esbuild است (`apps/server/dist/index.js`) و در زمان اجرا به `node_modules` نیازی ندارد. SQLite از ماژول داخلی `node:sqlite` می‌آید (بدون وابستگی بومی).
- کاتالوگ فقط‌خواندنی `data/catalog.db` (حدود ۳۵۰ مگابایت) **روی سیستم شما** با `npm run data:build` ساخته می‌شود؛ چون دیتاست خام ترب آپلود نمی‌شود، روی لیارا قابل ساخت نیست.
- دادهٔ قابل‌تغییر (استعلام‌ها، گفتگوها، گزارش‌ها) در `/var/lib/torob-in-the-loop/state.db` روی یک **دیسک لیارا** ذخیره می‌شود. فایل‌سیستم برنامه‌های لیارا جز دیسک‌های متصل، فقط‌خواندنی است.
- پیش‌فرض `liara.json` فایل `Dockerfile.runtime` است: فقط خروجی‌های آماده را کپی می‌کند، در چند ثانیه build می‌شود و هنگام build به npm یا اینترنت نیاز ندارد (محدودیت زمان build لیارا: ۵ دقیقه در پلن رایگان، ۱۰ دقیقه در پلن استاندارد). فایل `Dockerfile` نسخهٔ کامل و تکرارپذیر از سورس است.

### پیش‌نیازها

- Node.js نسخهٔ ۲۲.۱۳ یا بالاتر، و CLI لیارا: `npm i -g @liara/cli` (نسخهٔ آزموده‌شده: 9.4.7)
- دیتاست خام در `../dataset/` (برای ساخت کاتالوگ)

### گام‌به‌گام استقرار روی لیارا

1. **ورود:** `liara login` (یا در CI توکن API را با `--api-token` بدهید).
2. **ساخت برنامه با پلتفرم Docker:**
   ```bash
   liara app create --app torob-in-the-loop --platform docker --plan <plan>
   ```
   اگر نام `torob-in-the-loop` گرفته شده، نام دیگری بگذارید و مقدار `app` در `liara.json` را هم تغییر دهید (یا همیشه `--app` بدهید).
   پلن پیشنهادی: حداقل ۵۱۲ مگابایت RAM (کاتالوگ با mmap خوانده می‌شود).
3. **ساخت دیسک وضعیت** (اندازه به گیگابایت؛ ۱ گیگ کافی است):
   ```bash
   liara disk create --app torob-in-the-loop --name torob-in-the-loop-data --size 1
   ```
   نام دیسک باید با `disks[].name` در `liara.json` یکی باشد؛ محل اتصال `/var/lib/torob-in-the-loop` است.
4. **تنظیم متغیرهای محیطی** (فهرست کامل در `.env.example`):
   ```bash
   liara env set --app torob-in-the-loop \
     LLM_BASE_URL=https://ai.liara.ir/api/v1/<id> \
     LLM_API_KEY=<key> \
     PUBLIC_BASE_URL=https://torob-in-the-loop.liara.run
   ```
   `liara env set` برنامه را دوباره راه‌اندازی می‌کند. بدون کلید LLM، دستیار در حالت قاعده‌محور کار می‌کند.
5. **ساخت کاتالوگ** (یک بار، یا هر وقت ETL تغییر کرد): `npm run data:build`
6. **استقرار:**
   ```bash
   scripts/deploy-liara.sh --app torob-in-the-loop          # build + بررسی حجم + liara deploy
   scripts/deploy-liara.sh --app torob-in-the-loop --detach # بدون انتظار برای پایان build
   scripts/deploy-liara.sh --full                    # build کامل از سورس روی لیارا (کندتر)
   ```
7. **بررسی:** `scripts/smoke.sh https://torob-in-the-loop.liara.run`
   این اسکریپت سلامت، متا، جستجوی «کتونی»، صفحهٔ محصول و فروشگاه‌ها، مکان‌ها، ثبت و خواندن استعلام و چند فریم اول SSE گفتگو را آزمایش می‌کند.
8. **لاگ‌ها:** `liara app logs --app torob-in-the-loop -f --since="10 minutes ago"`
   (لاگ‌ها JSON یک‌خطی هستند.)
9. **بازگشت به نسخهٔ قبل:** از پنل لیارا ← برنامه ← «استقرارها» نسخهٔ قبلی را دوباره منتشر کنید؛ یا کد قبلی را checkout کرده و دوباره `scripts/deploy-liara.sh` اجرا کنید. پایگاه وضعیت روی دیسک است و از بین نمی‌رود.

### حجم آپلود

`liara deploy` کل پوشه را (با رعایت `.liaraignore`، که بر `.dockerignore` و `.gitignore` اولویت دارد) فشرده و آپلود می‌کند.
سقف: **۱۲۸ مگابایت فشرده در پلن رایگان/برنزی**، ۲۵۶ مگابایت در پلن‌های بالاتر (سقف CLI ‏256MiB).
اندازهٔ واقعی را با `scripts/check-size.sh` ببینید. اندازه‌گیری فعلی: حدود **۱۱۵ مگابایت فشرده** (کاتالوگ ۳۵۶ مگابایت خام)، یعنی حدود ۷ مگابایت جای خالی تا سقف پلن رایگان. اگر کاتالوگ بزرگ‌تر شد: پلن بالاتر، یا `VACUUM` روی کاتالوگ، یا حذف ستون‌های اضافه در ETL.

### مقیاس‌پذیری و محدودیت‌ها

- کاتالوگ فقط‌خواندنی است، اما state روی یک دیسک SQLite است؛ بنابراین **یک نمونه (replica)** اجرا کنید. برای چند نمونه باید state به پایگاه‌دادهٔ مدیریت‌شده منتقل شود.
- SSE (گفتگو و رویدادهای زنده) هر ۱۵ ثانیه ping می‌فرستد تا پراکسی اتصال را نبندد.
- تماس‌ها در حالت دمو شبیه‌سازی می‌شوند؛ شماره‌ها و بیشتر نام‌های فروشگاه‌ها در دیتاست ساختگی‌اند.

### اجرای محلی با Docker

```bash
npm run data:build && npm run build
cp .env.example .env        # اختیاری
docker compose up --build   # http://localhost:3000
scripts/smoke.sh http://localhost:3000
```
بدون compose:
```bash
docker build -f Dockerfile.runtime -t torob-in-the-loop .
docker run --rm -p 3000:3000 -v torob-in-the-loop-state:/var/lib/torob-in-the-loop --read-only --tmpfs /tmp torob-in-the-loop
```
build کامل از سورس (با mirror اختیاری npm):
```bash
docker build --build-arg NPM_REGISTRY=https://package-mirror.liara.ir/repository/npm/ -t torob-in-the-loop .
```

### عیب‌یابی

| نشانه | علت و راه‌حل |
|---|---|
| `EROFS` یا خطای نوشتن | فایل‌سیستم فقط‌خواندنی است؛ فقط `/var/lib/torob-in-the-loop` (دیسک) و `/tmp` قابل نوشتن‌اند. `STATE_DB_PATH` را تغییر ندهید. |
| لاگ `state dir not writable; using ephemeral temp storage` و در `/api/health` مقدار `persistent=false` | دیسک متصل نیست. دیسک را بسازید (گام ۳)، نام آن را با `liara.json` مطابقت دهید و دوباره deploy کنید. تا آن زمان استعلام‌ها با هر راه‌اندازی مجدد پاک می‌شوند. |
| `catalog database not found` و خروج کانتینر | `data/catalog.db` در آپلود نبوده. `npm run data:build` و بعد `scripts/check-size.sh` را اجرا کنید. |
| `/api/health` با کد ۵۰۳ (`degraded`) | کاتالوگ یا state مشکل دارد؛ لاگ‌ها را ببینید. |
| دستیار پاسخ قالبی می‌دهد / `llm.enabled=false` | `LLM_BASE_URL` یا `LLM_API_KEY` تنظیم نشده یا سرویس در دسترس نیست. برنامه خودکار به حالت قاعده‌محور می‌رود؛ کلیدها را با `liara env set` بررسی کنید. |
| خطای حجم آپلود | `scripts/check-size.sh` را اجرا کنید؛ فایل‌های بزرگ ناخواسته را به `.liaraignore` اضافه کنید یا پلن را ارتقا دهید. |
| build بیش از ۵ دقیقه | از `Dockerfile.runtime` (پیش‌فرض) استفاده کنید، نه `--full`. |
| health check ناموفق در شروع | راه‌اندازی حدود ۱۰ ثانیه است؛ `startPeriod` را در `liara.json` افزایش دهید. |

---

## English

### Overview

One Node 22 container on Liara's **Docker** platform. The server is a single esbuild bundle (no runtime `node_modules`; SQLite via built-in `node:sqlite`). The read-only catalog `data/catalog.db` (~350 MB) is **built locally** with `npm run data:build` (the raw Torob dataset is never uploaded, so it can't be built on Liara). Mutable state lives at `/var/lib/torob-in-the-loop/state.db` on a **Liara disk**; everything else in a Liara app is read-only.
`liara.json` uses `Dockerfile.runtime` (copies prebuilt `apps/server/dist`, `apps/web/dist`, `data/catalog.db`; builds in seconds, no network; Liara build limit is 5 min free / 10 min standard). `Dockerfile` is the full multi-stage build from source (`npm ci`, optional `NPM_REGISTRY` mirror).

### Deploy step by step

```bash
npm i -g @liara/cli                                   # tested with 9.4.7
liara login
liara app create --app torob-in-the-loop --platform docker --plan <plan>   # ≥ 512 MB RAM recommended
liara disk create --app torob-in-the-loop --name torob-in-the-loop-data --size 1  # size in GB; name must match liara.json
liara env set --app torob-in-the-loop LLM_BASE_URL=https://ai.liara.ir/api/v1/<id> LLM_API_KEY=<key>
npm run data:build                                    # once, needs ../dataset
scripts/deploy-liara.sh --app torob-in-the-loop [--detach] [--api-token $LIARA_API_TOKEN] [--full]
scripts/smoke.sh https://torob-in-the-loop.liara.run
liara app logs --app torob-in-the-loop -f
```

- **Rollback:** redeploy a previous release from the Liara console (app → deployments), or check out the previous commit and run the deploy script again. State survives on the disk.
- **Scaling:** run a single replica (state is SQLite on one disk). Moving state to a managed DB is required for horizontal scaling. SSE streams send a ping every 15 s.
- **Upload size:** Liara uploads the directory as tar.gz, honoring `.liaraignore` (which takes precedence over `.dockerignore` and `.gitignore`). Limit: 128 MB compressed on free/bronze, 256 MB above (CLI hard limit 256 MiB). Currently ~115 MB compressed (measured with `scripts/check-size.sh`).
- **Health check:** `liara.json` runs `node /app/scripts/healthcheck.mjs` (GET `/api/health`, 200 = healthy, 503 = degraded). The image also has a Docker `HEALTHCHECK`.
- **CI:** `.github/workflows/ci.yml` typechecks, tests and builds on every push/PR. On `main` the `deploy` job runs only when the `LIARA_API_TOKEN` and `CATALOG_URL` secrets exist: it downloads a prebuilt catalog (optionally `.gz`) from `CATALOG_URL`, deploys and runs the smoke test. Optional repo variable `LIARA_APP`.

### Local Docker

`npm run data:build && npm run build && docker compose up --build` → http://localhost:3000. Compose mirrors Liara: read-only root FS, a named volume for state, `.env` loaded if present. Use `BAZAARGARD_DOCKERFILE=Dockerfile` for the full source build.

### Troubleshooting

- **Read-only FS (`EROFS`)**: only `/var/lib/torob-in-the-loop` and `/tmp` are writable.
- **Disk not mounted**: the server logs `state dir not writable; using ephemeral temp storage` and `/api/health` reports `state.persistent=false`. Create the disk and redeploy.
- **Catalog missing**: the entrypoint exits with `catalog database not found`; run `npm run data:build`.
- **LLM unreachable / not configured**: the assistant falls back to rule-based mode automatically (`llm.enabled=false` in health, `mode: "rules"` in chat).
- **Upload too large**: run `scripts/check-size.sh`, extend `.liaraignore`, or upgrade the plan.

### Liara facts verified

- `liara.json` schema & flags: Liara CLI 9.4.7 source (`lib/types/liara-json.d.ts`, `lib/commands/deploy.js`, `lib/commands/disk/create.js` — disk size in GB, `lib/commands/app/create.js` — `--platform`, `--plan`, `--read-only`).
- Ignore precedence and size limit: `lib/utils/create-archive.js` (`.liaraignore` > `.dockerignore` > `.gitignore`, 256 MiB).
- Health-check fields: https://docs.liara.ir/paas/details/health-check/ — the page's example uses `interval: 30, timeout: 15, retries: 2, startPeriod: 5` (values that only make sense as seconds, although the prose says milliseconds). Our values follow the example's scale.
