# Coach Assistant — design system (the paved path)

This is the write-up that didn't exist while the header/dock/eyebrow
consolidation was happening (`e86388e`, `4a8d5c7`, `d1f4076`, 2026-08-01).
The work is done and correct; this file exists so the next screen built
without a designer on staff extends it instead of drifting from it. See
`reference-netflix-cpto-systems-thinking` in memory for why this matters
now specifically: non-designers building fast with AI is exactly how you
get "Frankenstein" UIs if nothing paves the path first.

**The rule:** before a screen ships its own heading, spacing constant, or
corner-anchored element, check here first. If what you need already
exists below, use it. If it doesn't, add to it — don't invent a local
one-off next to it.

---

## 1. Page headers

Every workspace screen opens with the same primitive. Before this existed,
seven screens had seven different front doors — some with no title at all,
one with its h1 pinned to the wrong size on the type scale, one running a
hardcoded pixel value with no relationship to anything else on the page.

```tsx
import PageHeader, { SectionLabel } from "@/components/ui/PageHeader";

<PageHeader
  eyebrow="Vital signs"          // optional, uses SectionLabel styling
  title="Leads"
  meta="12 active · 3 need a reply"  // optional, one line under the title
  actions={<ModeToggle />}       // optional, right-aligned, page-level controls only
>
  {/* optional: invites/banners that belong to the greeting, not the body */}
</PageHeader>
```

Everything but `title` is optional — a screen that wants only a title
passes only a title. Don't reach past the props for a custom layout; if
the header needs to do something these props can't, that's a sign the
primitive needs a new prop, not a local override.

`SectionLabel` is exported separately for the same eyebrow style used
outside a `PageHeader` (e.g. a sub-section inside a page body).

Full source: `components/ui/PageHeader.tsx`.

---

## 2. Type scale

All in `app/globals.css`. Use the token, never a raw px/rem value.

| Token | Value | Use |
|---|---|---|
| `--t-display` | `clamp(2.25rem, 4.5vw, 3.5rem)` | Marketing-only hero. Not app chrome. |
| `--t-h1` | `clamp(1.75rem, 3vw, 2.25rem)` | Page heading — this is what `PageHeader` sets. |
| `--t-h2` | `clamp(1.125rem, 1.6vw, 1.25rem)` | Section heading. One size — `--t-h3` is aliased to it, not a smaller step. |
| `--t-body` | `0.9375rem` | Default body text. |
| `--t-caption` | `0.8125rem` | Helper text. `--t-label` is aliased to it. |
| `--t-eyebrow` | `0.6875rem` (11px) | Uppercase-only labels. One size, one tracking (`--tracking-eyebrow: 0.12em`) — replaced five inconsistent px/tracking combinations across 114 call sites. |

If a heading needs a size not on this list, that's a scale gap worth
raising, not a reason to hardcode one value once.

---

## 3. The floating corner (`--dock-*`)

Three things want the bottom-right corner of the screen at once: the Dhara
bar, the bug-report button, and transient toasts. Before `d1f4076` each
picked its own offset and collided at different breakpoints. Now there's
one floor and three stacked slots, defined in `app/globals.css`:

| Token | Value | Slot |
|---|---|---|
| `--dock-base` | `calc(4rem + 1.25rem)` on mobile (clears the `h-16` tab bar), `1.25rem` at `md`+ | Floor — nothing else should compute its own bottom offset. |
| `--dock-1` | `var(--dock-base)` | Dhara bar |
| `--dock-2` | `var(--dock-base) + 3.75rem` | Bug button |
| `--dock-3` | `var(--dock-base) + 7.5rem` | Transient toast |
| `--dock-right` | `1.25rem` | Shared right inset for all three |

**The rule:** a new corner-anchored element claims the next `--dock-N`
slot. It does not pick its own `bottom` value. If all three slots are
taken, that's a real design decision (what leaves, what shares a slot) —
raise it, don't stack a fourth thing on top blind.

---

## 4. What's still owed

Not everything got swept in the consolidation, and pretending otherwise
would make this doc wrong the day it's read against the code:

- **A couple of true eyebrow labels remain unconverted** — of ~116 real
  eyebrow-shaped labels (size + uppercase + tracking together), 114
  converted to the tokens. An early pass had counted 223, but that figure
  was wrong: it included every small label in the app, not just eyebrows.
  A codemod is unsafe for the rest because some are rendered artifacts a
  coach exports (the carousel slide preview in `ContentWorkspace`), not
  chrome — that pass has to stay manual.
- **`app/api/docs`** is deliberately excluded from both the type-scale and
  eyebrow sweeps — it's an internal page, not a coach-facing screen.
- **No component inventory beyond `PageHeader` yet.** Buttons, cards,
  badges, and form inputs don't have a documented single source the way
  headers and the dock now do. Worth doing the same treatment on whichever
  of those next accumulates the most drift.
