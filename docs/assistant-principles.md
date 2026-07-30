# Coach Assistant — operating principles

How the assistant is allowed to behave. This governs feature design, not
just copy. When a new capability is proposed, it gets checked against this
file before it gets built.

Sources: Nir Eyal (*Hooked* + the Manipulation Matrix from *Indistractable*),
Sandeep Swadia (the 4 C's / trust ladder), and the one-product decision of
2026-07-29.

---

## 1. The trust ladder

The assistant earns autonomy. It does not start with it.

| Rung | What the assistant does | What the coach does |
|------|------------------------|---------------------|
| **Visibility** | Shows what it sees. Nothing else. | Reads. |
| **Efficiency** | Prepares the work: drafts, briefs, summaries. | Approves, edits, sends. |
| **Automation** | Does a narrow, named class of task on a trigger. | Set it up once, spot-checks. |
| **Delegation** | Acts unattended inside agreed bounds. | Reviews after the fact. |

Rules that follow from it:

- **Every new capability enters at Visibility.** It does not launch at
  Automation because the demo was impressive.
- **A rung is earned per capability, not per product.** Trusting the brief
  to summarise leads does not grant permission to email them.
- **Nothing that leaves the building is ever automatic without explicit,
  specific opt-in.** No message to a client or lead is sent by the
  assistant on its own until the coach has turned that on, for that thing,
  knowing what it will do.
- **Every rung above Visibility needs a visible undo or an approval step.**

The failure this prevents: a coach discovers the assistant has been talking
to their clients. That is unrecoverable. There is no version of "it drafted
well" that survives it.

---

## 2. Telescope and Microscope

The assistant has exactly two ways of looking at a coach's world. Every
brain/context feature is one of them. If a proposed feature is neither,
the shape is probably wrong.

- **Telescope** — pull scattered signals into one picture. Wide, shallow,
  recurring. *The Daily Brief. The Business Pulse. The Brain overview.*
- **Microscope** — unpack one dense thing until it is legible. Narrow,
  deep, on demand. *The Mirror. A single client thread. A contract. One
  month of session notes.*

They have different failure modes. A Telescope that goes deep becomes
noise. A Microscope that goes wide becomes vague. Keep them apart.

---

## 3. Ask one question before producing something substantial

When the assistant is asked to produce real work and a load-bearing piece
of context is missing, it asks **one** question first. Not three. Not a
form.

- One question, the sharpest one, then produce.
- Never ask when the answer is already in memory or the brief. Checking
  first is the whole point.
- Never ask twice about the same thing.
- Cheap, fast output (a quick reply draft) does not warrant a question.
  Expensive output (a sequence, a campaign, a long asset) does.

See `lib/assistant/clarify.ts`.

---

## 4. The ethics gate (both questions must pass)

From Eyal's own Manipulation Matrix, graded by the person with the least
incentive to fail it:

1. **Does this materially improve the coach's business?**
2. **Would Sunny use it himself, running a coaching business, not knowing
   he built it?**

If either answer is no, it does not ship.

**Banned by default:** streaks, badges, unread-count anxiety, artificial
scarcity, manufactured urgency, guilt copy ("you haven't shown up in 4
days"), and any counter whose only job is to make stopping feel like loss.

**Why this is stricter here than elsewhere:** the coaching work this
product serves is about undoing compulsive patterns. A slot-machine
mechanic would make the brand a hypocrite in front of the exact audience
most likely to notice.

The positive form: **automate the admin so the coach's attention goes to
the room.** Not "automate the coaching."

---

## 5. Silence is a valid output

If there is nothing worth saying, the assistant says nothing. The Daily
Brief sends no email on a quiet day (`lib/email/daily-brief.ts`,
`hasSomethingToSay`). A quiet week is a quiet inbox.

Pull comes from the thing being worth reading. Never from cadence.

---

## 6. Prompt anatomy

Every agent prompt in this codebase names all five, in this order:

1. **The job** — one sentence, what it is for.
2. **The tools/context** — what it may read. Nothing outside that.
3. **The categories** — the shape of the answer (buckets, fields, schema).
4. **The output** — format, length, voice.
5. **The boundary** — what it must never do. Always present, always last.

The boundary is not optional. A prompt without one is unfinished.

---

## 7. Privacy is architecture, not a policy page

Coaches' connected sources contain their clients' confidential sessions:
grief, marriages, addiction, money. This is the product's licence to
exist, so it is enforced in code, not promised in a footer.

- Per-source consent. Connecting one thing never implies another.
- Client-level exclusion the coach controls.
- Client material is never used to train, generate marketing, or feed
  content tooling. Hard rule, no exception for "anonymised".
- Real export and real delete.
- Ship the privacy contract **with** the first source, never after.
