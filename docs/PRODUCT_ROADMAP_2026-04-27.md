# Coach Platform Product Roadmap

Date: 2026-04-27

## Positioning

Build the daily revenue operator for coaches who sell through conversation.

The wedge is not "CRM with AI." The wedge is:

> No lead slips. No reply sounds fake. No coach has to live in a CRM.

Voice is the trust layer. Lead rescue is the money layer. The product should make those two ideas feel inseparable.

## Current Strengths

- Voice is already treated as the spine of the app, not a feature tab.
- The welcome flow has a clear activation moment: generic AI vs. the coach's voice.
- The command center has the right ingredients: money, voice trust, drafts, lead SLA, and focus.
- Lead capture has useful foundations: manual add, import, voice-add, webhooks, and AI parsing.
- Voice Trust Loop is a smart moat because it learns from edits, not vanity feedback.
- The design system is already moving toward restrained, token-based UI.

## Product Gaps

- Lead capture is still split across too many mental models: add, import, voice-add, webhook, inbox.
- The app needs one obvious promise for new coaches: "drop anything in and it becomes a lead."
- Compose still risks feeling like campaign software. The stronger shape is "draft the next honest message for these people."
- Content pipeline is only valuable when tied to leads, replies, and booked calls.
- Voice profile editing should feel like training taste, not editing settings.
- Analytics should stay sparse. Most charts should become actions or disappear.

## Phase 1: Activation And Share Loop

Goal: Make a coach feel the product in under 5 minutes and want to show someone.

Ship:

- Welcome flow polish with a stronger first screen and premium reveal.
- Shareable proof card that looks like a product artifact, not a screenshot.
- Voice extraction processing beats: "finding conviction," "mapping rhythm," "catching phrases to avoid."
- Thumbs up/down on extracted voice fields.
- Real DM screenshot input for the magic moment.

Success signal:

- New coach completes voice setup.
- New coach generates demo reply.
- New coach shares or downloads the proof image.

## Phase 2: Lead Rescue

Goal: Make Command Center the place coaches open every morning.

Ship:

- Lead Rescue block as the first action surface after money.
- "Rescue these leads" opens Compose with selected leads prefilled.
- Reason labels: no first touch, promised follow-up, going cold, ready for call invite.
- One-click draft actions from rescue rows.
- Empty state that pushes capture or reach, not analytics.

Success signal:

- Coach sends or logs at least one rescue message per session.
- Overdue leads decrease week over week.
- More leads reach booked status after rescue messages.

## Phase 3: Capture Everything

Goal: Make lead entry feel effortless.

Ship:

- Unified capture surface: paste text, upload screenshot, speak, import CSV, or connect webhook.
- "Drop anything in" parser that creates draft leads for review.
- Source detail preservation for content attribution.
- Capture inbox for unreviewed parsed leads.
- Mobile-first screenshot capture.

Success signal:

- Coach adds leads without touching a form.
- New leads have useful pain signals, source details, and first draft eligibility.

## Phase 4: Voice Taste Model

Goal: Make the AI improve like an assistant who learns the coach.

Ship:

- Editable voice profile fields with approve/reject controls.
- Draft feedback chips: too polished, too soft, too salesy, more direct, not me.
- Edit-diff learning from sent messages.
- Voice drift detection from recent outbound messages.
- Version comparison: what changed in my voice?

Success signal:

- Voice trust rises over time.
- Coach edits fewer AI drafts.
- Coach keeps more AI sentences intact.

## Phase 5: Content That Creates Pipeline

Goal: Keep content only where it drives conversations.

Ship:

- Tie each lead source detail to posts, newsletters, podcasts, or campaigns.
- "This post created buyers" insight.
- "Post this next to restart quiet conversations" action.
- CTA library in the coach's voice.
- Content follow-up drafts for people who engaged but did not book.

Success signal:

- Content surfaces produce replies, leads, or booked calls.
- Coaches can identify which topics create buyers.

## Phase 6: Carefully Automated Sending

Goal: Let trusted workflows speed up without losing the coach's agency.

Ship:

- Auto-send threshold only after enough sends and high voice trust.
- Restricted auto-send use cases: first-touch acknowledgement, soft nudge, resource delivery.
- Review queue for anything high-stakes: price, objection, close, conflict.
- Kill switch in settings and per-lead override.

Success signal:

- Auto-send handles low-risk messages.
- Coaches still review high-leverage conversations.
- No drop in voice trust or reply quality.

## Design Principles

- One primary action per screen.
- Put money and action before analytics.
- Use green sparingly for action, proof, and signal.
- Use human labels over CRM labels.
- Hide weak metrics until there is enough data.
- Prefer calm density over decorative cards.
- Every insight needs a button.
- Every empty state should create motion.

## Cut List

- Do not build a full CRM pipeline just because competitors have one.
- Do not build broad analytics unless the metric changes a decision.
- Do not make content planning a separate product.
- Do not overbuild campaigns before one-to-one rescue feels excellent.
- Do not ask coaches to configure what the product can infer.

## Next Build Recommendation

Build the full Lead Rescue loop:

1. Command Center shows at-risk leads.
2. "Rescue these leads" opens Compose with selected leads.
3. Compose defaults to the correct purpose per lead: first response, follow-up, rewarm, close loop.
4. Sent messages update lead status, last contact, original draft, and voice trust.
5. Command Center celebrates fewer leaking leads, not more charts.

