# Assistant Page Overrides

> **PROJECT:** Torob in the Loop
> **Generated:** 2026-10-22 12:56:50
> **Page Type:** Product Detail

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## ✅ Verified for Torob in the Loop (overrides everything below)
> Layout for ALL pages: mobile column (375–440 px; desktop = centered ~440 px app frame + side panel). Ignore any max-width 800–1400 px / 12-column / full-width-section suggestions below.
- Keep: stream text token by token; 3-dot typing indicator; **status lines** naming what the agent is doing («در حال جستجو…»); clearly label AI content (badge «دستیار» + mode «هوشمند/پایه»); never present the AI as a human; no spinner > 2 s without progress text; feedback controls optional (P2).
- Rich blocks (product/store/inquiry/plan cards) are the answer; text stays ≤ 3 short sentences. Quick-reply chips after every answer (wrap, ≥ 44 px).
- Composer: sticky bottom above the tab bar (safe-area), mic button, send button with aria-label; examples as tappable chips on the empty state.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 800px (narrow, focused)
- **Layout:** Single column, centered

### Spacing Overrides

- **Content Density:** Low — focus on clarity

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- No overrides — use Master colors

### Component Overrides

- Avoid: Present AI as human
- Avoid: Static output only
- Avoid: Show loading spinner for 10s+

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Typing indicators (3-dot pulse), streaming text animations, pulse animations, context cards, smooth reveals
- AI Interaction: Clearly label AI generated content
- AI Interaction: Thumps up/down or 'Regenerate'
- AI Interaction: Stream text response token by token
