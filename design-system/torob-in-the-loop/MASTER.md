# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Torob in the Loop
**Generated:** 2026-10-22 12:56:50
**Category:** E-commerce
**Design Dials:** Variance 4/10 (Balanced / Modern) | Motion 3/10 (Subtle) | Density 6/10 (Standard)

---

## ⭐ Torob in the Loop adaptations (verified overrides — read these FIRST)

Generated with the ui-ux-pro-max skill (`.claude/skills/ui-ux-pro-max`): query `"hyperlocal shopping e-commerce assistant trust"`,
product type matched **E-commerce** palette; product profile **Hyperlocal Services** (Minimalism & Swiss Style +
Vibrant & Block-based; location markers + trust colors). The rules below adapt the generic output to our verified
constraints (Persian RTL mobile PWA, React + Vite + Tailwind v4, lucide-react). They override the sections further down.

1. **Typography — Vazirmatn only.** Rubik / Nunito Sans have no Arabic-script coverage. The skill's google-fonts data
   lists *Vazirmatn* (variable wght 100–900, subsets arabic + latin + latin-ext) — self-hosted via
   `@fontsource-variable/vazirmatn`. Weights: 400 body · 500 labels · 700 headings · 800 prices/hero. Body 15–16 px,
   line-height 1.65 (Persian script needs more than 1.5); minimum 12 px for metadata. Prices use `tabular-nums`.
   Latin model names inside Persian text go in `<bdi>` / `dir="auto"`.
2. **Color roles (E-commerce palette, contrast-verified ≥ 4.5:1 for text):**
   | Role | Value | Use |
   |---|---|---|
   | primary | `#059669` | brand graphics only: icons, borders, focus ring, map pins, active-nav indicator (3.77:1 on white — OK for non-text ≥ 3:1, **not** for small text) |
   | primary-strong | `#047857` | **solid primary buttons with white text** (5.48:1) and brand-colored text/links on white |
   | primary-tint | `#ECFDF5` bg + `#065F46` text | selected chips, "good" badges (7.29:1) |
   | foreground | `#064E3B` | headings (9.2:1); long Persian body text `#0F172A` (17.9:1) / secondary `#334155` |
   | accent (CTA/urgency) | `#EA580C` | non-text highlights; as solid fill only with **black** text (5.90:1) |
   | accent-strong | `#C2410C` | **solid CTA buttons with white text** (5.18:1), e.g. «استعلام از فروشگاه‌ها»; accent text on white |
   | accent-tint | `#FFF7ED` bg + `#9A3412` text | "best price"/urgency/stale-price badges (6.88:1) |
   | background | `#ECFDF5` | page background (muted text `#475569` on it = 7.19:1) |
   | card | `#FFFFFF` | all cards/sheets (palette table wins over the `.card` snippet below) |
   | muted / muted-fg | `#E8F1F3` / `#475569` | secondary surfaces / secondary text |
   | border | `#A7F3D0` brand-tinted dividers; `#E2E8F0` neutral card borders | |
   | destructive | `#DC2626` (4.83:1 on white) | errors, "closed", out of stock |
   | semantic text | good `#047857`, info `#0369A1` (5.93), warn `#B45309` (5.02), bad `#DC2626` (4.83) | freshness / open status / verification badges — **never color-only**: always icon + text |
3. **Style:** Minimalism & Swiss (grid, whitespace, clear hierarchy, essential elements) as the base, with
   Vibrant & Block-based accents only where they carry meaning (category tiles, primary CTAs, live-call states,
   map pins). Depth via soft shadows on cards/sheets (shadow-sm/md) — not "flat without depth".
4. **Pattern:** this is an app, not a landing page. Home = search/assistant hero (Marketplace pattern: "search is the
   primary CTA") + category blocks + 4-step "how it works" + trust/transparency note. "Feature-Rich Showcase" applies
   only to the desktop side panel.
5. **Motion:** no GSAP (not in stack). Same intent via CSS / `motion/react`: fade + 8–12 px rise, 300–400 ms
   `ease-out` for reveals; 150–250 ms for state changes; exit faster than enter; respect `prefers-reduced-motion`
   (render final state). Streaming text + 3-dot typing indicator for the assistant.
6. **Icons:** lucide-react only, consistent 1.75 stroke; **no emojis as icons** (incl. context-bar chips).
   Directional icons (chevrons/arrows) mirror in RTL. Decorative icons `aria-hidden`; icon-only buttons get `aria-label` (Persian).
7. **RTL & layout:** logical utilities (`ms-/me-/ps-/pe-/start-/end-`), `dir="rtl"` root; mobile-first 375–430 px;
   use `dvh` (not `100vh`); safe-area insets for header/bottom nav/sticky CTAs; no horizontal page scroll (only
   tables/carousels scroll inside their own container); content never hidden behind fixed bars.
8. **Touch:** targets ≥ 44×44 px with ≥ 8 px gaps; pressed/hover feedback on every tappable; `cursor-pointer` on all clickables;
   loading feedback within 100 ms (skeletons, not long spinners).
9. **Trust & transparency are part of the visual language:** registered price, price date/freshness, verified (call/seller) info
   and unknown values each have a distinct, consistent badge treatment (see docs/PRD.md §3.10).

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#059669` | `--color-primary` |
| On Primary | `#000000` | `--color-on-primary` |
| Secondary | `#10B981` | `--color-secondary` |
| On Secondary | `#0F172A` | `--color-on-secondary` |
| Accent/CTA | `#EA580C` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#ECFDF5` | `--color-background` |
| Foreground | `#064E3B` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#064E3B` | `--color-card-foreground` |
| Muted | `#E8F1F3` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#A7F3D0` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#059669` | `--color-ring` |

**Color Notes:** Success green + urgency orange [Accent adjusted from #F97316]

### Typography

- **Heading Font:** Rubik
- **Body Font:** Nunito Sans
- **Mood:** ecommerce, clean, shopping, product, retail, conversion
- **Google Fonts:** [Rubik + Nunito Sans](https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&family=Rubik:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&family=Rubik:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 6/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #EA580C;
  color: #000000;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #064E3B;
  border: 2px solid #059669;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #ECFDF5;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #059669;
  outline: none;
  box-shadow: 0 0 0 3px #05966920;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Vibrant & Block-based

**Keywords:** Bold, energetic, playful, block layout, geometric shapes, high color contrast, duotone, modern, energetic

**Best For:** Startups, creative agencies, gaming, social media, youth-focused, entertainment, consumer

**Key Effects:** Large sections (48px+ gaps), animated patterns, bold hover (color shift), scroll-snap, large type (32px+), 200-300ms

### Page Pattern

**Pattern Name:** Feature-Rich Showcase

- **Conversion Strategy:** Clear feature hierarchy. One key message per card. Strong CTA repetition.
- **CTA Placement:** Hero (sticky) + After features + Bottom
- **Section Order:** Hero (value prop) > Feature grid/cards (4-6) > Use cases or benefits > Social proof or logos > CTA

---

## Motion

**Scroll Reveal** (Subtle) — Trigger: scroll (viewport enter) | Duration: 300-400ms | Easing: `power1.out`

```js
gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.out', scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
```

**Framework notes:** Requires the ScrollTrigger plugin registered once via gsap.registerPlugin(ScrollTrigger); Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Keep the y offset small (8-16px) so it reads as a fade, not a slide
- ❌ Don't reveal below-the-fold content needed for SEO/crawlers as invisible-by-default without a no-JS fallback
- ⚡ toggleActions 'play none none reverse' avoids re-triggering on every scroll direction change

---

## Anti-Patterns (Do NOT Use)

- ❌ Flat design without depth
- ❌ Text-heavy pages

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
