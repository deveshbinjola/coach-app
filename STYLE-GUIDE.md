# Coach Platform — Style Guide

The system that keeps every page consistent. Three references shape it:

- **Linear** — layout discipline, density, typography rhythm, keyboard-first
- **Granola** — calm pacing, warm-but-premium tone, restraint
- **Attio** — pipeline patterns, inline-edit ergonomics

If you're adding a new page or component and you find yourself reaching for a hex code or a one-off padding value — **stop**. Use a token or extend a primitive. The whole point of this system is that the app stays coherent without anyone thinking about it.

---

## Tokens

All design decisions live in `app/globals.css` `:root` as CSS custom properties. Components consume them; nothing else hardcodes values.

### Color

**Surfaces** — what you put things on.

| Token | Hex | Use |
|---|---|---|
| `--surface` | `#FAFAF8` | Page background |
| `--surface-elevated` | `#FFFFFF` | Cards, modals, popovers |
| `--surface-deep` | `#F2F2EE` | Inset surfaces (input bg, code blocks) |
| `--surface-dark` | `#0A0F1C` | Hero / dark section backgrounds |

**Text** — how letters appear on a surface.

| Token | Hex | Use |
|---|---|---|
| `--text` | `#0A0F1C` | Primary, body |
| `--text-muted` | `#5A5A6E` | Secondary, captions |
| `--text-faint` | `#9CA3AF` | Tertiary, placeholders |
| `--text-inverse` | `#FAFAF8` | On dark surfaces |

**Brand**

| Token | Hex | Use |
|---|---|---|
| `--brand` | `#00FF41` | Primary accent |
| `--brand-strong` | `#00CC34` | Hover/active states |
| `--brand-soft` | `rgba(0,255,65,0.12)` | Tinted backgrounds |
| `--navy` | `#0A0F1C` | Primary dark |
| `--navy-soft` | `#1A1F2C` | Hover on navy |

**Semantic** — meaning before color. Use these names in code, not "amber" or "red".

| Token | Use |
|---|---|
| `--success`, `--success-soft` | Confirmations, positive states |
| `--warning`, `--warning-soft` | Attention needed (SLA warning, etc.) |
| `--danger`, `--danger-soft` | Destructive actions, errors, overdue |
| `--info`, `--info-soft` | Informational |

**Borders**

| Token | Hex | Use |
|---|---|---|
| `--border` | `#E5E5DD` | Default card/input border |
| `--border-strong` | `#C9C9BD` | Hover-emphasized |
| `--border-faint` | `#F0F0EA` | Subtle dividers |

### Spacing — 8px grid

All padding, margin, and gap should pull from these. `--s4` = 16px is the base unit; most layouts work in multiples.

| Token | Pixels |
|---|---|
| `--s1` | 4 |
| `--s2` | 8 |
| `--s3` | 12 |
| `--s4` | 16 (base) |
| `--s5` | 24 |
| `--s6` | 32 |
| `--s7` | 48 |
| `--s8` | 64 |
| `--s9` | 96 |

### Typography

**Six sizes. No more.** If you reach for a custom `font-size`, use one of these instead. Larger pages might use H1; smaller cards might use only H3 + body.

| Token | Size | Use |
|---|---|---|
| `--t-display` | `clamp(2.25rem, 4.5vw, 3.5rem)` | Marketing hero only |
| `--t-h1` | `clamp(1.75rem, 3vw, 2.25rem)` | Page heading |
| `--t-h2` | `clamp(1.25rem, 2vw, 1.5rem)` | Section heading |
| `--t-h3` | `1.0625rem` (17px) | Sub-section |
| `--t-body` | `0.9375rem` (15px) | Default body, form inputs |
| `--t-caption` | `0.8125rem` (13px) | Helper text |
| `--t-label` | `0.6875rem` (11px) | Uppercase labels above fields |

**Line heights:** `--leading-tight` 1.2 (headings), `--leading-snug` 1.4, `--leading-base` 1.55 (body), `--leading-relaxed` 1.7 (long-form).

**Font:** `--font-sans` (Plus Jakarta Sans + system fallback) is loaded once in `globals.css`. Don't import other fonts.

### Radii

| Token | Pixels | Use |
|---|---|---|
| `--r-sm` | 6 | Tags, small badges |
| `--r-md` | 10 | Buttons, inputs |
| `--r-lg` | 14 | Cards |
| `--r-xl` | 20 | Modals, large surfaces |
| `--r-pill` | 9999 | Avatars, pills |

### Elevation — prefer shadows over borders

Linear/Granola almost never use borders on cards — they use subtle shadows. We default to bordered cards, but `<Card variant="elevated">` swaps in a shadow.

| Token | Use |
|---|---|
| `--shadow-sm` | Resting state, near-flat |
| `--shadow-md` | Floating cards (auto-draft preview, just-landed band) |
| `--shadow-lg` | Modals, popovers |
| `--shadow-glow` | Focus ring (3px brand-soft halo) |

### Motion

`--t-fast` (120ms), `--t-base` (180ms), `--t-slow` (280ms). Always use these — never magic numbers like `300ms`. Reduced-motion users get near-instant transitions automatically (handled in `globals.css`).

---

## Component primitives

Live in `components/ui/`. Import from `@/components/ui`:

```tsx
import { Button, Card, Badge, Avatar, Modal, Input, Textarea, Select } from "@/components/ui";
```

### `<Button>`

Three variants, two sizes, optional icons. **Use this for every button**.

```tsx
<Button variant="primary" size="md">Apply</Button>
<Button variant="ghost" leadingIcon={<PlusIcon />}>Add lead</Button>
<Button variant="danger" size="sm">Discard</Button>
<Button block>Save changes</Button>  // full-width
```

### `<Card>`

Two variants (`flat` default, `elevated` for "look at me" cards), four padding densities.

```tsx
<Card>...</Card>                          // default flat + md padding
<Card variant="elevated" padding="lg">...</Card>
<Card padding="none">...</Card>           // when content brings its own padding
```

### `<Badge>`

Six tones. **Pick by meaning, not color.**

```tsx
<Badge tone="brand" uppercase>✓ Active</Badge>
<Badge tone="warning">Going silent</Badge>
<Badge tone="danger" uppercase>Overdue</Badge>
<Badge tone="muted">Archived</Badge>
```

### `<Avatar>`

Initials chip. Three sizes, optional inverse color for dark surfaces.

```tsx
<Avatar name="Sunny Binjola" size="md" />
<Avatar name="Steve Ware" size="lg" inverse />
```

### `<Modal>`

The only overlay component. Centered modal on desktop, bottom sheet on mobile. **Replace every `confirm()` and `alert()` with this.**

```tsx
<Modal open={isOpen} onClose={() => setOpen(false)} title="Discard draft?" description="This can't be undone.">
  <div className="flex gap-2 justify-end">
    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    <Button variant="danger" onClick={confirmDiscard}>Discard</Button>
  </div>
</Modal>
```

### `<Input>`, `<Textarea>`, `<Select>`

Form primitives with built-in `label`, `hint`, and `error` props. Don't render `<label>` elements separately.

```tsx
<Input label="Email" hint="We'll never share this." placeholder="you@example.com" />
<Textarea label="Notes" rows={4} />
<Select label="Source">
  <option value="ig">Instagram</option>
  <option value="referral">Referral</option>
</Select>
<Input error="Please enter a valid email" />  // overrides hint
```

---

## Patterns

### Page layout

Three top-level patterns covering ~95% of pages:

1. **Hero + content** (`/command-center`, `/voice`, `/voice/mine`) - page title, optional metric/state row, then content sections.
2. **Table/list with toolbar** (`/inbox`, `/decisions`) - page title, action buttons in toolbar, table or kanban below.
3. **Sidebar + content** (`/leads/[id]`, `/settings`) — left-rail metadata, main content right.

Each gets `<main className="max-w-6xl mx-auto p-6">` (or `max-w-5xl` for narrower forms) under `<Header>`.

### Empty states

When a page would be empty (no leads, no voice profile, no integrations):

- **Don't say "No data"** — explain *why*, suggest the next action.
- One sentence + one button.
- Center the content vertically in the available space.

```tsx
<Card padding="lg" className="text-center">
  <h3 className="text-[var(--t-h3)] font-extrabold">No leads yet.</h3>
  <p className="text-[var(--text-muted)] mt-1">Add one and the focus queue lights up.</p>
  <div className="mt-4">
    <Button>+ Add your first lead</Button>
  </div>
</Card>
```

### Loading states

- **Brief operations (<500ms)** — no spinner. Just disable the trigger.
- **Medium operations (500ms – 5s)** — disable the trigger, swap label to "Saving…".
- **Long operations (>5s)** — show pulsing dot + descriptive label ("Mining your voice…").
- **Page-load skeletons** — only when fetching takes >300ms. Match the eventual layout (don't show a giant gray rectangle for a small list).

### Active state

Use the `--brand-soft` tinted background + dark text + thin border, never a solid green fill (too loud). See `Header.tsx` `<NavLink>` for the canonical pattern.

### Iconography

- **No emoji as icons in the app UI.** Emoji are for marketing/landing only.
- Use inline SVGs from a consistent stroke set. Lucide icons are a good default if you need a library.
- Standard icon size: 14px (in tags/badges), 16px (in buttons), 20px (page hero), 24px (nav).
- Never `width="20" height="20"` — use Tailwind size classes for consistency.

### Accessibility

- Every interactive element is reachable by keyboard (`Tab`).
- Focus ring uses `--shadow-glow` (handled by `:focus-visible` in `globals.css`).
- Contrast: text on surface ≥ 7:1, text-muted on surface ≥ 4.5:1 (we're at 5.6:1).
- Tap targets: minimum 44×44px.

### Mobile-first

- Default styles target small screens. Use `md:` and `lg:` breakpoints to *upgrade* layouts.
- Tables collapse to cards (or kanban swimlanes) on small screens.
- No hover-only interactions — every hover effect must have a tap equivalent.

---

## What's deprecated

These exist for backward compatibility while pages get refactored. Don't add new uses.

- `.btn-primary` → use `<Button variant="primary">`
- `.btn-ghost` → use `<Button variant="ghost">`
- `.card` → use `<Card>`
- `.tag`, `.tag-hot`, etc. → use `<Badge>`

---

## Refactoring rule of thumb

When refactoring an existing page:

1. **Strip first, add later.** Before swapping in primitives, delete every hardcoded color, padding value, and font-size in the page. Pick from tokens.
2. **One Card style per surface.** If a page has flat cards mixed with gradient cards mixed with bordered cards, pick one and use it everywhere on that page.
3. **Border, shadow, OR neither — pick one.** Don't combine.
4. **Three sizes max per type element.** A page should have at most three font sizes visible simultaneously (e.g., page H1, section H2, body) plus labels/captions.
5. **Touch the same component twice = make it a primitive.** If you find yourself styling the same shape twice, it's a candidate for `components/ui/`.

---

## Roadmap

Session 1 (this): tokens + primitives + this guide. ✓
Session 2: refactor `/command-center` to consume primitives - Granola energy.
Session 3: refactor `/inbox` - Attio energy, sharper card view.
Session 4: refactor `/voice`, `/settings`, `/voice/mine`, `/leads/[id]` - Linear energy.
Session 5: mobile pass - every page on 375px wide.
Session 6: take screenshots, rebuild landing page.
