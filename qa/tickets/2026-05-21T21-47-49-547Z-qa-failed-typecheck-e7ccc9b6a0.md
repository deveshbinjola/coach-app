# QA failed: typecheck

Severity: high
Area: typecheck

## Evidence
lib/__tests__/factories.ts(29,3): error TS2322: Type '{ id: string; coach_id: string; full_name: string; email: string | null; phone: string | null; source: LeadSource; source_detail: string | null; source_url?: string | ... 1 more ... | undefined; ... 19 more ...; updated_at: string; }' is not assignable to type 'Lead'.
  Types of property 'source_url' are incompatible.
    Type 'string | null | undefined' is not assignable to type 'string | null'.
      Type 'undefined' is not assignable to type 'string | null'.

## Reproduction
Run npm run qa:daily from /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app.

## Next Action
Fix the failing check and rerun npm run qa:daily.

## Ticket Status
Draft only. Review before copying into Linear or another tracker.
