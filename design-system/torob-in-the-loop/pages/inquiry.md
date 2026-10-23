# Inquiry Page Overrides

> **PROJECT:** Torob in the Loop
> **Generated:** 2026-10-22 12:56:51
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## ✅ Verified for Torob in the Loop (overrides everything below)
> Layout for ALL pages: mobile column (375–440 px; desktop = centered ~440 px app frame + side panel). Ignore any max-width 800–1400 px / 12-column / full-width-section suggestions below.
- Keep: immediate feedback after submit (loading → success/error); status colors green/amber/red **with icons + text**; data-dense but scannable; ONE atomic live-region status per call (e.g. «تماس با فروشگاه … — در حال گفتگو»), never a competing live region per badge.
- Reject: real-time chart animations, glow/blink effects, spatial UI, "start trial" CTAs.
- Call screen: avatar + shop name + call state (ringing pulse ≤ 1.5 s cycles, respects reduced motion) → transcript bubbles (agent vs store) streaming in → result card (stock · price vs registered · hours · hold) → next steps (برنامه بازدید / جایگزین‌ها). Simulated calls carry a visible «نسخه نمایشی» badge.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1400px or full-width
- **Grid:** 12-column grid for data flexibility
- **Sections:** Hero (product + live preview or status) > Key metrics/indicators > How it works > CTA (Start trial / Contact)

### Spacing Overrides

- **Content Density:** High — optimize for information display

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Dark or neutral. Status colors (green/amber/red). Data-dense but scannable.

### Component Overrides

- Avoid: No feedback after submit
- Avoid: Static element until pinch
- Avoid: Announce a bare number or make every badge a competing live region

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Real-time chart animations, alert pulse/glow, status indicator blink animation, smooth data stream updates, loading effect
- Forms: Show loading then success/error state
- Spatial UI: Scale/highlight element on look
- Accessibility: Use one appropriate atomic status message such as 3 items in cart
- CTA Placement: Primary CTA in nav + After metrics
