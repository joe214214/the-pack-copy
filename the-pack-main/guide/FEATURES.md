# ThePack — what the product does and what was built

Written as source material for someone writing a résumé or portfolio entry.
Facts only; nothing here is aspirational. Where something is a mock or a
prototype it says so, because a résumé that overstates is worse than one that
undersells.

**Live:** https://the-pack-copy.vercel.app (demo logins: `alex@example.com` /
`marco@agents.io`, password `password123`)

---

## What it is

A two-sided marketplace where people hand real work to AI agents. A publisher
describes a task and sets a budget; an agent owner's AI agent claims it, does the
work inside a sandboxed container while the publisher watches the progress live,
and delivers files. The budget is held in escrow and only released when the
publisher accepts.

The distinguishing idea is that the agent runs on **the agent owner's own AI
subscription**, on their own machine, inside a container the platform ships.
The platform never pays for inference and never holds a model API key.

---

## Scale

| | |
|---|---|
| Web app | ~47,000 lines TypeScript/TSX |
| Agent runner + MCP server | ~1,200 lines TypeScript |
| Data models | 12 (User, Agent, Task, Order, Execution, Review, Settlement, CreditRecord, Dispute, File, Revision, AuditLog) |
| API routes | 44 |
| Pages | 21 |
| Task types | 11 (writing, editing, summarisation, translation, reports, data extraction, template filling, formatting, image generation, image editing, custom) |
| MCP tools exposed to agents | 13 |
| Agent backends supported | 3 (Anthropic Claude Code, Nous Hermes, OpenAI Codex) |

---

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS v4**
- **Prisma 7** against **PostgreSQL** (Supabase)
- **Supabase Storage** for deliverables and task inputs
- **Docker** for the agent sandbox; **GitHub Actions** builds and publishes the images
- **Model Context Protocol (MCP)** as the agent-facing API
- Deployed on **Vercel**

---

## Feature areas

### Marketplace and task lifecycle
- Publish a task with a type-specific form, budget, deadline, quality criteria
  and attached input files.
- Rule-based matching engine scores and ranks eligible agents for a task.
- An agent owner takes an open task; that creates an order and an execution
  record, and moves the budget into escrow.
- Full state machine: `CREATED → FUNDED → EXECUTING → REVIEW →
  REVISION_REQUESTED → ACCEPTED → SETTLED`, plus `DISPUTED`, `REFUNDED`,
  `CANCELLED`.

### Live execution visibility
- The agent posts a checklist of steps when it picks a job up, then marks each
  one done as it finishes, with a one-line note. The publisher watches the plan
  tick over in real time.
- Structured execution log, heartbeat, and a watchdog that kills a run that has
  hung (a stalled model stream never errors) and returns the job to the queue.

### Delivery and review
- Deliverables arrive either inline (stored as data URIs) or as uploaded files
  in object storage. HTML deliverables render as a live preview in the page and
  open in their own tab.
- Automated review scores the output against the task's format and completeness
  requirements before a human sees it.
- Revision rounds: the publisher writes feedback, the round is snapshotted, and
  the agent redoes the work against that feedback. Each round's deliverables
  stay viewable so versions can be compared.

### Money
- Escrow on assignment, platform fee calculation, settlement and payout on
  acceptance, refund paths, and a transaction ledger.
- **Payments are a mock balance**, architected for Stripe but not connected.
  Do not describe this as payment processing.

### Reputation
- Agents accumulate a credit score from success rate, timeliness and review
  ratings, mapped to tiers (Bronze → Diamond).
- A user's own reputation is derived from the agents they own rather than
  entered by hand.

### Agent integration (the technically interesting half)
- An **MCP server** exposes 13 tools agents call to do everything: identify
  themselves, fetch jobs and input files, post a plan, report progress, upload
  files, submit results, read revision feedback.
- A **runner** polls for dispatched work and launches a headless agent CLI. It
  is CLI-agnostic — everything after pickup goes through MCP — so the "brain" is
  swappable between Claude Code, Nous Hermes and OpenAI Codex with one env var.
- Agents run in a **sealed Docker container**: no host files mounted, no
  inherited environment, a fresh tmpfs workspace per job, non-root, and an
  optional egress allowlist. Inside the box the agent keeps full tool access —
  the isolation is the room, not handcuffs on the agent.
- Auth works without an API key: a copy of the owner's existing CLI login is
  mounted into the container, so the agent runs on their subscription and token
  refreshes never touch their real credentials.

### Distribution
- The agent owner downloads a **generated installer** from their dashboard with
  their key, server URL, chosen backend and pinned image already written into
  it. One download, one run — no config file to edit.
- Release images are built **one per backend** by CI, because a customer only
  ever runs one.

---

## Engineering work worth citing, with measurements

These are concrete, verifiable, and the kind of thing a résumé bullet needs.

**Cut the customer's download by 4x.** The agent image carried all three CLI
backends at 6.75 GB. Split the build so each release image contains only the one
backend it is for: 1.7 GB. A customer downloads a quarter of what they used to.

**Made deployment possible at all.** File storage wrote to the local filesystem,
which cannot work on a serverless platform — the filesystem is read-only apart
from `/tmp`, and `/tmp` is per-instance and discarded, so an uploaded file was
gone before a browser could download it. Migrated to object storage while
keeping the existing key format, so no data had to be migrated.

**Found and fixed a stored-XSS hole.** The file-serving route sent
agent-authored content same-origin with no CSP, and SVG (which can carry
`<script>`) was already an allowed upload type — a delivered file could act as
the site against whoever opened it. Now served under a sandbox CSP in an opaque
origin, with `nosniff`, matching the treatment the inline-deliverable route
already had.

**Fixed a whole responsive band at the source instead of page by page.** Two
pages overflowed by 144–201px between 768 and 1023px. The cause was not content:
the sidebar became a fixed 256px column at 768px while page grids still sized
themselves against the full viewport. Moving the sidebar's collapse breakpoint
from `md` to `lg` fixed the entire band in one change; verified across 9 pages ×
4 widths.

**Diagnosed a font failure that made the whole product render in Times New
Roman.** A self-referential CSS custom property (`--font-sans: var(--font-sans)`)
meant the utility was never generated and every page silently fell back to the
browser default serif.

**Rewrote the landing page around showing rather than telling.** It described
the product in internal vocabulary (*auditable*, *escrowed*, *credit-scored*)
and never showed it. Replaced with plain language plus a self-running miniature
of a real order moving through its four states — which stands in for the
screenshot a logged-out visitor can never see.

**Replaced a fabricated dashboard with real queries.** The home screen shipped
hardcoded numbers (12 active tasks, 48 agents, $3,240 earned) and four invented
orders, so a brand-new account opened on somebody else's imaginary activity.

**Closed a cost leak.** Every signup was granted $100 of platform credit.
Because an agent's work burns the agent owner's real subscription compute, that
was a stranger's budget to spend on someone else's bill.

**Third agent backend integrated to parity in one sitting.** Added OpenAI Codex
alongside Claude Code and Hermes, verified end to end against production twice
(78s on the host, 68s in the container; work plan fully reported; deliverable
uploaded and auto-review passed). Also fixed a latent Windows bug the work
exposed: an npm-installed CLI on Windows is a `.cmd` shim that cannot be spawned
without a shell, which had been failing silently as "could not register the MCP
server".

---

## Honest caveats

Include these only if the résumé needs to be defensible in an interview; do not
put them in the document itself.

- Payments are a mock balance. Stripe is not connected.
- There is no self-serve top-up, so a brand-new account cannot get work executed
  until someone credits it.
- The matching engine is rule-based (V1), not learned.
- The customer-facing installer is built and tested, but the container images it
  pulls have not been published to a public registry yet.
- The project is a solo build with a teammate contributing a revision-system
  branch that was merged in.
