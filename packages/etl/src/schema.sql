-- Torob in the Loop catalog database (READ-ONLY at runtime).
-- Built by packages/etl (`npm run data:build`) from the Torob dataset CSVs.
-- Contract: apps/server reads exactly these tables/columns. Add columns only; never rename.
-- JSON columns hold the shapes named in comments (see packages/shared/src/types.ts).

PRAGMA page_size = 4096;

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- keys: schema_version, built_at, data_as_of (max price change ISO), counts (JSON), source (JSON)
--       quality (JSON, added by ETL: coverage / data-quality numbers for the About page, see docs/DATA-REPORT.md)

CREATE TABLE category_groups (
  id            TEXT PRIMARY KEY,           -- e.g. 'mobile' (see shared CATEGORY_GROUPS)
  name          TEXT NOT NULL,
  icon          TEXT NOT NULL,
  sort          INTEGER NOT NULL,
  product_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,  -- leaf category as in dataset
  name_norm           TEXT NOT NULL,         -- normalizeForSearch(name)
  group_id            TEXT NOT NULL,
  aliases             TEXT NOT NULL DEFAULT '[]',  -- JSON string[] of normalized search aliases
  product_count       INTEGER NOT NULL DEFAULT 0,
  offer_count         INTEGER NOT NULL DEFAULT 0,
  shop_count          INTEGER NOT NULL DEFAULT 0,  -- shops with >=1 offer in this category
  declared_shop_count INTEGER NOT NULL DEFAULT 0,  -- shops declaring it as an activity category
  price_p25           INTEGER,                     -- quantiles over product median prices
  price_p50           INTEGER,
  price_p75           INTEGER,
  price_p90           INTEGER,
  group_source        TEXT NOT NULL DEFAULT 'taxonomy'  -- (added) 'taxonomy' | 'cooccurrence' (declared-only category, inferred) | 'default' (unmapped → other)
);
CREATE INDEX categories_group ON categories(group_id);

CREATE TABLE brands (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,        -- display name (Persian when available)
  name_en       TEXT,
  name_norm     TEXT NOT NULL,
  aliases       TEXT NOT NULL DEFAULT '[]',  -- JSON string[] normalized spellings (fa + en)
  product_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE malls (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,                  -- display, e.g. «پاساژ علاءالدین ۲»
  name_norm  TEXT NOT NULL,
  kind       TEXT NOT NULL,                  -- MallKind
  area       TEXT,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  shop_count INTEGER NOT NULL DEFAULT 0,
  floors     TEXT NOT NULL DEFAULT '[]',     -- JSON [{num: number|null, label: string, count: number}]
  aliases    TEXT NOT NULL DEFAULT '[]'      -- (added) JSON string[] normalized spellings seen in addresses («علالدین», «علاءالدین»…)
);

CREATE TABLE areas (
  name              TEXT PRIMARY KEY,        -- dataset location_label
  lat               REAL NOT NULL,           -- centroid of its shops
  lng               REAL NOT NULL,
  shop_count        INTEGER NOT NULL,
  shops_with_offers INTEGER NOT NULL,
  in_traffic_zone   INTEGER NOT NULL
);

CREATE TABLE shops (
  rid                INTEGER PRIMARY KEY,    -- compact integer id
  id                 TEXT NOT NULL UNIQUE,   -- 'shop_…'
  name               TEXT NOT NULL,
  name_is_real       INTEGER NOT NULL,       -- 1 when instagram/website present (dataset README)
  address            TEXT,
  area               TEXT,
  lat                REAL NOT NULL,
  lng                REAL NOT NULL,
  phone              TEXT,                   -- display number (fake in dataset)
  phone_kind         TEXT,                   -- 'mobile' | 'landline'
  instagram          TEXT,
  website            TEXT,
  categories         TEXT NOT NULL DEFAULT '[]',  -- JSON string[] declared activity categories
  offer_count        INTEGER NOT NULL DEFAULT 0,
  product_count      INTEGER NOT NULL DEFAULT 0,
  fast_delivery      INTEGER,                -- 1 / 0 / NULL (tri-state as registered)
  payment            TEXT NOT NULL DEFAULT '[]',  -- JSON PaymentOption[]
  installment        INTEGER NOT NULL DEFAULT 0,  -- any installment provider declared
  torobpay_in_person INTEGER NOT NULL DEFAULT 0,
  text_hints         TEXT NOT NULL DEFAULT '[]',  -- JSON PaymentInfo['textHints'] mined from offer descriptions
  hours              TEXT,                   -- JSON WeeklyHours, NULL when nothing declared
  hours_declared     INTEGER NOT NULL DEFAULT 0,
  hours_suspicious   INTEGER NOT NULL DEFAULT 0,
  mall_id            INTEGER,                -- -> malls.id
  floor_label        TEXT,                   -- normalized Persian label, e.g. «طبقه ششم», «همکف», «زیرزمین اول»
  floor_num          INTEGER,                -- 0 = همکف, negative = basement
  unit               TEXT,
  plaque             TEXT,
  wing               TEXT,                   -- e.g. «راهروی جنوبی», «لاین راست», «بخش غربی»
  landmark           TEXT,                   -- e.g. «روبه‌روی کافه نادری»
  loc_confidence     TEXT NOT NULL DEFAULT 'low',  -- 'high' | 'medium' | 'low'
  last_price_change  TEXT,                   -- newest price change among its offers
  name_norm          TEXT NOT NULL DEFAULT '',  -- (added) normalizeForSearch(name)
  address_norm       TEXT NOT NULL DEFAULT '',  -- (added) normalizeForSearch(address + area + mall name) for shop lookup
  instagram_url      TEXT,                    -- (added) profile URL; `instagram` holds the handle
  tier               TEXT NOT NULL DEFAULT 'C',  -- (added, DT5) 'A' has offers · 'B' declared categories only · 'C' neither
  update_discipline  REAL,                    -- (added, SV4) share of valid prices changed ≤ 14 d before data_as_of; NULL = no priced offers
  installment_tier   TEXT NOT NULL DEFAULT 'none_recorded'  -- (added, SV9) InstallmentTier
);
CREATE INDEX shops_area ON shops(area);
CREATE INDEX shops_mall ON shops(mall_id);
CREATE INDEX shops_lat ON shops(lat);

CREATE TABLE products (
  rid                    INTEGER PRIMARY KEY,   -- equals products_fts rowid
  id                     TEXT NOT NULL UNIQUE,  -- 'product_…'
  title                  TEXT NOT NULL,         -- display title after fallback chain
  title_source           TEXT NOT NULL,         -- 'catalog' | 'seller' | 'generated'
  title_norm             TEXT NOT NULL,         -- normalizeForSearch(title) (LIKE fallback)
  title_en               TEXT,
  brand                  TEXT,
  brand_inferred         INTEGER NOT NULL DEFAULT 0,
  model                  TEXT,
  category_id            INTEGER NOT NULL,      -- -> categories.id
  group_id               TEXT NOT NULL,
  audience               TEXT,                  -- 'men'|'women'|'kids'|'unisex'|NULL
  images                 TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  specs                  TEXT,                  -- JSON [[key, value], ...] or NULL
  spec_count             INTEGER NOT NULL DEFAULT 0,
  offer_count            INTEGER NOT NULL DEFAULT 0,
  shop_count             INTEGER NOT NULL DEFAULT 0,
  valid_price_count      INTEGER NOT NULL DEFAULT 0,
  price_min              INTEGER,
  price_max              INTEGER,
  price_median           INTEGER,
  last_price_change      TEXT,
  oldest_price_change    TEXT,
  installment_shop_count INTEGER NOT NULL DEFAULT 0,
  popularity             REAL NOT NULL DEFAULT 0,    -- ranking prior (higher = better)
  brand_source           TEXT,                  -- (added, DT3) 'dataset' | 'spec' | 'title' | NULL
  model_key              TEXT,                  -- (added, DT8) '<category_id>|<brand_norm>|<model tokens>' shared by variants; NULL unknown
  is_replica             INTEGER NOT NULL DEFAULT 0  -- (added, DT6) catalog title marks a replica («طرح نوکیا», «های کپی» …)
);
CREATE INDEX products_category ON products(category_id, popularity DESC);
CREATE INDEX products_group ON products(group_id, popularity DESC);
CREATE INDEX products_brand ON products(brand);
-- (no model_key index: size budget for the Liara upload; sibling lookups scan once per single-product ladder)

CREATE TABLE offers (
  rid              INTEGER PRIMARY KEY,
  id               TEXT NOT NULL UNIQUE,     -- 'offer_…'
  product_rid      INTEGER NOT NULL,         -- -> products.rid
  shop_rid         INTEGER NOT NULL,         -- -> shops.rid
  seller_title     TEXT,
  description      TEXT,
  price            INTEGER,                  -- valid Toman price or NULL
  raw_price        INTEGER,                  -- as registered (0 / outliers preserved for transparency)
  price_status     TEXT NOT NULL,            -- 'ok' | 'missing' | 'suspicious'
  price_changed_at TEXT,                     -- ISO or NULL
  warranty         TEXT,                     -- JSON WarrantyInfo or NULL
  warranty_kind    TEXT,
  hints            TEXT,                     -- JSON string[] text hints or NULL
  raw_price_text   TEXT,                     -- (added) exact registered digits when raw_price had to be clamped (> 2^53)
  price_rule       TEXT,                     -- (added) why not ok: 'missing' | 'too_high' | 'too_low' | 'outlier_high' | 'outlier_low'
                                             --   | 'category_low' | 'category_high' (1–2-offer products vs category p1 / p99×3) | 'model_outlier' (< 0.35 × model-family median)
  attrs            TEXT                      -- (added, DT6) JSON OfferAttrs mined from seller title/description, NULL = nothing mentioned
);
CREATE INDEX offers_product ON offers(product_rid, price);
CREATE INDEX offers_shop ON offers(shop_rid);

-- Declared activity categories per shop (category-only candidates come from has_offers = 0 rows / no offer for product)
CREATE TABLE shop_categories (
  category_id INTEGER NOT NULL,
  shop_rid    INTEGER NOT NULL,
  has_offers  INTEGER NOT NULL,              -- shop has >=1 offer in this category
  PRIMARY KEY (category_id, shop_rid)
) WITHOUT ROWID;

-- Low-cardinality spec facets for discovery & filtering (key/value normalized for display)
CREATE TABLE product_facets (
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  product_rid INTEGER NOT NULL,
  PRIMARY KEY (key, value, product_rid)
) WITHOUT ROWID;
CREATE INDEX product_facets_product ON product_facets(product_rid);

-- Search synonyms: normalized term -> JSON string[] of normalized expansions
CREATE TABLE synonyms (
  term       TEXT PRIMARY KEY,
  expansions TEXT NOT NULL
);

-- Gazetteer for the location picker (areas, landmarks, metro stations, malls)
CREATE TABLE places (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  kind      TEXT NOT NULL,                   -- 'area' | 'landmark' | 'metro' | 'mall'
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  subtitle  TEXT,
  weight    REAL NOT NULL DEFAULT 0
);

CREATE TABLE metro_stations (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  name_en TEXT,
  lat     REAL NOT NULL,
  lng     REAL NOT NULL,
  lines   TEXT NOT NULL DEFAULT '[]'         -- JSON [{ref: '4', color: '#…'}]
);

-- Full-text index (contentless; rowid = products.rid). All columns hold normalizeForSearch() text.
-- title: display title; brand: brand + aliases (fa/en); category: leaf + group names + aliases;
-- extra: model, english title, distinct seller titles (trimmed), key spec values.
CREATE VIRTUAL TABLE products_fts USING fts5(
  title, brand, category, extra,
  content = '',
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
