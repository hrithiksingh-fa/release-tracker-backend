# Release Tracker — Backend

API + scheduled sync + integrations for the release-tracker platform. Pairs with
[release-tracker-frontend](../release-tracker-frontend) (separate repo).

## Data model

```
Client (one Slack channel, one ADO org/project/area path connection,
        description/productOwner/deliveryDate, Module[] multi-select)
 └─ Phase (a client's lifecycle stage, e.g. Onboarding / Scaling 1 — has its
    │      own description + deliveryDate)
    └─ Requirement (a row — a client-facing ask/delta)
        ├─ priority: LOW / MEDIUM / HIGH / URGENT
        ├─ dueDate (original commitment) + revisedDueDate (renegotiated)
        ├─ LinkedWorkItem[] (1..N PBIs -- Product Backlog Items, via Azure DevOps)
        ├─ FigmaReference[] (design links)
        └─ ReleaseNote[] (draft → approved → sent, versioned)

Stage / Workflow / WorkflowStage: a shared Stage master list, and three kinds
of Workflow (scope=CLIENT: one global; scope=PHASE and scope=REQUIREMENT:
one per client, cloned from a template or another client's). Client,
Phase, and Requirement each carry a stageId into their respective workflow.
Stage moves are always manual (see syncService.ts) -- moving a Requirement
into a stage flagged isDoneStage is what triggers release-note generation.

Module: a reusable "what this client uses" tag, managed from the admin panel.

AuditLog: generic field-level change log -- every edit to Client/Phase/
Requirement (and every stage move, and every ADO-state change picked up by
sync) writes rows here. Query via GET /audit-logs?entityType=&entityId=.
```

See `prisma/schema.prisma` for the full schema.

## Pipeline

- **EOD sync** (`src/jobs/eodSync.ts`, cron via `EOD_SYNC_CRON`): refreshes
  cached state for every linked PBI and logs an audit entry for anything that
  changed (`src/services/syncService.ts`). It never moves anything's stage.
- **Release note generation** (`src/lib/releaseNotes/`): ported from the
  `ado-release-notes-toolkit` Python scripts — section-splitting, screen/category
  classification, duplicate detection — merged across all of a requirement's
  linked PBIs into one note, then run through an LLM rewrite pass
  (`src/lib/releaseNotes/rewrite.ts`, Claude via `ANTHROPIC_API_KEY`; falls back
  to the raw merged text if unset, so the pipeline still runs without it).
  Triggered by moving a Requirement into a stage flagged `isDoneStage`
  (`PATCH /requirements/:id/stage`) — fully manual, never by sync.
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
npx prisma db push          # syncs the schema (schema is iterating fast right
                             # now -- switch to `prisma migrate dev` for a real
                             # migration history once it stabilizes)
npm run prisma:seed         # seeds the Stage master + the three template workflows
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

- **ANTHROPIC_API_KEY / SLACK_BOT_TOKEN** are unset — the pipeline runs without
  them (release notes just skip the plain-language rewrite; sending fails with
  a clear error until a token is set).
- **ADO service hooks** (real-time push from Azure DevOps) aren't wired up —
  v1 relies on the EOD poll, matching what you asked for.
- **No migration history right now** — schema is managed via `prisma db push`
  while it's still moving fast; generate a real `prisma migrate dev` history
  before any non-local deployment.
