# Search Page Overrides

> **PROJECT:** Torob in the Loop
> **Generated:** 2026-10-22 12:56:50
> **Page Type:** Product Detail

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## ✅ Verified for Torob in the Loop (overrides everything below)
> Layout for ALL pages: mobile column (375–440 px; desktop = centered ~440 px app frame + side panel). Ignore any max-width 800–1400 px / 12-column / full-width-section suggestions below.
- Keep: never show a blank / bare «۰ نتیجه» — always suggestions (remove a filter, widen radius, synonyms, «از فروشگاه‌ها بپرس»); predictions while typing (/api/suggest, debounced 200 ms); high-contrast search field; category tiles with lucide icons.
- Reject: Drag-to-rotate, pinch-to-zoom, spin, AR placement, orbit controls; «List your item / Become a host» CTA.
- Filters in a bottom sheet with a sticky «نمایش N نتیجه» button; active filters as removable chips under the search bar; sort as a segmented control.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** Hero (Search focused) > Categories > Featured Listings > Trust/Safety > CTA (Become a host/seller)

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Search: High contrast. Categories: Visual icons. Trust: Blue/Green.

### Component Overrides

- Avoid: Blank screen or '0 results'
- Avoid: Require full type and enter

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Drag-to-rotate, pinch-to-zoom, spin animation, AR placement, material switching, smooth orbit controls
- Search: Show 'No results' with suggestions
- Search: Show predictions as user types
- CTA Placement: Hero Search Bar + Navbar 'List your item'
