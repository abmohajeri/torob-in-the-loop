#!/usr/bin/env python3
"""Regenerates packages/etl/data/places.json — the "where are you?" gazetteer.

Coordinates are APPROXIMATE (goal: within ~300 m of the place's centre):
  * entries with a metro anchor (`m:<station name>`) take the coordinates of that OSM station
    (packages/etl/data/osm/metro.json) — many stations sit on the square they are named after;
  * entries with a dataset anchor (`d:<address substring>`) use the mean lat/lon of dataset shops whose
    address mentions it (passages / shopping streets) — read from the raw CSV (read-only);
  * the rest are hand-placed from local knowledge.
Validation: unique ids, Tehran bbox, kind ∈ {landmark, area}, weight ∈ (0,1]; prints the nearest metro
station distance for every place as a sanity check.

Usage: python3 -I packages/etl/scripts/curation/build-places.py [--dry] [--dataset=/path/to/shops.csv]
"""
import csv, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "..", "data"))
DATASET = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--dataset=")),
               os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", "dataset", "shops.csv")))

L, A = "landmark", "area"
# id, name, kind, subtitle, weight, anchor (m:station | d:address-substring | (lat, lng))
PLACES = [
    # ── major squares ──
    ("vanak-sq", "میدان ونک", L, "شمال تهران، ولیعصر", 1.0, (35.7575, 51.4097)),
    ("tajrish-sq", "میدان تجریش", L, "شمیران", 1.0, "m:تجریش"),
    ("azadi-sq", "میدان آزادی", L, "غرب تهران، برج آزادی", 1.0, (35.6997, 51.3380)),
    ("enghelab-sq", "میدان انقلاب", L, "مرکز تهران", 1.0, "m:میدان انقلاب اسلامی"),
    ("valiasr-sq", "میدان ولیعصر", L, "مرکز تهران", 1.0, "m:میدان حضرت ولی عصر(عج)"),
    ("ferdowsi-sq", "میدان فردوسی", L, "مرکز تهران", 0.9, "m:فردوسی"),
    ("imam-khomeini-sq", "میدان امام خمینی (توپخانه)", L, "مرکز تهران", 0.9, "m:امام خمینی(ره)"),
    ("haft-tir-sq", "میدان هفت تیر", L, "مرکز تهران، کریمخان", 1.0, "m:شهدای هفتم تیر"),
    ("imam-hossein-sq", "میدان امام حسین", L, "شرق مرکز تهران", 0.9, "m:امام حسین(ع)"),
    ("baharestan-sq", "میدان بهارستان", L, "مرکز تهران", 0.8, "m:بهارستان"),
    ("shohada-sq", "میدان شهدا (ژاله)", L, "شرق مرکز تهران", 0.7, "m:ایستگاه مترو میدان شهدا"),
    ("sadeghieh-sq", "میدان صادقیه (آریاشهر)", L, "غرب تهران", 0.9, "m:صادقیه"),
    ("punak-sq", "میدان پونک", L, "شمال غرب تهران", 0.8, (35.7615, 51.3335)),
    ("tohid-sq", "میدان توحید", L, "غرب مرکز تهران", 0.7, "m:توحید"),
    ("jahad-sq", "میدان فاطمی (جهاد)", L, "مرکز تهران", 0.7, "m:میدان جهاد"),
    ("argentina-sq", "میدان آرژانتین", L, "مرکز تهران، بیهقی", 0.8, (35.7369, 51.4155)),
    ("hasanabad-sq", "میدان حسن‌آباد", L, "مرکز تهران", 0.6, "m:حسن‌آباد"),
    ("monirieh-sq", "میدان منیریه", L, "بازار لوازم ورزشی", 0.7, "m:منیریه"),
    ("hor-sq", "میدان حر", L, "مرکز تهران", 0.5, "m:میدان حر"),
    ("rahahan-sq", "میدان راه‌آهن", L, "جنوب تهران، ایستگاه راه‌آهن", 0.7, "m:راه آهن"),
    ("shoush-sq", "میدان شوش", L, "جنوب تهران", 0.7, "m:شوش"),
    ("mohammadieh-sq", "میدان محمدیه (اعدام)", L, "جنوب تهران، نزدیک بازار", 0.6, "m:ایستگاه مترو میدان محمدیه"),
    ("khorasan-sq", "میدان خراسان", L, "جنوب شرق تهران", 0.6, "m:میدان خراسان"),
    ("ghiyam-sq", "میدان قیام", L, "جنوب مرکز تهران", 0.5, "m:ایستگاه مترو میدان قیام"),
    ("sanat-sq", "میدان صنعت", L, "شهرک غرب", 0.8, "m:میدان صنعت"),
    ("ketab-sq", "میدان کتاب", L, "سعادت‌آباد", 0.7, "m:میدان کتاب"),
    ("kaj-sq", "میدان کاج", L, "سعادت‌آباد", 0.8, (35.7785, 51.3775)),
    ("nobonyad-sq", "میدان نوبنیاد", L, "شمال شرق تهران", 0.7, "m:نوبنیاد"),
    ("heravi-sq", "میدان هروی", L, "پاسداران", 0.7, "m:میدان هروی"),
    ("valiasr-intersection", "چهارراه ولیعصر", L, "تئاتر شهر", 0.9, "m:تئاتر شهر"),
    ("istanbul-crossing", "چهارراه استانبول", L, "مرکز تهران", 0.6, (35.6982, 51.4200)),
    ("parkway", "پارک‌وی", L, "ولیعصر، شمال تهران", 0.7, (35.7928, 51.4135)),
    # ── shopping: markets, passages, malls ──
    ("grand-bazaar", "بازار بزرگ تهران", L, "پانزده خرداد، مولوی", 1.0, (35.6765, 51.4215)),
    ("jomhouri-st", "خیابان جمهوری", A, "بازار موبایل و کامپیوتر", 1.0, "d:جمهوری"),
    ("alaeddin", "پاساژ علاءالدین", L, "خیابان جمهوری، بازار موبایل", 1.0, "d:علاءالدین|علالدین"),
    ("charsou", "مرکز خرید چارسو", L, "خیابان جمهوری، موبایل و دیجیتال", 1.0, "d:چارسو"),
    ("lalehzar", "خیابان لاله‌زار", A, "بازار لوازم برق و روشنایی", 0.9, "d:لاله زار|لاله‌زار|لالهزار"),
    ("manouchehri", "خیابان منوچهری", A, "مرکز تهران", 0.6, "d:منوچهری"),
    ("saadi-st", "خیابان سعدی", A, "مرکز تهران", 0.6, "d:سعدی"),
    ("sheikh-hadi", "خیابان شیخ هادی", A, "مرکز تهران", 0.6, "d:شیخ هادی"),
    ("mellat-st", "خیابان ملت", A, "مرکز تهران", 0.5, "d:ملت"),
    ("naser-khosrow", "خیابان ناصرخسرو", A, "مرکز تهران، بازار دارو و تجهیزات", 0.6, (35.6840, 51.4205)),
    ("tajrish-bazaar", "بازار تجریش", L, "میدان تجریش", 0.8, (35.8053, 51.4328)),
    ("tandis", "مرکز خرید تندیس", L, "تجریش", 0.7, "d:تندیس"),
    ("palladium", "مرکز خرید پالادیوم", L, "زعفرانیه، مقدس اردبیلی", 0.8, (35.7975, 51.4105)),
    ("iran-mall", "ایران مال", L, "بزرگراه خرازی، غرب تهران", 0.9, (35.7556, 51.1965)),
    ("kourosh-mall", "مجتمع تجاری کوروش", L, "بلوار ستاری", 0.8, (35.7462, 51.3222)),
    ("tirazheh", "مرکز خرید تیراژه", L, "بزرگراه ستاری، آیت‌الله کاشانی", 0.7, (35.7383, 51.3224)),
    ("golestan-mall", "مرکز خرید گلستان", L, "شهرک غرب", 0.7, "d:گلستان"),
    # ── neighbourhoods / areas ──
    ("saadat-abad", "سعادت‌آباد", A, "شمال غرب تهران", 1.0, (35.7800, 51.3750)),
    ("shahrak-gharb", "شهرک غرب", A, "شمال غرب تهران", 1.0, (35.7645, 51.3690)),
    ("pasdaran", "پاسداران", A, "شمال شرق تهران", 0.9, (35.7750, 51.4700)),
    ("narmak", "نارمک", A, "شرق تهران", 0.9, (35.7380, 51.5010)),
    ("tehranpars", "تهرانپارس", A, "شرق تهران", 0.9, (35.7330, 51.5330)),
    ("yousef-abad", "یوسف‌آباد", A, "مرکز تهران", 0.8, (35.7300, 51.4070)),
    ("jordan", "جردن (نلسون ماندلا)", A, "شمال تهران", 0.8, (35.7710, 51.4180)),
    ("mirdamad", "میرداماد", A, "شمال تهران", 0.9, (35.7595, 51.4260)),
    ("sattarkhan", "ستارخان", A, "غرب تهران", 0.8, (35.7085, 51.3620)),
    ("jannat-abad", "جنت‌آباد", A, "شمال غرب تهران", 0.8, (35.7450, 51.3090)),
    ("gisha", "گیشا (کوی نصر)", A, "غرب مرکز تهران", 0.7, (35.7330, 51.3830)),
    ("amir-abad", "امیرآباد", A, "مرکز تهران، کارگر شمالی", 0.7, (35.7280, 51.3900)),
    ("ekbatan", "شهرک اکباتان", A, "غرب تهران", 0.8, "m:ایستگاه مترو شهرک اکباتان"),
    ("shahran", "شهران", A, "شمال غرب تهران", 0.7, "m:شهران"),
    ("marzdaran", "مرزداران", A, "غرب تهران", 0.6, "m:مرزداران"),
    ("bagh-feyz", "باغ فیض", A, "شمال غرب تهران", 0.5, (35.7395, 51.3156)),
    ("chitgar", "چیتگر", A, "غرب تهران", 0.5, "m:ایستگاه مترو چیتگر"),
    ("kan", "کن", A, "شمال غرب تهران", 0.4, "m:شهدای کن"),
    ("gholhak", "قلهک", A, "شمال تهران، شریعتی", 0.8, "m:قلهک"),
    ("gheytarieh", "قیطریه", A, "شمال تهران", 0.7, "m:قیطریه"),
    ("zafaraniyeh", "زعفرانیه", A, "شمال تهران", 0.7, (35.8030, 51.4170)),
    ("elahieh", "الهیه", A, "شمال تهران", 0.6, (35.7925, 51.4250)),
    ("velenjak", "ولنجک", A, "شمال تهران", 0.6, (35.8060, 51.3960)),
    ("niavaran", "نیاوران", A, "شمیران", 0.7, (35.8100, 51.4700)),
    ("farmanieh", "فرمانیه", A, "شمال شرق تهران", 0.6, (35.7990, 51.4640)),
    ("aghdasieh", "اقدسیه", A, "شمال شرق تهران", 0.5, "m:اقدسیه"),
    ("abbas-abad", "عباس‌آباد (شهید بهشتی)", A, "مرکز تهران", 0.6, "m:شهید بهشتی"),
    ("iranshahr", "ایرانشهر", A, "مرکز تهران", 0.6, (35.7114, 51.4216)),
    ("sanaei", "سنایی", A, "مرکز تهران", 0.5, (35.7192, 51.4224)),
    ("sohrevardi", "سهروردی", A, "مرکز تهران", 0.6, (35.7212, 51.4300)),
    ("amjadieh", "امجدیه", A, "مرکز تهران", 0.5, (35.7152, 51.4284)),
    ("bahar-st", "خیابان بهار", A, "مرکز تهران", 0.4, (35.7147, 51.4328)),
    ("keshavarz", "بلوار کشاورز", A, "مرکز تهران", 0.7, "m:کشاورز"),
    ("piroozi", "پیروزی", A, "شرق تهران", 0.7, "m:پیروزی"),
    ("nabard", "نبرد", A, "شرق تهران", 0.5, "m:نبرد"),
    ("nazi-abad", "نازی‌آباد", A, "جنوب تهران", 0.6, "m:شهید بخارایی"),
    ("kianshahr", "کیانشهر", A, "جنوب شرق تهران", 0.4, "m:کیان شهر"),
    ("shahr-rey", "شهر ری", A, "جنوب تهران", 0.7, "m:شهرری"),
    ("tehran-uni", "دانشگاه تهران", L, "خیابان انقلاب", 0.8, (35.7035, 51.3955)),
    ("sharif-uni", "دانشگاه شریف", L, "خیابان آزادی", 0.6, "m:دانشگاه شریف"),
    # ── other landmarks ──
    ("milad-tower", "برج میلاد", L, "گیشا، غرب تهران", 0.8, (35.7448, 51.3753)),
    ("mellat-park", "پارک ملت", L, "ولیعصر، ونک", 0.7, (35.7785, 51.4185)),
    ("tabiat-bridge", "پل طبیعت", L, "عباس‌آباد", 0.6, (35.7575, 51.4207)),
    ("laleh-park", "پارک لاله", L, "کارگر، مرکز تهران", 0.6, "m:بوستان لاله"),
    ("daneshjoo-park", "پارک دانشجو", L, "چهارراه ولیعصر", 0.5, "m:پارک دانشجو"),
    ("south-terminal", "پایانه جنوب", L, "جنوب تهران", 0.5, "m:پایانه جنوب"),
    ("mehrabad", "فرودگاه مهرآباد", L, "غرب تهران", 0.5, "m:فرودگاه مهرآباد ترمینال‌های ۱ و ۲"),
    ("mosalla", "مصلی تهران", L, "عباس‌آباد", 0.5, "m:ایستگاه مترو مصلی امام خمینی(ره)"),
    ("darvazeh-dowlat", "دروازه دولت", L, "مرکز تهران", 0.6, "m:دروازه دولت"),
    ("darvazeh-shemiran", "دروازه شمیران", L, "مرکز تهران", 0.5, "m:دروازه شمیران"),
    ("15-khordad", "پانزده خرداد", L, "بازار تهران", 0.6, "m:۱۵ خرداد شمالی"),
    ("mofatteh", "مفتح (شهید بهشتی)", L, "مرکز تهران", 0.4, "m:شهید مفتح"),
    ("haghani", "ایستگاه شهید حقانی", L, "جهان کودک، شمال تهران", 0.4, "m:شهید حقانی"),
    ("sabalan", "سبلان", A, "شرق تهران", 0.4, "m:سبلان"),
]


def haversine(a, b):
    r = 6371000
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def main():
    with open(os.path.join(DATA, "osm", "metro.json"), encoding="utf-8") as f:
        els = json.load(f)["elements"]
    stations = {}
    for e in els:
        n = (e.get("tags") or {}).get("name")
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lon = e.get("lon") or (e.get("center") or {}).get("lon")
        if n and lat and lon and n not in stations:
            stations[n] = (lat, lon)
    shops = []
    if os.path.exists(DATASET):
        with open(DATASET, encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                try:
                    shops.append((r.get("address") or "", float(r["lat"]), float(r["lon"])))
                except (KeyError, ValueError):
                    pass
    out, ids, problems = [], set(), []
    for pid, name, kind, sub, w, anchor in PLACES:
        src = "manual"
        if isinstance(anchor, tuple):
            lat, lng = anchor
        elif anchor.startswith("m:"):
            st = stations.get(anchor[2:])
            if not st:
                problems.append(f"{pid}: station «{anchor[2:]}» not in metro.json")
                continue
            lat, lng = st
            src = "metro"
        else:
            keys = anchor[2:].split("|")
            pts = [(la, lo) for a, la, lo in shops if any(k in a for k in keys)]
            # trim outliers: keep points within 1.5 km of the median
            if not pts:
                problems.append(f"{pid}: no dataset shops for {keys}")
                continue
            ml = sorted(p[0] for p in pts)[len(pts) // 2]
            mo = sorted(p[1] for p in pts)[len(pts) // 2]
            pts = [p for p in pts if haversine(p, (ml, mo)) < 1500] or pts
            lat = sum(p[0] for p in pts) / len(pts)
            lng = sum(p[1] for p in pts) / len(pts)
            src = f"dataset:{len(pts)}"
        if pid in ids:
            problems.append(f"duplicate id {pid}")
        ids.add(pid)
        if not (35.4 < lat < 36.0 and 51.0 < lng < 51.8):
            problems.append(f"{pid}: outside Tehran bbox")
        if kind not in (L, A) or not (0 < w <= 1):
            problems.append(f"{pid}: bad kind/weight")
        near = min(stations.items(), key=lambda kv: haversine(kv[1], (lat, lng)))
        print(f"{pid:22s} {src:12s} {lat:.4f},{lng:.4f}  nearest metro «{near[0]}» {haversine(near[1], (lat, lng)):.0f} m")
        out.append({"id": pid, "name": name, "kind": kind, "lat": round(lat, 4), "lng": round(lng, 4),
                    "subtitle": sub, "weight": w})
    print(f"places: {len(out)} ({sum(p['kind'] == L for p in out)} landmarks, {sum(p['kind'] == A for p in out)} areas)")
    if problems:
        print("PROBLEMS:\n  " + "\n  ".join(problems))
        sys.exit(1)
    if "--dry" not in sys.argv:
        with open(os.path.join(DATA, "places.json"), "w", encoding="utf-8") as f:
            json.dump({"version": 1, "places": out}, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("wrote", os.path.join(DATA, "places.json"))


main()
