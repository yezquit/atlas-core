<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Runtime and verification

- Use Node.js `>=20.9.0`; install the locked dependencies with `npm ci`.
- Default verification is `npm run lint`, then `npm test`, then `npm run build`.
- Run one test file with `node --test src/core/testing/providerRuntime.test.js`; filter it with `node --test --test-name-pattern='PATTERN' src/core/testing/providerRuntime.test.js`.
- `npm test` hard-codes every `src/core/testing/*.test.js` plus `atlasTrialCases.js`; `npm test -- <file>` does not replace that list.
- Tests do not call API-Football or Gemini, but many assert literal source, copy, CSS, and asset bytes. Run the full suite after UI, route, label, or asset changes.
- `verify:phase2` and `verify:operational` make real API-Football requests and consume quota; run them only explicitly with valid server-side credentials. Inspect per-analysis results and telemetry because top-level success or exit code 0 can coexist with structured analysis failures.
- For `verify:operational`, use a future pre-match date and `--max-fixtures=1`; its checked-in default date is historical and the script analyzes only the first loaded fixture.

## Architecture

- This is one JavaScript/ESM Next.js App Router package. The only product pages are `/` and `/login`; journey, match, LIVE, combinations, memory, history, and bets are client state modes inside `src/app/atlas-functional-client.js`, not URL routes.
- `src/app` owns pages, Route Handlers, client UI, and presentation. `src/core/services` orchestrates use cases, `src/core/infrastructure` owns provider/cache/file adapters, and `src/core/intelligence` contains mostly pure domain logic.
- Route Handlers are the mutation boundary; there are no Server Actions. Keep modules marked `server-only` and code using `node:crypto`, `node:fs/promises`, or local files out of client bundles and Edge runtime.
- Preserve exact fixture identity across date, timezone, authorized competition, season, and fixture ID. Name-based lookup is intentionally disabled; `/api/football/find-fixture` returns 410.

## Data flows

- API-Football is the only external provider and its host is hard-allowlisted. Direct fixture/catalog routes and journey/operational/LIVE analysis intentionally use different cache, budget, and telemetry paths; do not merge them casually.
- Keep pre-match and LIVE pipelines separate. Pre-match rejects started or finished fixtures and post-kickoff resources; LIVE re-fetches fresh snapshots and live odds. Successful LIVE analyses are in-memory for 15 minutes and disappear on restart if not saved.
- Gemini is manual copy/paste only: Atlas generates a prompt and parses pasted text locally. Do not add Gemini API calls or describe pasted evidence as provider-verified.
- Durable records are append-only NDJSON logs under `.atlas-data/v1/`; deletion and archival append events rather than rewriting files. Do not hand-edit or merge ledgers, and copy or back them up only while the server is stopped.
- Provider cache files under `.atlas-cache/v1/` are generated. Treat `.atlas-data/`, `.atlas-cache/`, and every `.env*` except `.env.example` as private local state.
- The runtime assumes one personal installation with a writable persistent filesystem; serverless or horizontally scaled deployment requires replacing persistence and in-memory coordination.
