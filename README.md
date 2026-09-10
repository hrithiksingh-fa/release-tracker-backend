# Release Tracker — Backend

API + scheduled sync + integrations for the release-tracker platform. Pairs with
[release-tracker-frontend](../release-tracker-frontend) (separate repo).

## Data model

```
Client (one Slack channel, one ADO org/project/area path connection)
 └─ Tracker (a sheet)
     └─ Requirement (a row — a client-facing ask/delta)
         ├─ status: DERIVED — Not Started / In Progress / Done
         │    Done only once every linked work item reaches a terminal ADO state
         ├─ LinkedWorkItem[] (1..N Azure DevOps work items)
         └─ ReleaseNote[] (draft → approved → sent, versioned)
```

See `prisma/schema.prisma` for the full schema.

## Pipeline

- **EOD sync** (`src/jobs/eodSync.ts`, cron via `EOD_SYNC_CRON`): pulls current
  state for every linked ADO work item, recomputes each requirement's derived
  status, and generates a **draft** release note for any requirement that just
  became fully Done (`src/services/syncService.ts`).
- **Release note generation** (`src/lib/releaseNotes/`): ported from the
  `ado-release-notes-toolkit` Python scripts — section-splitting, screen/category
  classification, duplicate detection — merged across all of a requirement's
  linked work items into one note, then run through an LLM rewrite pass
  (`src/lib/releaseNotes/rewrite.ts`, Claude via `ANTHROPIC_API_KEY`; falls back
  to the raw merged text if unset, so the pipeline still runs without it).
- **Review → send**: nothing reaches Slack automatically. A generated note sits
  in `DRAFT` until approved (`POST /release-notes/:id/approve`) and sent
  (`POST /release-notes/:id/send`), which posts to the client's Slack channel
  via `src/integrations/slack/client.ts`.
- **Push integration**: creating a linked work item without an `adoId` creates a
  new PBI in Azure DevOps immediately (`POST /requirements/:id/linked-work-items`,
  see `src/routes/requirements.ts`) — this direction is not batched.

## Setup

Prerequisites: Node 20+, Docker (for local Postgres) or a Postgres instance you
already have.

```bash
cp .env.example .env
# generate CREDENTIALS_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# fill in .env: DATABASE_URL, CREDENTIALS_ENCRYPTION_KEY, ADMIN_API_TOKEN,
# and (optional for now) ANTHROPIC_API_KEY / SLACK_BOT_TOKEN

docker compose up -d        # starts local Postgres
npm install
npx prisma migrate dev      # creates the schema
npm run dev                 # http://localhost:4000
```

Trigger a sync manually without waiting for the cron schedule:

```bash
npm run sync:run
```

## Auth

Single admin user for now: every route except `/health` requires
`Authorization: Bearer <ADMIN_API_TOKEN>` (see `src/middleware/auth.ts`). This
is the one place to swap in real per-user auth when multi-user support lands —
every route already goes through this one middleware.

## Secrets

ADO PATs are encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`), keyed by
`CREDENTIALS_ENCRYPTION_KEY`. Slack uses a single bot token from env
(`SLACK_BOT_TOKEN`), not per-client — the client-level config is just which
channel to post into.

## What's stubbed / needs your input to fully exercise

- **Docker isn't installed** on the machine this was scaffolded on, so the
  Postgres container and `prisma migrate dev` haven't been run here — install
  Docker Desktop (or Colima) and follow Setup above.
- **ANTHROPIC_API_KEY / SLACK_BOT_TOKEN** are unset — the pipeline runs without
  them (release notes just skip the plain-language rewrite; sending fails with
  a clear error until a token is set).
- **ADO service hooks** (real-time push from Azure DevOps) aren't wired up —
  v1 relies on the EOD poll, matching what you asked for.
