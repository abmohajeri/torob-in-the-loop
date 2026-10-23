-- Mutable application state (sessions, chat, inquiries, reports, plans, jobs).
-- Lives on a persistent disk in production (Liara disk mounted at /var/lib/torob-in-the-loop).
-- Idempotent: executed on every boot.

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  context      TEXT                      -- JSON UserContext (last known)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  role         TEXT NOT NULL,            -- 'user' | 'assistant'
  text         TEXT NOT NULL,
  blocks       TEXT NOT NULL DEFAULT '[]',  -- JSON UIBlock[] (assistant)
  llm_messages TEXT,                     -- JSON compact LLM transcript for memory (assistant turns incl. tool summaries)
  mode         TEXT,                     -- 'llm' | 'rules'
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages(session_id, created_at);

-- Assistant working memory per session (focused product, last results, etc.) — JSON owned by the agent module.
CREATE TABLE IF NOT EXISTS agent_memory (
  session_id TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inquiries (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL,
  batch_id         TEXT,
  shop_id          TEXT NOT NULL,
  product_id       TEXT,
  questions        TEXT NOT NULL,        -- JSON InquiryQuestion[]
  custom_question  TEXT,
  status           TEXT NOT NULL,        -- InquiryStatus
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 3,
  next_attempt_at  TEXT,
  channel          TEXT NOT NULL,        -- InquiryChannel
  result           TEXT,                 -- JSON InquiryResult
  result_source    TEXT,
  registered_price TEXT,                 -- JSON RegisteredPrice snapshot
  alternatives     TEXT,                 -- JSON AlternativesResponse
  context          TEXT,                 -- JSON UserContext at creation
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inquiries_session ON inquiries(session_id, created_at);
CREATE INDEX IF NOT EXISTS inquiries_shop ON inquiries(shop_id, status);
CREATE INDEX IF NOT EXISTS inquiries_product_shop ON inquiries(product_id, shop_id, updated_at);
CREATE INDEX IF NOT EXISTS inquiries_due ON inquiries(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS inquiry_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id TEXT NOT NULL,
  at         TEXT NOT NULL,
  type       TEXT NOT NULL,              -- InquiryEvent['type']
  speaker    TEXT,
  text       TEXT NOT NULL,
  data       TEXT
);
CREATE INDEX IF NOT EXISTS inquiry_events_inquiry ON inquiry_events(inquiry_id, id);

CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL,
  session_id TEXT,
  type       TEXT NOT NULL,              -- CrowdReport['type']
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_shop ON reports(shop_id, created_at);

CREATE TABLE IF NOT EXISTS plans (
  id         TEXT PRIMARY KEY,
  session_id TEXT,
  request    TEXT NOT NULL,              -- JSON VisitPlanRequest
  plan       TEXT NOT NULL,              -- JSON VisitPlan
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,            -- e.g. 'inquiry.attempt', 'inquiry.timeout'
  ref_id       TEXT NOT NULL,
  run_at       TEXT NOT NULL,
  payload      TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  done         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(done, run_at);

CREATE TABLE IF NOT EXISTS bale_links (
  shop_id    TEXT NOT NULL,
  chat_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, chat_id)
);

-- Contact module: per-inquiry extras (demo scenario, batch position, variant, demo-clock offset, seller publish flag).
CREATE TABLE IF NOT EXISTS inquiry_meta (
  inquiry_id      TEXT PRIMARY KEY,
  batch_index     INTEGER NOT NULL DEFAULT 0,
  batch_ordinal   INTEGER NOT NULL DEFAULT 1,  -- nth batch of the session
  scenario        TEXT,                        -- DEMO_SCENARIOS name (disclosed) or NULL
  variant         TEXT,                        -- JSON {key,value}[]
  clock_offset_ms INTEGER NOT NULL DEFAULT 0,  -- shopper clock (demo) − server clock
  force           INTEGER NOT NULL DEFAULT 0,  -- «همین الان بپرس»
  status_note     TEXT,
  published       INTEGER NOT NULL DEFAULT 1   -- seller reply visible to every buyer
);

-- Contact module: batch bookkeeping for the follow-up digest (CT1).
CREATE TABLE IF NOT EXISTS inquiry_batches (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL,
  product_id          TEXT,
  created_at          TEXT NOT NULL,
  first_miss_posted   INTEGER NOT NULL DEFAULT 0,
  digest_hash         TEXT,
  digest_count        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS inquiry_batches_session ON inquiry_batches(session_id, created_at);
