# Self-Healing Coach-App — Nightly Runbook (P1)

This is the exact procedure the scheduled agent follows every night. It drains
the open bug queue, proposes one fix per bug as a pull request, and writes the
proposal back to the report. **It never merges.** Sunny is the gate.

Vision + phases: `deliverables/self-healing-coach-app/self-healing-coach-app-vision.html`
(in the Jarvis `elevate-ai-project` workspace).

---

## Preconditions (must be true in the run environment)

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
- The repo is checked out and `gh` is authenticated for `deveshbinjola/coach-app`.
- `git` user is configured. Working tree is clean before starting.
- Node deps installed (`npm ci` if needed) so tests can run.

If any precondition fails, stop and report it. Do not partially proceed.

---

## The loop

1. **Pull the queue.** Run:
   ```
   node scripts/bug-triage-fetch.mjs --limit 5
   ```
   This returns the oldest open reports as JSON. If `count` is 0, finish and
   report "queue empty — nothing to do."

2. **For each report, one at a time** (never batch fixes into one branch):

   a. **Sync.** `git checkout main && git pull`. Start clean.

   b. **Diagnose.** Read the report (`title`, `description`, `page_url`,
      `console_error`). Find the real root cause in the codebase. If server logs
      are available, read them. Reproduce mentally or with a test. Do not guess.

   c. **Decide.** Pick one:
      - **Fixable** → continue to (d).
      - **Not a bug / cannot reproduce** → set status `wont_fix` with notes, skip.
      - **Same as another report** → set status `duplicate` with notes, skip.

   d. **Branch.** `git checkout -b fix/bug-<short-id>` (use the first 8 chars of
      the report id). One bug per branch. Always.

   e. **Fix at the right altitude.** Fix the root cause, not the symptom.
      **Boneheaded-hack rule:** never disable, delete, comment out, or stub a
      feature to make an error go away. If the only way you can see to "fix" it
      removes functionality, do NOT do it — set status `triaged`, write notes
      explaining why it needs a human, and skip.

   f. **Test gate.** Run `npm run test` and `npx tsc --noEmit`. If either fails,
      do not open a PR. Either fix until green, or abandon the branch
      (`git checkout main && git branch -D fix/bug-<short-id>`) and set the
      report to `triaged` with notes. A red branch never becomes a PR.

   g. **Open the PR.** Push the branch and:
      ```
      gh pr create --base main --head fix/bug-<short-id> \
        --title "fix: <short title> (bug <short-id>)" \
        --body "<body, see template below>"
      ```

   h. **Write back.** Record the proposal on the report:
      ```
      node scripts/bug-triage-update.mjs --id <id> --status in_progress \
        --branch fix/bug-<short-id> --pr <pr-url> \
        --notes "Root cause: ... | Fix: ..."
      ```

3. **Stop conditions.** Process at most 5 reports per run. Stop early if you hit
   3 consecutive reports that need a human (`triaged`). Better to surface a
   pattern than to grind.

---

## PR body template

```
## Bug
<report title>  (id: <id>, severity: <severity>, reported from <page_url>)

## Root cause
<one paragraph — the real cause, not the symptom>

## Fix
<what changed and why this is the right altitude>

## Risk / scope
- Files touched: <list>
- [ ] Touches auth, billing, secrets, or DB migrations?  (if yes, flag loudly)
- [ ] Removes or disables any feature?  (must be NO — see boneheaded-hack rule)

## Verification
- npm run test: <pass>
- tsc --noEmit: <pass>
- <any manual reasoning about the repro>

🤖 Proposed by the nightly self-healing agent. Human review + merge required.
```

---

## Hard guardrails (non-negotiable)

- **Never merge.** Open PRs only. Sunny merges.
- **One bug, one branch, one PR.** Atomic and reviewable.
- **Tests must pass before any PR.**
- **No boneheaded hacks.** Removing a feature is never a fix.
- **Scope fence.** Do not touch auth, billing, secrets, or DB migrations without
  flagging it in the PR body and setting status `triaged` for human attention.
- **Status discipline.** The agent may set `triaged`, `in_progress`, `wont_fix`,
  `duplicate`. Only a human merge sets `fixed`.

---

## End-of-run digest (what the completion notification should contain)

- Reports processed: N
- PRs opened: list of `<short-id> — title — pr-url`
- Needs a human (`triaged`): list with one-line reason
- Skipped (`wont_fix` / `duplicate`): list with reason
- Queue remaining: count still `open`
