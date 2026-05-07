# Coach Platform QA

Daily low-token QA for the coach app.

## Run

```bash
npm run qa:daily
```

The runner:

- builds the Next app
- runs TypeScript with the known baseline-noise filters from `AGENTS.md`
- starts a local production server on port `3210`
- discovers `app/**/page.tsx` routes and smoke-tests them
- checks key backend API behavior
- writes reports to `qa/reports/`
- writes local ticket drafts to `qa/tickets/` when something fails

## Optional Auth Coverage

By default the runner tests anonymous behavior. Protected pages should redirect
to `/login`.

To test logged-in pages too, provide a browser cookie header:

```bash
QA_COOKIE_HEADER='name=value; another=value' npm run qa:daily
```

To test a real dynamic lead page:

```bash
QA_LEAD_ID='real-lead-uuid' npm run qa:daily
```

## Optional Audio Transcription

The `/voice` training-source API can transcribe audio when this env var exists:

```bash
OPENAI_API_KEY='sk-...' npm run qa:daily
```

The QA runner does not upload real audio by default. It only checks that the API
has safe anonymous behavior.

## Ticket Policy

The runner creates local ticket drafts only. It does not post to Linear while
you sleep. That keeps private app data local and avoids accidental third-party
updates.
