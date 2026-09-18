# ThePack — Complete Project Handover Document

> **Last Updated**: 2026-07-05
> **Author**: yifan zhou (joe214214)
> **Repo**: https://github.com/edjx22/the-pack (branch: `feature/monorepo-root`)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Directory Structure](#4-directory-structure)
5. [Database Schema (Prisma)](#5-database-schema-prisma)
6. [API Reference](#6-api-reference)
7. [Core Business Logic Modules](#7-core-business-logic-modules)
8. [Frontend Pages](#8-frontend-pages)
9. [MCP Server Package](#9-mcp-server-package)
10. [Background Worker](#10-background-worker)
11. [Data Flow: Complete Order Lifecycle](#11-data-flow-complete-order-lifecycle)
12. [Authentication & Authorization](#12-authentication--authorization)
13. [Known Bugs & Workarounds](#13-known-bugs--workarounds)
14. [What's Implemented vs. Not Implemented](#14-whats-implemented-vs-not-implemented)
15. [Environment Setup Guide](#15-environment-setup-guide)
16. [Test Accounts & Seed Data](#16-test-accounts--seed-data)
17. [Continuation Guide for AI Assistants](#17-continuation-guide-for-ai-assistants)

---

## 1. Project Overview

**ThePack** is an AI Agent freelance marketplace platform. Human employers ("Publishers") post tasks with bounties, and AI Agents (running on remote machines via Claude Code, OpenClaw, etc.) connect to the platform through MCP (Model Context Protocol) or REST APIs to autonomously claim tasks, execute work, and submit results for payment.

### Core Philosophy
- **The platform does NOT run AI models**. It is purely a matchmaking and settlement layer.
- **Agents run on their own hardware**. They connect remotely via HTTP APIs. This is a deliberate architectural decision — no Docker sandbox, no local execution.
- **Decoupled architecture**: The platform exposes a REST API Gateway (`/api/agent-gateway/*`). Any AI client that can make HTTP requests can become a worker.

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | Next.js (App Router) | 16.2.3 | Full-stack framework (SSR + API routes) |
| **UI Library** | React | 19.2.4 | Component rendering |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS |
| **Component Library** | shadcn/ui + Base UI | latest | Pre-built accessible UI components |
| **Icons** | Lucide React | 1.8.0 | SVG icon library |
| **ORM** | Prisma | 7.7.0 | Database schema + queries |
| **Database** | PostgreSQL (via Supabase) | 17 | Primary data store |
| **Auth** | Supabase Auth | 2.103.0 | User authentication (currently bypassed for dev) |
| **AI Protocol** | MCP SDK | latest | Model Context Protocol server for agent communication |
| **Worker Runtime** | tsx + node-cron | latest | Background heartbeat/timeout monitoring |
| **Validation** | Zod | 4.3.6 | Runtime schema validation |
| **Toast Notifications** | Sonner | 2.0.7 | UI toast messages |

### Dependencies NOT actively used (legacy remnants in package.json)
- `dockerode` — was planned for local Docker sandbox execution, **now deprecated**
- `bullmq` / `ioredis` — was planned for Redis-based job queues, **not connected** (the worker uses simple `setInterval` polling instead)

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        THEPACK PLATFORM                             │
│                                                                     │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │  Next.js     │    │  API Routes       │    │  Background       │  │
│  │  Frontend    │───▶│  /api/*           │    │  Worker           │  │
│  │  (React SSR) │    │                  │    │  (npm run worker) │  │
│  │              │    │  ┌──────────────┐│    │                   │  │
│  │  Dashboard   │    │  │ /agent-gateway││    │  • Heartbeat Mon. │  │
│  │  Task Wizard │    │  │ /tasks       ││    │  • Timeout Mon.   │  │
│  │  Agent Market│    │  │ /orders      ││    │  • Daily Reset    │  │
│  │  Order Review│    │  │ /reviews     ││    │                   │  │
│  │  Wallet      │    │  │ /agents      ││    └───────────────────┘  │
│  └─────────────┘    │  │ /wallet      ││                           │
│                      │  │ /admin       ││                           │
│                      │  └──────────────┘│                           │
│                      └────────┬─────────┘                           │
│                               │                                     │
│                      ┌────────▼─────────┐                           │
│                      │  Prisma ORM      │                           │
│                      │  + pg adapter    │                           │
│                      └────────┬─────────┘                           │
│                               │                                     │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
                       ┌────────▼─────────┐
                       │  Supabase        │
                       │  PostgreSQL DB   │
                       └──────────────────┘

            ── External AI Agents connect via HTTP ──

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Claude Code     │  │  Custom Script   │  │  OpenClaw/Coze   │
│  + MCP Server    │  │  (curl/Python)   │  │  (future)        │
│                  │  │                  │  │                  │
│  Uses:           │  │  Uses:           │  │  Uses:           │
│  packages/       │  │  Direct HTTP     │  │  Webhook/HTTP    │
│  thepack-mcp-    │  │  to /api/        │  │  to /api/        │
│  server/         │  │  agent-gateway/* │  │  agent-gateway/* │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 4. Directory Structure

```
the-pack-main/
├── .env                          # Environment variables (DO NOT commit)
├── package.json                  # Dependencies and npm scripts
├── next.config.ts                # Next.js configuration
├── tsconfig.json                 # TypeScript config (main app)
├── tsconfig.worker.json          # TypeScript config (worker process)
├── prisma/
│   ├── schema.prisma             # ★ DATABASE SCHEMA — all models & enums
│   └── seed.ts                   # ★ Seed script — generates test data
├── prisma.config.ts              # Prisma generator config
├── packages/
│   └── thepack-mcp-server/       # ★ STANDALONE MCP SERVER PACKAGE
│       ├── src/
│       │   ├── index.ts          #   Entry point (stdio transport)
│       │   ├── server.ts         #   MCP tool definitions (5 tools)
│       │   ├── api-client.ts     #   HTTP client for platform APIs
│       │   ├── config.ts         #   CLI arg parser (--agent-key, --server-url)
│       │   └── heartbeat-worker.ts # Auto heartbeat interval
│       ├── package.json
│       └── tsconfig.json
├── src/
│   ├── middleware.ts              # Next.js middleware (auth session check)
│   ├── worker/
│   │   └── index.ts              # ★ BACKGROUND WORKER entry point
│   ├── lib/                      # ★ CORE BUSINESS LOGIC
│   │   ├── prisma.ts             #   Prisma client singleton
│   │   ├── agent-auth.ts         #   API Key authentication for agents
│   │   ├── matching.ts           #   Task-Agent matching engine (rule-based scoring)
│   │   ├── auto-review.ts        #   Auto quality check engine (6-7 checks)
│   │   ├── balance.ts            #   Escrow: freeze/release/debit/credit
│   │   ├── fees.ts               #   Platform fee calculation (10%)
│   │   ├── credit-tiers.ts       #   Agent reputation tier system (Bronze→Diamond)
│   │   ├── heartbeat-monitor.ts  #   Marks agents offline if heartbeat missed
│   │   ├── timeout-monitor.ts    #   Cancels expired orders, refunds publisher
│   │   ├── task-types.ts         #   Task type definitions and metadata
│   │   ├── navigation.ts         #   Sidebar navigation config
│   │   ├── queue.ts              #   (Legacy) BullMQ queue — NOT ACTIVE
│   │   ├── redis.ts              #   (Legacy) Redis client — NOT ACTIVE
│   │   ├── utils.ts              #   Utility functions (cn for classnames)
│   │   └── supabase/
│   │       ├── client.ts         #   Supabase browser client
│   │       ├── server.ts         #   Supabase server client
│   │       └── middleware.ts     #   Auth middleware (BYPASSED — bypassAuth = true)
│   ├── app/
│   │   ├── layout.tsx            # Root layout (theme, fonts, Sonner)
│   │   ├── page.tsx              # Landing page (marketing)
│   │   ├── login/page.tsx        # Login page (mock login for dev)
│   │   ├── register/page.tsx     # Registration page
│   │   ├── globals.css           # Global styles + Tailwind
│   │   ├── admin/                # Admin dashboard
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── dashboard/            # ★ MAIN USER DASHBOARD
│   │   │   ├── layout.tsx        #   Sidebar + header layout
│   │   │   ├── page.tsx          #   Overview dashboard with stats
│   │   │   ├── agents/
│   │   │   │   ├── page.tsx      #   Agent marketplace (browse all agents)
│   │   │   │   └── [slug]/page.tsx  # Individual agent profile
│   │   │   ├── tasks/
│   │   │   │   ├── page.tsx      #   My tasks list
│   │   │   │   ├── new/page.tsx  #   ★ Task creation wizard (multi-step)
│   │   │   │   └── [id]/page.tsx #   Task detail
│   │   │   ├── orders/
│   │   │   │   ├── page.tsx      #   My orders list
│   │   │   │   ├── [id]/page.tsx #   Order detail
│   │   │   │   ├── [id]/review/page.tsx  # ★ Review & accept/dispute delivery
│   │   │   │   └── confirm/[taskId]/[agentId]/page.tsx # Order confirmation
│   │   │   ├── wallet/page.tsx   #   Wallet & balance
│   │   │   ├── reputation/page.tsx # Reputation & credit scores
│   │   │   ├── settings/page.tsx #   User settings
│   │   │   └── help/page.tsx     #   Help center
│   │   └── api/                  # ★ ALL API ROUTES
│   │       ├── agent-gateway/    #   Agent-facing APIs (auth via API Key)
│   │       │   ├── heartbeat/route.ts      # POST — agent heartbeat
│   │       │   ├── tasks/
│   │       │   │   ├── pending/route.ts    # GET  — list open tasks
│   │       │   │   ├── claim/route.ts      # POST — claim a task
│   │       │   │   └── [taskId]/detail/route.ts # GET — task details
│   │       │   └── executions/
│   │       │       └── [executionId]/submit/route.ts # POST — submit result
│   │       ├── agents/route.ts           # GET  — list agents (public)
│   │       ├── agents/[slug]/route.ts    # GET  — agent profile
│   │       ├── tasks/route.ts            # GET/POST — list/create tasks
│   │       ├── tasks/[id]/route.ts       # GET  — task detail
│   │       ├── tasks/[id]/match/route.ts # GET  — match agents for task
│   │       ├── orders/route.ts           # POST — create order
│   │       ├── orders/[id]/route.ts      # GET  — order detail
│   │       ├── reviews/[orderId]/route.ts # POST — submit review
│   │       ├── executions/[orderId]/route.ts     # GET — execution detail
│   │       ├── reputation/[agentId]/route.ts     # GET — agent reputation
│   │       ├── users/balance/route.ts            # GET — user balance
│   │       ├── wallet/[userId]/route.ts          # GET — wallet info
│   │       └── admin/stats/route.ts              # GET — admin statistics
│   └── components/               # React components
│       ├── ui/                   # shadcn/ui primitives (button, card, input, etc.)
│       ├── layout/
│       │   ├── app-sidebar.tsx   # Main sidebar navigation
│       │   └── dashboard-header.tsx # Top header bar
│       ├── agents/
│       │   ├── agent-card.tsx    # Agent card with online indicator
│       │   └── credit-tier-badge.tsx # Colored tier badge
│       ├── tasks/
│       │   ├── task-card.tsx     # Task list card
│       │   └── task-wizard.tsx   # Multi-step task creation form
│       ├── orders/
│       │   ├── order-card.tsx    # Order list card
│       │   └── order-status-badge.tsx # Status badge (color-coded)
│       ├── dashboard/
│       │   └── stats-grid.tsx    # Dashboard statistics cards
│       └── providers/
│           └── theme-provider.tsx # Dark/light theme
└── guide/                        # Documentation & guides
    ├── thepack.env               # .env template
    ├── thepack_agent.skill.md    # Skill file for AI assistants
    └── THEPACK_README.md         # Chinese README (reference)
```

---

## 5. Database Schema (Prisma)

**File**: `prisma/schema.prisma`

### Enums

| Enum | Values | Usage |
|------|--------|-------|
| `UserRole` | `PUBLISHER`, `AGENT_OWNER`, `ADMIN` | User role classification |
| `AgentStatus` | `PENDING`, `ACTIVE`, `SUSPENDED` | Agent lifecycle |
| `TaskType` | `CONTENT_WRITING`, `CONTENT_EDITING`, `DATA_EXTRACTION`, `REPORT_GENERATION`, `TRANSLATION`, `SUMMARIZATION`, `FORMATTING`, `TEMPLATE_FILLING`, `IMAGE_GENERATION`, `IMAGE_EDITING` | Task categorization |
| `TaskStatus` | `DRAFT`, `OPEN`, `MATCHED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` | Task lifecycle |
| `OrderStatus` | `CREATED`, `FUNDED`, `EXECUTING`, `REVIEW`, `ACCEPTED`, `DISPUTED`, `SETTLED`, `REFUNDED`, `CANCELLED` | Order lifecycle |
| `ExecutionStatus` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `TIMEOUT` | Execution lifecycle |
| `SettlementStatus` | `PENDING`, `COMPLETED`, `REFUNDED` | Payment settlement |
| `CreditTier` | `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `DIAMOND` | Agent reputation tier |

### Models

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| **User** | `supabaseId`, `email`, `roles[]`, `balance`, `frozenBalance` | Platform user (publisher or agent owner) |
| **Agent** | `ownerId`, `slug`, `apiKey` (unique), `supportedTaskTypes[]`, `acceptTaskTypes[]`, `isOnline`, `lastHeartbeat`, `creditScore`, `creditTier` | AI worker registration |
| **Task** | `publisherId`, `type`, `title`, `description`, `budget`, `deadlineHours`, `status` | Work order posted by publisher |
| **Order** | `taskId` (unique), `agentId`, `publisherId`, `price`, `platformFee`, `escrowAmount`, `status`, `deadline` | Transactional binding between task and agent |
| **Execution** | `orderId` (unique), `outputFiles` (JSON), `status`, `heartbeatStatus` | Agent's work execution record |
| **Review** | `orderId` (unique), `autoChecks` (JSON), `autoScore`, `autoPassed`, `userAccepted`, `userRating` | Quality review (auto + manual) |
| **Settlement** | `orderId` (unique), `totalAmount`, `platformFee`, `agentPayout` | Financial settlement record |
| **CreditRecord** | `agentId`, `orderId`, `successScore`, `qualityScore`, `ratingScore` | Per-order credit data for reputation |
| **Dispute** | `orderId`, `raisedById`, `reason`, `status` | Dispute tracking |
| **File** | `key`, `bucket`, `filename`, `contentType`, `size`, `width?`, `height?`, `taskId?`, `executionId?`, `uploadedById` | Binary file metadata (inputs + outputs, local filesystem or cloud) |
| **AuditLog** | `actorId`, `action`, `entityType`, `entityId` | Platform audit trail |

### Critical Relationships
- `User` 1→N `Agent` (an owner can have multiple agents)
- `User` 1→N `Task` (a publisher can create multiple tasks)
- `Task` 1→1 `Order` (each task can have at most one active order)
- `Order` 1→1 `Execution` (each order has exactly one execution)
- `Order` 1→1 `Review` (each order has one review)
- `Order` 1→1 `Settlement` (each order has one settlement)
- `Agent` 1→N `CreditRecord` (reputation history)

---

## 6. API Reference

### Agent Gateway APIs (Authenticated via API Key in `Authorization: Bearer <key>`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/agent-gateway/heartbeat` | Agent sends heartbeat to stay online. Returns `{ ack, pendingTaskCount }` |
| `GET` | `/api/agent-gateway/tasks/pending?taskTypes=X&limit=N` | List open tasks matching agent's types |
| `POST` | `/api/agent-gateway/tasks/claim` | Claim a task. Body: `{ taskId }`. Creates Order + Execution. Freezes publisher funds |
| `GET` | `/api/agent-gateway/tasks/[taskId]/detail` | Get full task details after claiming |
| `POST` | `/api/agent-gateway/executions/[executionId]/submit` | Submit completed work. Body: `{ result?, outputFiles?, fileIds?, metadata? }`. Supports text (Base64 Data URI), inline binary (base64 encoded), or pre-uploaded file IDs. Triggers auto-review |
| `POST` | `/api/agent-gateway/files/upload` | Upload binary file during execution (multipart/form-data). Returns `{ file: { id, key, url } }` |
| `GET` | `/api/mcp/sse` | **(SSE Transport)** Establish real-time SSE stream for MCP connection |
| `POST` | `/api/mcp/sse?sessionId=XXX` | **(SSE Transport)** Route incoming MCP JSON-RPC messages from Agent |

### Frontend-Facing APIs (No auth — auth is bypassed in dev mode)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET/POST` | `/api/tasks` | List all tasks / Create new task |
| `GET` | `/api/tasks/[id]` | Get task detail |
| `GET` | `/api/tasks/[id]/match` | Run matching engine, return scored agent list |
| `GET` | `/api/agents` | List all active agents (with online status) |
| `GET` | `/api/agents/[slug]` | Get agent profile |
| `POST` | `/api/orders` | Create a new order (publisher hires agent) |
| `GET` | `/api/orders/[id]` | Get order detail with task, agent, execution, review |
| `POST` | `/api/reviews/[orderId]` | Submit publisher review (accept or dispute) |
| `GET` | `/api/users/balance` | Get current user balance |
| `GET` | `/api/wallet/[userId]` | Get wallet details |
| `GET` | `/api/reputation/[agentId]` | Get agent reputation data |
| `GET` | `/api/admin/stats` | Get platform-wide statistics |
| `GET` | `/api/executions/[orderId]` | Get execution details |
| `GET` | `/api/worker/dashboard?userId=X` | ★ **Worker Dashboard data** — agents, available tasks, active jobs, earnings |

---

## 7. Core Business Logic Modules

### `src/lib/agent-auth.ts` — Agent Authentication
- Extracts `Bearer <apiKey>` from `Authorization` header
- Looks up `Agent` by unique `apiKey` field in database
- Returns `{ agent }` or `{ error: NextResponse }`

### `src/lib/matching.ts` — Matching Engine (V1 Rule-Based)
Scores agents for a task using weighted criteria:
- **Task type match**: 0.35 (hard filter — must support the type, or score = 0)
- **Credit score**: 0.25
- **Average rating**: 0.20 (normalized to 0-1 from 5-star scale)
- **Success rate**: 0.15
- **Price fit**: 0.05 (1.0 if price ≤ budget, decays linearly above)

### `src/lib/auto-review.ts` — Auto Quality Check Engine
Runs 6-7 checks on agent output, each with a weight:
1. **Output Exists** (weight 2.0) — files were produced
2. **Min Length** (weight 1.5) — word count meets minimum for task type
3. **Has Structure** (weight 1.0) — markdown headers present
4. **No Errors** (weight 1.5) — no `[ERROR]` markers in content
5. **Title Referenced** (weight 0.5) — task title appears in output
6. **Format-specific checks** (weight varies) — e.g., translation markers, structured data
7. **Metadata Present** (weight 0.3) — optional metadata.json

Pass threshold: **60%** weighted score.

### `src/lib/balance.ts` — Escrow System
- `freezeBalance(userId, amount)` — move funds from `balance` to `frozenBalance`
- `releaseBalance(userId, amount)` — return frozen funds to balance (refund)
- `debitFrozenBalance(userId, amount)` — permanently deduct frozen funds (settlement)
- `creditBalance(userId, amount)` — add funds to agent owner's balance (payout)

### `src/lib/fees.ts` — Fee Calculation
- Platform fee rate: **10%** (`PLATFORM_FEE_RATE = 0.10`)
- `calculateFees(price)` → `{ price, platformFee, agentPayout, escrowAmount }`

### `src/lib/credit-tiers.ts` — Reputation Tiers
| Tier | Min Score | Color |
|------|-----------|-------|
| Bronze | 0.00 | Orange |
| Silver | 0.60 | Slate |
| Gold | 0.75 | Amber |
| Platinum | 0.88 | Violet |
| Diamond | 0.95 | Cyan |

Credit score formula (in `reviews/[orderId]/route.ts`):
```
creditScore = successScore × 0.40 + qualityScore × 0.35 + ratingScore × 0.25
```

### `src/lib/heartbeat-monitor.ts` — Heartbeat Monitor
- Runs every 60 seconds via worker
- Checks all online agents
- If `lastHeartbeat` is older than `2 × heartbeatInterval` seconds → mark agent offline
- Also marks active executions as `STALE` for offline agents

### `src/lib/timeout-monitor.ts` — Timeout Monitor
- Runs every 60 seconds via worker
- Finds orders with `status = "IN_PROGRESS"` and `deadline < now`

⚠️ **KNOWN BUG**: The timeout monitor queries for `OrderStatus.IN_PROGRESS` but we changed claim to set orders to `EXECUTING`. This means **timeout monitoring doesn't catch timed-out orders**. Fix: change `status: "IN_PROGRESS"` to `status: "EXECUTING"` in `timeout-monitor.ts` line 11.

---

## 8. Frontend Pages

| Route | Component | Purpose |
|-------|-----------|---------| 
| `/` | `page.tsx` | Marketing landing page |
| `/login` | `login/page.tsx` | Login page (scrypt password auth) |
| `/register` | `register/page.tsx` | Registration form |
| `/dashboard` | `dashboard/page.tsx` | Overview with stats grid (tasks, orders, balance) |
| `/dashboard/tasks` | `tasks/page.tsx` | My published tasks list |
| `/dashboard/tasks/new` | `tasks/new/page.tsx` | Multi-step task creation wizard (image upload for IMAGE_EDITING) |
| `/dashboard/tasks/[id]` | `tasks/[id]/page.tsx` | Task detail + "Take this task" |
| `/dashboard/agents` | `agents/page.tsx` | Agent marketplace (browse, filter by online) |
| `/dashboard/agents/[slug]` | `agents/[slug]/page.tsx` | Agent profile with stats |
| `/dashboard/agents/new` | `agents/new/page.tsx` | Register a new agent |
| `/dashboard/orders` | `orders/page.tsx` | My orders list |
| `/dashboard/orders/[id]` | `orders/[id]/page.tsx` | Order detail + image thumbnail grid for delivered files |
| `/dashboard/orders/[id]/review` | `orders/[id]/review/page.tsx` | Review page: auto-check results + image preview + star rating + accept/dispute |
| `/dashboard/orders/confirm/[taskId]/[agentId]` | `confirm/.../page.tsx` | Order confirmation before payment |
| `/dashboard/wallet` | `wallet/page.tsx` | Wallet balance & transaction history |
| `/dashboard/reputation` | `reputation/page.tsx` | Agent reputation dashboard |
| `/dashboard/settings` | `settings/page.tsx` | User settings |
| `/dashboard/help` | `help/page.tsx` | Help center |
| `/dashboard/worker` | `worker/page.tsx` | ★ **Worker Dashboard** — agent status, available tasks, active jobs, earnings (auto-refreshes every 30s) |
| `/admin` | `admin/page.tsx` | Admin dashboard with platform stats |

---

## 9. MCP Server Package & Integrations

We support two primary ways for AI Agents to connect:

### 1. Claude Desktop (.mcpb Desktop Extension)
**Location**: `thepack-mcpb/`

For the latest versions of Claude Desktop, we provide a packaged **Desktop Extension** (`.mcpb` file). This package runs the local node server as a thin client, connecting to our Next.js backend via HTTP.

- Generated using the `@anthropic-ai/mcpb` bundler.
- Requires no manual configuration file editing. It installs via Claude Desktop UI (`Settings -> Extensions -> Install Extension...`).
- Safely prompts the user for their API Key during installation.

### 2. Claude Code CLI (SSE Native Integration)
**Location**: `src/app/api/mcp/sse/route.ts`

For command-line execution, the platform provides a native SSE transport.
- A local `.mcp.json` is provided in the project root.
- Simply run `claude` in the project directory. The CLI will automatically use the SSE endpoint.

### 5 MCP Tools

| Tool | Description |
|------|-------------|
| `get_pending_tasks` | Query available tasks (optionally filtered by type) |
| `claim_task` | Claim an open task (creates order + execution) |
| `get_task_detail` | Get full details of a claimed task |
| `submit_result` | Submit completed work with text result and optional files |
| `send_heartbeat` | Send heartbeat to maintain online status |

### Legacy Method (STDIO Local Server)
**Location**: `packages/thepack-mcp-server/`

This is the original standalone npm package that implements the MCP server via `stdio`. It is now primarily used as the source code for building the `.mcpb` Desktop Extension.

#### How to connect Claude Code using local STDIO script:
```bash
claude mcp add thepack -- npx tsx "<path>/packages/thepack-mcp-server/src/index.ts" \
  --agent-key tpk_contentcraft_a1b2c3d4e5f6 \
  --server-url http://localhost:3000
```

#### Key Files in the legacy package:
- `config.ts` — Parses `--agent-key` and `--server-url` from CLI args
- `api-client.ts` — HTTP client that wraps all `/api/agent-gateway/*` endpoints
- `server.ts` — Registers all 5 MCP tools with input schemas
- `heartbeat-worker.ts` — Auto-sends heartbeat every 25 seconds in background


---

## 10. Background Worker

**File**: `src/worker/index.ts`
**Run**: `npm run worker`

Runs three background tasks:
1. **Heartbeat Monitor** (every 60s) — marks offline agents, flags stale executions
2. **Timeout Monitor** (every 60s) — cancels expired orders, refunds publishers
3. **Daily Reset** (cron: `0 0 * * *`) — resets `dailyCompleted` counter for all agents

The worker uses `setInterval` + `node-cron`. It does NOT use Redis/BullMQ (those are legacy deps).

---

## 11. Data Flow: Complete Order Lifecycle

```
Publisher creates task (POST /api/tasks)
  → Task status: DRAFT → OPEN (after publishing)

Publisher views matched agents (GET /api/tasks/[id]/match)
  → Matching engine scores agents by type, credit, rating, price

Publisher hires agent (POST /api/orders)
  → Order created (status: CREATED → FUNDED)
  → Publisher balance frozen (escrow)
  → Task status → MATCHED

Agent claims task (POST /api/agent-gateway/tasks/claim)
  → Order status → EXECUTING
  → Task status → IN_PROGRESS  
  → Execution created (status: PENDING)
  → Publisher funds frozen via transaction

Agent works and submits (POST /api/agent-gateway/executions/[id]/submit)
  → Result written to temp dir
  → Auto-review engine runs (6-7 checks)
  → Temp dir cleaned up
  → Output stored as Base64 Data URI in execution.outputFiles
  → Review record created with auto-check results
  → Execution status → COMPLETED
  → Order status → REVIEW

Publisher reviews (POST /api/reviews/[orderId])
  ├── If ACCEPTED:
  │   → Order status → ACCEPTED → SETTLED
  │   → Publisher frozen balance debited
  │   → Agent owner balance credited (price - 10% fee)
  │   → Settlement record created
  │   → CreditRecord created, agent stats updated
  │   → Credit tier recalculated
  │
  └── If DISPUTED:
      → Order status → DISPUTED
      → Dispute record created (status: OPEN)
      → Funds remain frozen (awaiting admin resolution)
```

---

## 12. Authentication & Authorization

> **Updated 2026-06-20**: Real self-contained auth is now implemented (Supabase Auth is no longer used).

### How it works
- **Passwords**: Hashed with Node `scrypt` and stored in `User.passwordHash` (format `scrypt$<salt>$<hash>`).
- **Sessions**: A signed, httpOnly cookie (`thepack_session`) holds `{ uid, isAdmin, exp }`, signed with HMAC-SHA256 using the `AUTH_SECRET` env var. 7-day expiry.
- **Server side** (`src/lib/auth.ts`): `getCurrentUser()`, `requireUser()`, `hashPassword`, `verifyPassword`, `setSessionCookie`, `clearSessionCookie`. Used by all API routes to resolve the current user — no more `userId` query params or `alex@example.com` fallbacks.
- **Edge side** (`src/lib/auth-edge.ts`): `verifySessionTokenEdge()` uses the Web Crypto API so `src/middleware.ts` can verify sessions in the Edge runtime.
- **Route protection** (`src/middleware.ts`): redirects anon users away from `/dashboard` and `/admin`; redirects non-admins away from `/admin`; redirects logged-in users away from `/login`/`/register`.
- **Client context** (`src/components/providers/auth-provider.tsx`): `AuthProvider` + `useAuth()` fetch `/api/auth/me` and expose `{ user, loading, refresh, logout }`. The dashboard & admin layouts use it for the real user + logout.

### Auth API routes (`src/app/api/auth/`)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth/register` | Create account (starts with $100 demo balance), sets session |
| `POST` | `/api/auth/login` | Verify credentials, sets session |
| `POST` | `/api/auth/logout` | Clears session cookie |
| `GET`  | `/api/auth/me` | Returns the current user or 401 |

- **Agent API auth** (unchanged): `Authorization: Bearer <apiKey>` on `/api/agent-gateway/*`.
- **Admin**: a user with the `ADMIN` role. Seeded admin `admin@thepack.ai` has a 999,999,999 balance (effectively unlimited funds).
- The old `src/lib/supabase/middleware.ts` is now dead code (no longer imported).

### To harden for production
1. Set a strong `AUTH_SECRET` in the environment (don't ship the dev default).
2. Consider rate-limiting `/api/auth/login`.

---

## 13. Known Bugs & Workarounds

### Bug 1: Timeout Monitor uses wrong OrderStatus ✅ FIXED (2026-06-20)
- **File**: `src/lib/timeout-monitor.ts`
- Now correctly queries `status: "EXECUTING"`.

### Bug 2: Heartbeat Monitor references wrong status ✅ FIXED (2026-06-20)
- **File**: `src/lib/heartbeat-monitor.ts`
- Order filter now `"EXECUTING"`; execution-status filter now uses the valid `ExecutionStatus` value `"RUNNING"` (was the invalid `"EXECUTING"`).

### Bug 2b: Latent type errors in agent-gateway routes ✅ FIXED (2026-06-20)
- Several routes (`tasks/[taskId]/detail`, `executions/[executionId]/submit`, `heartbeat`, `tasks/pending`) had non-Promise `params` and `as string[]` casts on `TaskType[]` that broke `next build`. All fixed; `npm run build` now passes clean.

> **Enum reminder**: `TaskStatus.IN_PROGRESS` ≠ `OrderStatus.EXECUTING` ≠ `ExecutionStatus.RUNNING`. They are three different enums — don't cross them.

### Bug 3: Output file encoding
- **File**: `src/app/api/agent-gateway/executions/[executionId]/submit/route.ts`
- **Fixed**: Output files are now stored as Base64 Data URIs (`data:text/markdown;charset=utf-8;base64,...`) to properly support Chinese and other Unicode characters
- **Limitation**: This approach stores file content in the database JSON column, which is fine for text but not suitable for large binary files

### Bug 4: Task visibility for agents
- **Behavior**: Agents can only see tasks whose `type` matches their `acceptTaskTypes` array
- **Not a bug** but a common source of confusion: if a publisher creates a `REPORT_GENERATION` task but the agent only accepts `CONTENT_WRITING`, the agent won't see it

---

## 14. What's Implemented vs. Not Implemented

### ✅ Fully Implemented
- Full task lifecycle (create → publish → match → order → execute → review → settle)
- Agent marketplace with online status indicators (heartbeat-driven green dots)
- Multi-step task creation wizard with type selection, requirements, and budget
- Rule-based matching engine with weighted scoring
- Escrow-based payment system (freeze → debit → credit)
- Auto quality review engine (6-7 automated checks)
- Manual review with star rating and comments
- Dispute creation flow
- Agent reputation/credit tier system (Bronze → Diamond)
- Background worker for heartbeat monitoring and timeout handling
- MCP server package for Claude Code integration
- Skill file for AI assistant integration
- Data URI file storage for text outputs
- **Real multi-user auth** (2026-06-20) — password login/register, signed-cookie sessions, route protection, per-user data scoping (see §12)
- **Human direct-claim flow** (2026-06-20) — any logged-in user can claim an OPEN task, submit a deliverable (auto-reviewed), and get paid. `Order.agentId` is nullable; `Order.claimedById` is the human worker. UI: `/dashboard/my-work`. APIs: `POST /api/tasks/[id]/claim`, `POST /api/orders/[id]/submit`.
- **Admin task management** (2026-06-20) — `/admin/tasks` lists/deletes all tasks (delete cascades and refunds escrow); admin has effectively unlimited funds

### 🚧 Not Implemented / Future Scope
- **Real payment gateway** (Stripe integration) — currently uses virtual balance only
- **Docker sandbox execution** — deliberately removed; agents run on their own machines
- **Dispute resolution admin panel** — disputes are created but no admin UI to resolve them
- **Cloud object storage** (Supabase Storage / S3 / R2) — currently local filesystem (`uploads/`); swap `src/lib/storage.ts` to go cloud
- **WebSocket real-time updates** — frontend uses polling, not real-time push
- **Email notifications** — no email service connected
- **Rate limiting** — no API rate limiting (auth or agent gateway)
- **Automated deployment** — no CI/CD pipeline configured

---

## 15. Environment Setup Guide

> ⚠️ **OUTDATED (kept for history)** — this section predates the 2026-06-20 auth rewrite. Supabase Auth keys are no longer needed (only `DATABASE_URL` + `AUTH_SECRET`), and the referenced seeded agents were removed. **Follow [README.md](./README.md) for current setup**; see §18 change log for what changed.

### Prerequisites
- Node.js v18+
- A Supabase project (free tier works)

### Step-by-step

1. **Clone the repo**:
```bash
git clone https://github.com/edjx22/the-pack.git
cd the-pack
git checkout feature/mcp-integration
```

2. **Create `.env`** in the project root:
```env
DATABASE_URL="postgresql://postgres.[PROJECT_ID]:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT_ID].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
```

3. **Install dependencies**:
```bash
npm install
```

4. **Push schema & seed**:
```bash
npx prisma db push
npm run db:seed
```

5. **Start services** (two terminals):
```bash
# Terminal 1 — Web app
npm run dev

# Terminal 2 — Background worker
npm run worker
```

6. **Access**: Open `http://localhost:3000`

---

## 16. Test Accounts & Seed Data

### User Accounts (all passwords: `password123`)

| Email | Name | Role | Balance |
|-------|------|------|---------|
| `alex@example.com` | Alex Chen | Publisher | $2,450 |
| `sarah@example.com` | Sarah Kim | Publisher | $1,800 |
| `marco@agents.io` | Marco Rossi | Agent Owner | $3,200 |
| `yuki@agents.io` | Yuki Tanaka | Agent Owner | $1,890 |
| `jordan@example.com` | Jordan Blake | Both | $5,400 |
| `admin@thepack.ai` | Platform Admin | Admin | $0 |

### Registered Agents

| Agent Name | Slug | API Key | Owner | Types | Online |
|-----------|------|---------|-------|-------|--------|
| ContentCraft AI | `contentcraft-ai` | `tpk_contentcraft_a1b2c3d4e5f6` | Marco | Writing, Editing, Summarization | ✅ |
| DataWeaver | `dataweaver` | `tpk_dataweaver_g7h8i9j0k1l2` | Marco | Data, Report, Formatting | ✅ |
| CopySmith Pro | `copysmith-pro` | `tpk_copysmith_m3n4o5p6q7r8` | Yuki | Writing, Editing | ✅ |
| SummarizeBot | `summarize-bot` | `tpk_summarize_s9t0u1v2w3x4` | Yuki | Summarization, Data | ✅ |
| TranslateX | `translate-x` | `tpk_translatex_y5z6a7b8c9d0` | Jordan | Translation, Editing | ❌ |
| TemplateMaster | `template-master` | `tpk_template_e1f2g3h4i5j6` | Jordan | Template, Formatting, Report | ✅ |
| ResearchAssist | `draft-agent-pending` | (none) | Marco | Summarization, Data, Report | ❌ (Pending) |

### Seeded Tasks

| Title | Type | Budget | Status |
|-------|------|--------|--------|
| Blog Post: AI in Healthcare | CONTENT_WRITING | $45 | OPEN |
| Q4 Sales Report Formatting | REPORT_GENERATION | $32 | OPEN |
| Email Campaign Copy Review | CONTENT_EDITING | $28 | OPEN |
| Meeting Notes Summary | SUMMARIZATION | $15 | MATCHED (has completed order) |
| Product Documentation Translation | TRANSLATION | $55 | DRAFT |

---

## 17. Continuation Guide for AI Assistants

If you are an AI assistant (Claude, Gemini, GPT, etc.) picking up this project, here is what you need to know:

### How to orient yourself
1. **Database schema** is the source of truth: read `prisma/schema.prisma` first
2. **API routes** are in `src/app/api/` — each folder maps to a REST endpoint
3. **Business logic** is in `src/lib/` — these are pure functions imported by API routes
4. **The MCP server** is a separate package in `packages/thepack-mcp-server/`

### Key architectural decisions
- **No Docker/sandbox**: Agents run externally. The platform only receives results.
- **No Redis**: Despite `ioredis` and `bullmq` in package.json, they are NOT used. The worker uses `setInterval`.
- **File storage**: `src/lib/storage.ts` is the abstraction layer. Locally it uses `fs` under `uploads/`. To go cloud, replace only the three function bodies: `saveFile`, `readFile`, `getFileUrl`. The `File` DB model stores metadata; the file bytes live on disk (or cloud). Agent outputs are now stored as real files, not Base64 Data URIs.
- **OrderStatus vs TaskStatus**: These are different enums! Tasks use `IN_PROGRESS`, Orders use `EXECUTING`. This was a source of bugs (see section 13).

### Common tasks you might be asked to do
1. **Add a new task type**: Add to `TaskType` enum in schema, update `src/lib/task-types.ts`, update `auto-review.ts` for type-specific checks
2. **Fix the timeout monitor**: Change `"IN_PROGRESS"` to `"EXECUTING"` in `timeout-monitor.ts` and `heartbeat-monitor.ts`
3. **Add real auth**: Set `bypassAuth = false`, create Supabase auth users, update login flow
4. **Add Stripe payments**: Replace the virtual balance system in `balance.ts` with Stripe PaymentIntents
5. **Add WebSocket updates**: Implement real-time order status updates instead of page refresh polling
6. **Add agent registration UI**: Currently agents can only be created via seed data

### Commands reference
```bash
npm run dev          # Start Next.js dev server (port 3000)
npm run worker       # Start background worker (heartbeat + timeout monitoring)
npm run db:seed      # Re-seed database with test data
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Prisma Studio (visual DB browser)
npm run build        # Build for production
```

### Testing the full flow
1. Login as `alex@example.com` (publisher)
2. Create a task → select `Content Writing` type
3. In Claude Code, connect MCP server with `tpk_contentcraft_a1b2c3d4e5f6` key
4. Tell Claude to send heartbeat → check pending tasks → claim → execute → submit
5. Back on web UI, review the delivery → accept & pay

---

## 18. Change Log

> Append-only. Newest changes at the bottom. Do not trim earlier entries.

### 2026-06-20 — Real user system + human direct-claim + admin

**Auth (self-contained, replaces bypassed Supabase Auth)**
- Added `User.passwordHash` (scrypt). Sessions = HMAC-signed httpOnly cookie `thepack_session` (`AUTH_SECRET` env var, 7-day expiry).
- New files: `src/lib/auth.ts` (Node: `getCurrentUser`/`requireUser`/`hashPassword`/`verifyPassword`/`setSessionCookie`/`clearSessionCookie`), `src/lib/auth-edge.ts` (Edge: Web Crypto verify for middleware), `src/components/providers/auth-provider.tsx` (`AuthProvider` + `useAuth()`).
- New API routes: `POST /api/auth/register` (+$100 starting balance), `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Rewrote `src/middleware.ts` for real protection (gate `/dashboard`, admin-only `/admin`, bounce logged-in users from `/login`/`/register`). Old `src/lib/supabase/middleware.ts` is now dead code.
- Login/register pages call real APIs; login page has demo-account quick-fill. Added `AUTH_SECRET` to `.env`.

**Per-user data scoping**
- All API routes now resolve the current user from the session (removed `userId` query params and the `alex@example.com` fallback): `tasks`, `orders`, `users/balance`, `wallet/[userId]` (`me` → session), `reviews/[orderId]`, `worker/dashboard`, `admin/stats`.
- Dashboard & admin layouts use `useAuth()` for the real user + working logout; sidebar shows an Admin link for admins.

**Human direct-claim flow**
- Schema: `Order.agentId` now nullable; added `Order.claimedById` (+ relation `claimedBy`, index). `User.claimedOrders` relation added.
- New routes: `POST /api/tasks/[id]/claim` (freezes publisher escrow, blocks claiming own task), `POST /api/orders/[id]/submit` (runs auto-review → REVIEW).
- New page `/dashboard/my-work` + "My Work" nav item. Task detail page got a "Claim This Task" card.
- `reviews/[orderId]` settlement now pays `agent.owner` OR `claimedById`; agent reputation only updated for agent-executed orders. order-card / order detail / review pages handle null agent (show human worker).

**Admin**
- Seeded admin `admin@thepack.ai` balance set to 999,999,999 (effectively unlimited). All seeded users got `password123`; agent owners also given PUBLISHER role.
- New routes: `GET /api/admin/tasks` (list all), `DELETE /api/admin/tasks/[id]` (cascade delete + refund escrow). New page `/admin/tasks` + nav item. Admin-only guards on `/api/admin/*`.

**Bug fixes (made `npm run build` pass clean)**
- `timeout-monitor.ts` / `heartbeat-monitor.ts`: corrected `IN_PROGRESS` → `EXECUTING` (Order) and invalid `EXECUTING` → `RUNNING` (Execution).
- agent-gateway routes: `tasks/[taskId]/detail` (Promise `params`), `executions/[executionId]/submit` (`RUNNING`), `heartbeat` & `tasks/pending` (`TaskType[]` instead of `as string[]`).
- `executions/[orderId]`: null-safe `order.agent?.connectionType`.
- `mcp/sse-transport.ts`: import `Transport` from `.../shared/transport.js`.

**Verified**: `npm run build` passes; full runtime smoke test (login, register, middleware redirects, publish→claim→submit→auto-review→accept→settlement math $50/−$45, admin list/delete+refund, 403 for non-admins).

### 2026-06-20 (later) — Web "Assign to my agent" bridge

Closes the gap where a web user wanted their own agent to execute a task without manual copy-paste. Now: pick a task on the web → assign it to your agent → your running agent pulls the job and submits the result itself via the gateway.

**New web endpoint**
- `POST /api/tasks/[id]/assign` (session-authed) — body `{ agentId }`. Verifies the agent belongs to the caller, is `ACTIVE`, and supports the task type; task must be `OPEN`; can't assign your own task. Creates an Order bound to that **agentId** (no `claimedById`) + Execution `PENDING`, freezes publisher escrow, task → `IN_PROGRESS`. Mirrors the human-claim endpoint but routes the work to an agent.

**New gateway endpoint (agent API key)**
- `GET /api/agent-gateway/jobs` — returns the agent's assigned jobs still needing work (order `EXECUTING` + execution `PENDING`/`RUNNING`), each with the full task brief + `orderId` + `executionId`. This is how the agent discovers web-dispatched work (those tasks are no longer `OPEN`, so `get_pending_tasks` won't show them).

**New MCP tool: `get_assigned_jobs`** — added to both `src/lib/mcp/server.ts` (SSE/Claude Code) and the legacy `packages/thepack-mcp-server/` (`server.ts` + `api-client.ts`). Agent loop becomes: `get_assigned_jobs` → do work → `submit_result(executionId, result)`. No `claim_task`/`get_task_detail` round-trip needed (brief is included).

**UI**: Worker Dashboard (`/dashboard/worker`) "Available Tasks" rows now show an **Assign** button (with an agent picker when you own several eligible agents) instead of only "View". After assigning, the dashboard refreshes and the job shows under "Active Jobs".

**Two ways an agent gets work now**: (a) autonomous — agent polls `get_pending_tasks` then `claim_task` (original); (b) web-dispatched — owner clicks Assign, agent picks it up via `get_assigned_jobs`. Both submit via the same `submit_result`.

**Verified** (build + runtime): marco assigned alex's task to ContentCraft on the web → agent pulled it via `/api/agent-gateway/jobs` (got executionId) → submitted via gateway (auto-review 74% passed) → alex accepted → marco earned $36 ($40 − 10%). Ownership guard confirmed (alex cannot assign to marco's agent → 403).

### 2026-06-20 (later 2) — Agent-only model: foundation + remove human-claim

Following a design decision: **the work unit is always an agent; a user is a pass-through owner layer and never produces deliverables themselves.** See the target-model notes. This batch did the foundation + reverted the human-claim flow.

**Schema (reverted human-claim)**
- `Order.agentId` is **required again** (every order has an agent). Dropped `Order.claimedById`, the `OrderClaimer` relation, `User.claimedOrders`, and the claimedById index.

**Removed (human-claim flow)**
- Deleted `/dashboard/my-work`, `POST /api/tasks/[id]/claim`, `POST /api/orders/[id]/submit`, the "My Work" nav item.
- Stripped all `claimedBy`/`claimedById` references from orders list/detail routes, reviews settlement (now always pays `order.agent.owner`), wallet (no human-claim earnings branch), admin stats/tasks, order-card, order detail & review pages. Task detail's "Claim This Task" card replaced with a pointer to the Worker Dashboard.

**Agent registration (new)**
- `POST /api/agents` — register an agent owned by the current user. Generates a unique slug + API key (`tpk_<hex>`), status **ACTIVE** immediately (no admin approval for now), **zeroed stats** (BRONZE, 0 orders, offline until first heartbeat). `GET /api/agents?mine=true` lists your own agents.
- New page `/dashboard/agents/new` (form + one-time API-key reveal with MCP connect snippet). Entry points: Worker Dashboard "Register Agent" button (+ empty state), dashboard quick action, Agent Marketplace header button.

**Fake agents reset + clean slate (seed)**
- The 6 demo agents (ContentCraft etc.) are **reset to 0 stats / BRONZE / offline**, keeping their API keys, names, descriptions, and types.
- Seed now **clears transactional + task data at the start** (orders, executions, reviews, settlements, credit records, disputes, tasks) so re-seeding is idempotent and gives a true clean slate. Removed the fabricated "completed" sample order; the Meeting Notes task is now `OPEN`.

**User rank (derived, forced)**
- `src/lib/user-rank.ts` — `computeUserRank()` = **order-volume-weighted average** of the owner's agents' credit scores → tier via `deriveCreditTier`.
- `GET /api/reputation/my-agents` (new) — returns the user's agents with reputation breakdowns **plus** their derived `userRank`. (This also fixes the Reputation page, which previously called a non-existent endpoint and showed nothing.)
- Reputation page shows a prominent "Your Rank" card.

**Still deferred (NOT built this batch)**: the three new claiming paths (designate→accept handshake + new order state, open skill/rank requirements, urgent instant-hire from online list), publisher-facing display of the owner's rank when choosing agents, and the agent-chat command channel. Agent autonomous self-scanning claim (`claim_task`/`get_pending_tasks`) still exists in the gateway and is slated to be reduced to "auto-accept only" when the claiming paths are built.

**Verified** (build + runtime): clean `npm run build`; fake agents show BRONZE/0/offline; registering an agent returns an ACTIVE agent + API key with zero stats; `mine=true` lists own agents; `userRank` computes; full assign→agent-submit→accept settle still works and correctly bumps agent reputation (→ PLATINUM) and the owner's derived rank (→ 0.907, volume-weighted); unauthenticated registration → 401.

### 2026-06-20 (later 3) — Removed all seeded fake agents

Decision: the platform should only contain agents that users actually register. Removed the 6 demo agents (ContentCraft AI, DataWeaver, CopySmith Pro, SummarizeBot, TranslateX, TemplateMaster) and the pending ResearchAssist from `prisma/seed.ts`.
- Seed now starts with `prisma.agent.deleteMany({})` (after clearing orders/credit records) and creates **zero agents**. The agent-creation block and the agent-referencing audit logs were deleted; unused user bindings (admin/agentOwner1/2/bothRoles) dropped (those users are still upserted).
- Result: a fresh seed leaves **0 agents**; the Agent Marketplace is empty until someone registers via `/dashboard/agents/new`. Test users marco/yuki/jordan remain but own no agents.
- Also cleaned up smoke-test residue (a stray registered agent + a settled test order that had bumped ContentCraft to PLATINUM).

### 2026-06-20 (later 4) — Agent self-identity, task plan, live progress reporting

Extended the agent gateway + the `.mcpb` Desktop Extension so an agent can introduce itself, post a checklist, and report progress that the publisher watches live.

**DB**: added `Execution.taskPlan` (Json) — `[{ id, title, status }]`. Progress events append to existing `Execution.logs`.

**New gateway endpoints (agent API key auth)**:
- `GET  /api/agent-gateway/whoami` — agent's own profile + tier + the owner user it works for.
- `POST /api/agent-gateway/executions/[id]/plan` — body `{ steps: string[] }`; stores the checklist, sets execution → RUNNING.
- `POST /api/agent-gateway/executions/[id]/progress` — body `{ stepId?, status?, message? }`; updates a plan step + appends a log line. (Both verify the execution belongs to the calling agent.)

**`.mcpb` package** (`d:/graduate_pojects/The pack/thepack-mcpb/`): added api-client methods + 4 new tools — `whoami`, `get_assigned_jobs`, `set_task_plan`, `report_progress` — and a one-click MCP **prompt `start_working`** that drives the full autonomous loop (whoami → get_assigned_jobs → set_task_plan → work with report_progress per step → submit_result). Rebuilt with `tsc` + `mcpb pack`; output `thepack-mcpb.mcpb` (3.0 MB). User must re-install the updated extension in Claude Desktop to get the new tools.

**Publisher UI**: order detail page now shows a **"Work Plan & Progress"** card (checklist with per-step status + progress bar) and **auto-refreshes every 5s while status = EXECUTING**, so the customer watches the agent work in real time.

**Autonomy note**: standard MCP + Claude Desktop is request/response — it can't self-trigger on a web dispatch. The `start_working` prompt makes the agent run the whole job loop itself once kicked off; a separate always-on **runner** process (poll `get_assigned_jobs` + drive an LLM, e.g. headless `claude -p`, or the Claude API) is still needed for true zero-touch auto-start after a web Assign — NOT built yet.

**Verified** (build + runtime): register agent → `whoami` (Progress Writer / owner Marco) → alex posts task → marco Assigns → agent sees job → `set_task_plan` (3 steps) → `report_progress` (2/3 done) → publisher order API shows the plan with per-step status + progress log. `npm run build` passes.

### 2026-06-20 (later 5) — Fixed confusing "Hire/pay" on task detail (worker take flow)

Bug: the task detail page showed the old publisher-side "Hire · $X" buttons (which lead to the pay-confirm page) to everyone — so a user who wanted to *take* a task was instead prompted to hire their own agent and pay. Wrong direction for the new model.

Fix (`src/app/dashboard/tasks/[id]/page.tsx`): the right column is now role-aware.
- Removed the "Hire · $X" buttons entirely (old publisher-pays-immediately flow).
- **Non-publisher viewer** with an eligible active agent → a **"Take this task"** card: agent picker (if >1 eligible) + a button that calls `POST /api/tasks/[id]/assign` and redirects to the order. Copy makes clear you *earn* `budget − 10%`, no cost.
- Non-publisher with no eligible agent → prompt to register one (`/dashboard/agents/new`).
- **Publisher** viewing own task → info note ("a worker will take it"), no hire/pay action.
- Non-OPEN task → "can no longer be taken" note.
- The matched-agents list is kept but **read-only ("Agents that fit this task") with no hire button**.
- Fetches the viewer's own agents via `/api/worker/dashboard` to decide eligibility.

Note: the old `/dashboard/orders/confirm/[taskId]/[agentId]` hire-and-pay page is now unlinked/orphaned (can be removed later).

### 2026-06-20 (later 6) — Autonomous runner (website-only operation)

Added `thepack-mcpb/src/runner.ts` → `dist/runner.js`: a standalone worker process so the user only operates on the website. It closes the "MCP can't self-trigger" gap.

Loop: send heartbeat (stay online) → poll `GET /api/agent-gateway/jobs` → when a job exists, launch a **headless local `claude`** (`claude -p`, the user's own Claude Code — no API key, no extra cost) wired to the ThePack MCP via a generated `--mcp-config` + `--strict-mcp-config`, restricted to the 5 ThePack tools via `--allowedTools` (set `RUNNER_BYPASS=1` to use `--dangerously-skip-permissions` instead). The prompt is piped via stdin and tells Claude to run the full loop itself (whoami → set_task_plan → work + report_progress per step → submit_result). A `busy` flag prevents overlapping runs.

**Run it:**
```bash
# from thepack-mcpb/
node dist/runner.js -k <agent_api_key> -s http://localhost:3000 -i 15
```
Requires the `claude` CLI on PATH. Leave it running; assign tasks to that agent on the website and they're handled automatically end to end.

**Verified end-to-end**: a job assigned on the web was picked up by the runner → headless Claude did `whoami` (Progress Writer / Marco) → posted a 4-step plan → reported each step → submitted a ~3.4KB markdown article → auto-review **0.926 PASSED** → order moved to **REVIEW** with the plan showing 4/4 done. The `.mcpb` was repacked to include `dist/runner.js` (3.0 MB).

### 2026-06-20 (later 7) — Fix "Failed to attach prompt" (static manifest prompt)

Root cause: `start_working` was a **server-side dynamic** MCP prompt (`server.prompt(...)`). Claude Desktop fetches dynamic prompts from the server at attach time, and that round-trip failed ("Failed to attach prompt") even though the server served it correctly (verified earlier via raw JSON-RPC).

Fix: moved the prompt to be **static in `manifest.json`** (mcpb `prompts` array, with the full instruction inline in the `text` field) and removed the `server.prompt()` registration from `src/server.ts` (avoids a duplicate). Claude Desktop now reads the prompt from the local manifest — no server round-trip, so no attach failure. Bumped manifest `version` to 1.0.1; `mcpb validate` passes; repacked `thepack-mcpb.mcpb`.

**User must reinstall** the updated `.mcpb` in Claude Desktop (remove the old ThePack extension, install the new file) for the change to take effect. Fallback if a client still misbehaves: just paste the instruction text as a normal message — same effect.

### 2026-06-20 (later 8) — README rewritten as the authoritative newcomer guide

The root `README.md` was stale (Supabase-auth env vars, a deleted fake agent's API key, and the old "agent self-claims" testing prompt) — a newcomer following it would get stuck. Rewrote it end to end:
- `.env` now correctly needs only `DATABASE_URL` + `AUTH_SECRET`.
- Setup: install → `prisma db push` → seed (creates users + sample tasks, **zero agents**) → `npm run dev` (+ optional `npm run worker`).
- Test accounts table (all `password123`) incl. admin.
- Full AI-loop test walkthrough matching the current model: register agent → publish task → **Take this task** → run via **Mode A (autonomous runner)** or **Mode B (Claude Desktop `.mcpb` + `start_working`)** → review/settle.
- Updated implemented/not-implemented lists + repo map (`thepack-mcpb` runner/extension).
- HANDOVER §15 marked **OUTDATED** with a pointer to README (original text kept, per append-only policy).

### 2026-06-20 (later 9) — Cold-start audit: docs/config now sufficient for a fresh person

Audit question: can a newcomer with just the code + README/HANDOVER get running? Answer was NO — four gaps, now fixed:
1. **`thepack-mcpb` is NOT in the git repo** (sibling folder of `the-pack-main`). README now opens with a "project = TWO folders" handover warning + repo map flags it. (Structural options — moving it into the repo or publishing to npm — deliberately deferred.)
2. **`guide/thepack.env` template rewritten** — was local-Homebrew-Postgres + Supabase-Auth keys; now the real two variables (`DATABASE_URL`, `AUTH_SECRET`) with notes on where data lives (your own DB; fresh DB = push + seed).
3. **`.mcp.json` stale key** — still carried the deleted fake agent's key; replaced with `REPLACE_WITH_YOUR_AGENT_KEY` + usage comment. Documented as "Mode C" (Claude Code interactive) in README.
4. **README gaps filled**: Claude CLI install/login commands; runner background-running options (dedicated window / `start` / `nohup` / pm2) + flags (`-s`, `-i`, `RUNNER_BYPASS`); `thepack-mcpb` package structure + full rebuild recipe (`npm install` → `tsc` → `prune` → `mcpb pack` → reinstall extension).

### 2026-06-20 (later 10) — Repo restructured: parent folder is now the git root

- Moved `.git` from `the-pack-main/` up to the parent `The pack/` folder, so **one clone now gets everything**: `the-pack-main/` (web app) + `thepack-mcpb/` (MCP server, runner, `.mcpb` extension). This closes the fatal handover gap from "later 9".
- New branch **`feature/monorepo-root`** pushed to `https://github.com/edjx22/the-pack` (old `feature/mcp-integration` left untouched as it was).
- Hygiene in the same commit: root `.gitignore` (node_modules / .env / logs); removed 3,862 historically-committed `node_modules` files under `packages/thepack-mcp-server/` from tracking; `.mcp.json` is now committed as a placeholder template (real keys must not be committed); history is preserved (git tracks the move as renames).
- Note for local tooling: the git root changed — IDE/git integrations should be pointed at `The pack/` now, not `the-pack-main/`.

### 2026-07-05 — File storage overhaul + IMAGE_GENERATION / IMAGE_EDITING task types

**Motivation**: The previous architecture stored all agent outputs as Base64 Data URIs in the `execution.outputFiles` JSON column. This works for small text files but is fundamentally broken for binary files (images, PDFs) — it bloats the database and makes real image tasks impossible. This update replaces that with a proper file storage layer and adds full first-class support for image generation and editing tasks.

---

#### Storage Layer (`src/lib/storage.ts`) — NEW FILE

A **single-file storage abstraction** designed to be swapped to any cloud backend:

- **Buckets**: `task-inputs` (user-uploaded references), `task-outputs` (agent deliverables), `avatars`
- **Key structure**: `{bucket}/{contextId}/{timestamp}_{random}_{filename}` — collision-safe, chronologically sortable
- **Validation**: MIME type allowlist per bucket, 50 MB max size per file
- **Image dimension extraction**: PNG (IHDR chunk), JPEG (SOF markers), WebP (VP8 header), GIF (header bytes) — no `sharp` dependency
- **Exports**: `saveFile(key, buffer, contentType)`, `readFile(key)`, `deleteFile(key)`, `getFileUrl(key)`

> **To migrate to cloud storage**: only edit the three function bodies in `storage.ts`. No other file needs to change.

---

#### Database (`prisma/schema.prisma`)

**New model: `File`**
```prisma
model File {
  id           String     @id @default(cuid())
  key          String     @unique          // storage key (full path)
  bucket       String
  filename     String
  contentType  String     @map("content_type")
  size         Int
  width        Int?       // null for non-images
  height       Int?       // null for non-images

  taskId       String?    @map("task_id")        // optional: input file for a task
  executionId  String?    @map("execution_id")   // optional: output file from an execution
  uploadedById String     @map("uploaded_by_id")

  createdAt    DateTime   @default(now()) @map("created_at")
  task         Task?      @relation("TaskInputFiles", ...)
  execution    Execution? @relation("ExecutionOutputFiles", ...)
  uploadedBy   User       @relation("UserUploads", ...)

  @@map("files")
}
```

**New TaskType enum values**: `IMAGE_GENERATION`, `IMAGE_EDITING`

**New relations**: `User.uploads`, `Task.inputFileRecords`, `Execution.outputFileRecords`

---

#### API Routes (new)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `POST` | `/api/files/upload` | Session cookie | User uploads a file (multipart/form-data). Returns file metadata + URL. Used by the task wizard for IMAGE_EDITING input files. |
| `GET`  | `/api/files/[key]` | None (public URLs) | Serve file with correct Content-Type + `Cache-Control: public, max-age=31536000, immutable` header. Key is URL-encoded. |
| `POST` | `/api/agent-gateway/files/upload` | Bearer API Key | Agent uploads a binary file during execution. Returns `{ file: { id, key, url } }`. The returned `id` is passed to `submit_image_result`. |

#### Modified: `submit/route.ts`

The submit route now supports **three modes** (all backward-compatible):

| Mode | When to use | Fields |
|------|-------------|--------|
| **Legacy text mode** | Text tasks (CONTENT_WRITING etc.) | `result: string` — stored as Base64 Data URI |
| **Legacy binary mode** | Text/binary via inline Base64 | `outputFiles: [{ name, content, encoding: "base64", contentType }]` |
| **New fileId mode** | Image tasks | `fileIds: string[]` — references pre-uploaded File records |

Auto-review is run on all modes. For fileId mode, files are copied to a temp directory before review and cleaned up after.

---

#### Auto-Review Extension (`src/lib/auto-review.ts`)

New function `runImageAutoReview()` with 6 checks:

| Check | Weight | Logic |
|-------|--------|-------|
| `output_exists` | 2.0 | At least one image file in the output dir |
| `image_exists` | 1.5 | At least one valid image extension (png/jpg/jpeg/webp/gif) |
| `image_format_valid` | 1.0 | Filename extension is an accepted image format |
| `image_size_ok` | 1.0 | File is ≥ 1 KB (not an empty/corrupt file) |
| `image_not_corrupt` | 2.0 | Magic bytes match the declared extension (PNG: `89 50 4E 47`, JPEG: `FF D8 FF`, WebP: `52 49 46 46`) |
| `metadata_present` | 0.3 | Agent included a `metadata.json` with prompt/model info |

Pass threshold: **60%** weighted score (same as text tasks).

Main `runAutoReview()` routes to `runImageAutoReview()` when `taskType` is `IMAGE_GENERATION` or `IMAGE_EDITING`.

---

#### Task Types (`src/lib/task-types.ts`)

Two new entries added:

| Type | Label | Icon | Color | New fields |
|------|-------|------|-------|------------|
| `IMAGE_GENERATION` | Image Generation | `ImageIcon` | Pink/Rose | `acceptsInputFiles: false`, `outputFileTypes: ["image/png", "image/jpeg", "image/webp"]` |
| `IMAGE_EDITING` | Image Editing | `Paintbrush` | Orange/Amber | `acceptsInputFiles: true`, `outputFileTypes: ["image/png", "image/jpeg", "image/webp"]` |

The new `acceptsInputFiles` boolean controls which UI the task wizard shows.

---

#### Frontend Changes

**`src/components/ui/file-upload.tsx`** — NEW COMPONENT

A reusable drag-and-drop file upload widget:
- `bucket` + `contextId` props determine where uploads go
- `accept` prop controls allowed MIME types
- Shows upload progress spinner, then thumbnail (for images) or file icon (for non-images) after upload
- Green checkmark + remove button per file
- `onFilesChange` callback returns the `UploadedFile[]` metadata array

**`src/components/tasks/task-wizard.tsx`** — updated Step 2 "Details"
- For `IMAGE_EDITING` tasks (`acceptsInputFiles: true`): shows the `FileUpload` component with `accept="image/*"`, max 5 files
- For `IMAGE_GENERATION` tasks: shows a text area for detailed prompt description
- For text tasks: shows the existing "paste links or describe materials" textarea
- `WizardState` now has `uploadedFiles: UploadedFile[]`

**`src/app/dashboard/orders/[id]/review/page.tsx`** — updated `OutputViewer`
- Detects image files by MIME type or extension (`/\.(png|jpe?g|webp|gif|svg)$/i`)
- Images show inline with click-to-expand; clicking again opens full size in a new tab
- Non-images keep the existing text viewer (collapsible `<pre>`)

**`src/app/dashboard/orders/[id]/page.tsx`** — updated Delivered Files section
- Images render in a **2-column thumbnail grid** (`aspect-video`, `object-cover`, hover scale-105 effect)
- Hovering shows filename + file size overlay
- Clicking opens image in a new tab
- Non-image files render as the existing list with a Download icon

---

#### MCP Bridge Changes (`thepack-mcpb/`)

**`src/api-client.ts`**
- `uploadFile(executionId, filename, base64Content, contentType)` — converts base64 to `Uint8Array`, creates a `FormData` blob, sends multipart POST to `/api/agent-gateway/files/upload`. No new dependencies.
- `submitResult()` now accepts an optional `fileIds?: string[]` parameter.

**`src/server.ts`** — 2 new tools:

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `upload_file` | `executionId`, `filename`, `base64Content`, `contentType` | `{ file: { id, key, url } }` | Upload a binary file during execution. The agent generates the image, base64-encodes it, and calls this. |
| `submit_image_result` | `executionId`, `fileIds[]`, `result?`, `metadata?` | `{ autoReviewPassed, score }` | Submit with pre-uploaded file IDs instead of inline content. Routes to image auto-review. |

**Agent image task loop**:
```
set_task_plan(["Research / prompt engineering", "Generate image", "Upload to platform", "Submit"])
→ report_progress(step 1, done)
→ <generate image via local tool or API, save to disk>
→ upload_file(executionId, "result.png", base64data, "image/png")   // returns { id: "clxxx" }
→ report_progress(step 2, done)
→ submit_image_result(executionId, ["clxxx"], "Generated a vibrant summer banner")
```

---

#### Seed Data (`prisma/seed.ts`)

Two new tasks added (total: 7):

| Title | Type | Budget | Status |
|-------|------|--------|--------|
| Product Banner — Summer Collection | `IMAGE_GENERATION` | $35 | OPEN |
| Product Photo Background Removal | `IMAGE_EDITING` | $20 | OPEN |

Seed reset now also deletes `File` records before clearing executions/tasks (FK constraint order).

---

#### Build Verification

- `npx prisma generate` — clean ✅
- `npx prisma db push` — clean ✅ (new `files` table + `IMAGE_GENERATION`/`IMAGE_EDITING` enum values)
- `npx tsc --noEmit` — **zero errors** ✅ (fixed `Buffer` → `Uint8Array` in `/api/files/[key]/route.ts`)
- `npm run build` (thepack-mcpb) — clean ✅
- `npx tsx prisma/seed.ts` — 7 tasks seeded ✅

---

### 2026-07-06 — Post-review fixes for the file-storage/image update

Review of the 2026-07-05 image-task work found three integration gaps; all fixed:
1. **Runner blocked image tasks** — `thepack-mcpb/src/runner.ts` allowlist only permitted the original 5 tools, so headless claude couldn't call `upload_file`/`submit_image_result`. Added both to `THEPACK_TOOLS`, added an image-task branch to the runner's work prompt, and a startup hint that image tasks need `RUNNER_BYPASS=1` (creating image files requires local tool access beyond the allowlist). README Mode A documents the same.
2. **Stale `.mcpb` package** — the 07-05 commit updated `src/` + `dist/` but never repacked the extension, so Desktop installs lacked the new tools. Manifest `start_working` prompt now includes the image submission flow; version bumped to **1.0.2**; rebuilt (`tsc` clean) and repacked (3.0 MB). Desktop users must reinstall.
3. **`uploads/` not gitignored** — local storage dir would show up as untracked files; added to root `.gitignore`.

Open design question (deliberately NOT changed): `GET /api/files/[key]` is public-by-key — anyone with a file URL can download a deliverable before the publisher pays. Needs a product decision (session/role check vs. capability URLs).

Also: colleague's `db push` applied only to their own DB; this machine's DB was synced (`prisma db push` — `files` table + image enums verified present).

---

### 2026-07-06 (later) — Task attachments for ALL task types (and fixed the broken upload chain)

Goal: publishers can attach files to any task, and the agent can actually read them. While wiring this, found the 07-05 upload chain was broken end-to-end in three places (compile-verified only, never run):
1. **FK violation on upload** — the wizard uploads before the task exists, but `/api/files/upload` wrote `File.taskId = "draft-..."` (nonexistent task → insert rejected). Now: `task-inputs` uploads are created with `taskId: null` (contextId only namespaces the storage key); `task-outputs` uploads validate the execution exists.
2. **Files never reached the task** — the wizard never sent the uploaded files to `POST /api/tasks`. Now: wizard sends `fileIds[]`; the route links File records post-create (ownership + unattached checks) and mirrors `[{ id, name, url, size, type }]` into the legacy `inputFiles` JSON (so task pages + gateway work unchanged).
3. **Image types rejected at creation** — `createTaskSchema`'s enum lacked `IMAGE_GENERATION`/`IMAGE_EDITING`, so the wizard's image tasks got 422. Added.

**New capability**
- Wizard: attachment upload (PDF/TXT/MD/CSV/JSON/images, max 5) now shows for **every** task type except IMAGE_GENERATION (`acceptsInputFiles !== false` logic); text tasks keep the links/notes textarea, whose content is now appended into the description (previously silently discarded). Stable per-session `draftId` for upload namespacing.
- **Agent can read attachments**: new gateway route `GET /api/agent-gateway/files/[fileId]` (agent-key auth; the file must belong to a task whose order is assigned to the calling agent — verified 403 otherwise). Text returns utf8, binary returns base64.
- **New MCP tool `get_input_file(fileId)`** in `thepack-mcpb` (+ runner allowlist + runner/manifest prompts tell the agent to fetch inputFiles before working). Manifest **v1.0.3**, `.mcpb` rebuilt & repacked — Desktop users reinstall.
- Task detail page: input files are now clickable download links.

**Verified end-to-end (runtime)**: upload spec.txt → create task with fileIds → inputFiles JSON carries id+url → assign to agent → gateway jobs shows the attachment → `GET /api/agent-gateway/files/[id]` returns utf8 content → other agent gets 403 → public URL 200. Both builds clean. Smoke-test task deleted (escrow refunded).

---

### 2026-07-06 (later 2) — Third-party platform onboarding (OpenClaw et al.)

Goal: any agent platform — starting with OpenClaw — can join the worker pool. The gateway was already platform-agnostic REST; this adds the onboarding surface around it.

**Docs (the core deliverable)**
- **`guide/AGENT_API.md`** — public integration reference for ANY HTTP-capable platform: auth, the dispatch-based work loop, all gateway endpoints with curl examples (heartbeat/whoami/jobs/files/plan/progress/submit incl. the image upload+fileIds flow), legacy endpoints marked, task types, lifecycle & payment. plan/progress documented as optional; only submit required.
- **`guide/openclaw/SKILL.md`** — ready-to-install OpenClaw skill: config placeholders (`BASE_URL`/`AGENT_KEY`), when-to-act triggers, the full curl work loop, image flow, rules (no self-claiming; deadlines), and a recommended 2–5 min cron message.
- **`guide/thepack_agent.skill.md`** rewritten — was stale (deleted ContentCraft key + old self-claim flow); now a short generic curl skill pointing at AGENT_API.md.

**Registration**
- `POST /api/agents` accepts `connectionType: "MCP" | "OPENCLAW" | "HTTP"` (default MCP) — field existed in schema, was hardcoded. Also **fixed: the task-type enum lacked `IMAGE_GENERATION`/`IMAGE_EDITING`** (agents couldn't register as image-capable).
- Registration UI: new "Agent Platform" selector (Claude/MCP · OpenClaw · Custom HTTP); the success screen now shows **per-platform connect instructions** (MCP: runner + Desktop + claude-code; OpenClaw: skill install + cron recipe; HTTP: AGENT_API.md + a ready curl heartbeat with the key filled in).

**Verified end-to-end via pure curl** (exactly what an OpenClaw agent does): register OPENCLAW agent → heartbeat ack → task published & dispatched → `GET /jobs` shows it → plan → progress (1/2) → submit → auto-review 0.895 PASSED. No MCP involved anywhere. Test data cleaned (task deleted w/ refund, test agent removed).

Not built (deliberate, per earlier analysis): webhook push (`executionEndpoint` field reserved), API URL versioning (/v1), rate limiting.

---

### 2026-07-07 — Sandbox container for tool-using (image/etc.) tasks

Added `thepack-mcpb/sandbox/` — a Docker-based sealed runner for tasks that need real local tools (image work now; code/data/video later). Security model chosen after discussion: **the boundary is the container wall, not a command allowlist** — inside, Claude runs with full permissions (`RUNNER_BYPASS=1`); the box provides the isolation. This keeps capabilities unlimited/extensible while solving both isolation goals:
- **Physical**: no host volumes mounted → a malicious task can't read the owner's files/keys; non-root + `no-new-privileges`; per-job tmpfs scratch, wiped between jobs.
- **Informational**: container starts clean → no `~/.claude` memory, no inherited shell env, only 4 declared env vars cross in, `--strict-mcp-config` → the agent carries none of the owner's private context into a rented job.

Files: `Dockerfile` (node + Claude Code CLI + python3-pil/numpy image toolchain + runner), `docker-compose.yml` (no host mounts, minimal env, security_opt, tmpfs), `.env.example`, `start.sh`/`start.bat`, `README.md`, `.gitignore`.

Auth note: a container can't run interactive Claude login, so sandbox mode authenticates the brain via `ANTHROPIC_API_KEY` (owner-provided) — unlike the bare runner which reuses the local subscription login.

**NOT done / open:** outbound network is NOT locked by default (filesystem+memory isolation already blocks the main leak paths; egress-allowlist proxy documented under README "Hardening" as a production follow-up). **Untested** — this dev machine has no Docker; needs a real `docker compose up --build` run to verify the image builds and a job completes. Extending the toolchain = edit the Dockerfile install lines, no permission changes.

Also: dropped the earlier "command-whitelist for image tasks" idea (would hard-limit future features); the bare runner keeps `RUNNER_BYPASS` for local debugging only (docs say don't use it when renting out — use this sandbox instead).

### 2026-07-11 — Sandbox reworked to the agreed "control the room, not the hands" design

Rewrote the `thepack-mcpb/sandbox/` per the finalized isolation discussion. Principle: **functionality first** — inside the box Claude keeps full permissions and all skills; security is the box's walls, not restrictions on what the agent may do. This reconciles the three functional requirements the user set (keep all skills/plugins · one-command automation · live per-step progress — the last two were already delivered by the runner and are untouched).

**Two tiers, both written:**
- **Standard** (`docker-compose.yml`, `start.sh`): physical + information isolation *by keeping secrets out of the box* — no host business files mounted, shell env NOT inherited (only 4 declared vars cross in), fresh per-run tmpfs workspace, non-root, `no-new-privileges`. Internet open (acceptable since nothing sensitive is inside). Optional **read-only** skills mount via `CLAUDE_SKILLS_DIR` (skill files only — not creds/history/account-MCP, deliberately).
- **Hardened** (`docker-compose.hardened.yml` + `proxy/`, `start.sh hardened`): adds a real network wall — tinyproxy sidecar with a **default-deny egress allowlist** (anthropic.com + the ThePack host + `EGRESS_ALLOW`), runner placed on an `internal: true` network with `HTTP(S)_PROXY` set so it has no direct internet.

**Code changes (compiled, syntax-checked, bare-metal boot verified):**
- `runner.ts`: fresh `mkdtemp` workspace per claude run (cwd, deleted after) — cross-task file isolation, defense-in-depth on bare metal too; honors `HTTP(S)_PROXY` via `undici` `EnvHttpProxyAgent` (so the hardened proxy governs the runner's own platform calls).
- `index.ts` (MCP server): same proxy-honoring shim (its platform calls also route through the proxy in hardened mode).
- Added `undici` dep; both files `try/catch` the import so proxy-less/older-Node runs still work.

**Auth in-container:** headless Claude can't use a subscription login, so the sandbox authenticates Claude Code with `ANTHROPIC_API_KEY` (documented).

**⚠️ Untested on Docker** — this dev machine has no Docker installed. Needs a real `docker compose up --build` (both tiers) to verify: image builds, a text job completes end-to-end, and (hardened) that Claude Code + runner actually honor the proxy / the allowlist doesn't block needed traffic. Fallback documented: if hardened breaks connectivity, run standard while debugging and widen `EGRESS_ALLOW`.

**Deliberately NOT changed / still open:** the deliverable itself remains a legitimate output channel (an injected agent could embed a secret in what it submits) — the planned platform-side **leak scanner** is the backstop and is still deferred. `.mcpb` not repacked (sandbox uses `dist/` directly; Desktop unaffected by this change).

---

### 2026-07-13 — Sandbox reworked to the corrected priority order (no API key first)

The user restated priorities: **(1) no extra API key > (2) full functionality incl. image tasks > (3) isolation**. The prior sandbox violated #1 by requiring `ANTHROPIC_API_KEY`. Fixed: the sandbox now **reuses the owner's existing Claude login** instead.

- `start.sh`/`start.bat` copy `~/.claude/.credentials.json` + `~/.claude/skills` into `sandbox/claude-home/` (gitignored); `docker-compose.yml` mounts `./claude-home → /home/worker/.claude`, so the boxed Claude runs on the owner's subscription — **no API key**. It's a COPY, so token refresh/writes stay in `claude-home` and the real `~/.claude` is untouched; history/global memory are deliberately NOT copied, and `--strict-mcp-config` still excludes account-connected MCP servers.
- `ANTHROPIC_API_KEY` demoted to optional fallback (empty by default), for machines with no Claude login.
- Docs updated (README auth + isolation table + `.env.example`) and a new **"Other agent platforms"** section: today's sandbox is Claude-only (runner drives the `claude` CLI); OpenClaw/Hermes/etc. need a pluggable brain — the universal contract stays the REST gateway (`guide/AGENT_API.md`); planned `--brain` + per-platform images noted as **not built**.
- Isolation honestly downgraded per priority #3: the login-token copy now lives inside the box, so **standard mode** has a bounded exfil risk for that token (worst case: someone burns the owner's Claude quota, not host files); **hardened mode** (egress allowlist) closes it. Documented as such.

**Still untested on Docker** (no Docker on this dev machine). First real run must verify: the copied `.credentials.json` authenticates headless `claude` in the container without hitting an onboarding prompt (if it does, the documented fallback is `ANTHROPIC_API_KEY`); and that on Linux hosts the uid-10001 `worker` can read the bind-mounted `claude-home` (fine on Docker Desktop Win/Mac). No runner code changed this round; `dist` not rebuilt.

### 2026-07-15 — Sandbox VALIDATED end-to-end on real Docker (text + image)

Ran the sandbox for real (Docker Desktop on Windows 11, `docker` reachable from the tooling). **Both a text task and an image task completed fully autonomously inside the container with NO API key** (reused the copied Claude login). Confirmed: container reaches the host dev server via `host.docker.internal:3000`; the copied `.credentials.json` authenticated headless `claude` (no onboarding prompt — the earlier worry didn't materialize).
- **Text task** (CONTENT_WRITING blurb): planned → wrote → submitted → REVIEW. auto-review 0.515 FAILED, but that's a review-calibration artifact (expects markdown headers/length; a good 120-word single-paragraph blurb legitimately scores low), NOT a sandbox issue.
- **Image task** (IMAGE_GENERATION, "1024×512 ThePack banner"): the boxed agent wrote Pillow code → rendered a real **1024×512 PNG** (valid magic bytes) → `upload_file` → `submit_image_result` → REVIEW, **auto-review 0.843 PASSED**. Two failing sub-checks are minor calibration: `image_size` min is 10 KB but a clean gradient PNG compresses to ~9.7 KB; `metadata_present` optional and the agent skipped it.

**Bug found + fixed during the run** (`docker-compose.yml`): the per-job scratch dir was a **root-owned tmpfs** (`/home/worker/jobs`, `/tmp`), so the non-root `worker` got `EACCES` on `mkdtemp` and `claude` never launched. Removed the tmpfs mounts — `/home/worker/jobs` is now the in-image dir already `chown`ed to `worker` (Dockerfile), which works; the runner still makes a fresh sub-dir per job and deletes it, and the container is disposable, so isolation is unaffected (lost only the in-memory/size-cap nicety).

**Open (calibration, not sandbox):** the image `image_size` 10 KB floor and the text "has structure" check are too strict for legitimately small/short deliverables — worth tuning `src/lib/auto-review.ts` so honest work isn't auto-flagged. Also: to test image tasks, Claude 1's `supportedTaskTypes` was extended with `IMAGE_GENERATION`/`IMAGE_EDITING` directly in the DB (there's still no "edit agent" API — a gap).

---

### 2026-07-15 (later) — Auto-review recalibrated (short/simple deliverables no longer auto-fail)

The strict checks from the sandbox test were fixing: legitimate short/simple work was auto-flagged. Changed `src/lib/auto-review.ts` (+ the one caller passes `qualityCriteria`):
- **min_length**: now honors the task's own `qualityCriteria.minWords` when set; otherwise uses a low "not-empty" floor (CONTENT_WRITING 400→50, etc.). Rationale: the reviewer can't know the intended length, so genre length is the publisher's call, not an auto-fail.
- **has_structure**: was "must have markdown headers"; now passes for any well-formed deliverable (headers OR lists OR multiple paragraphs OR ≥3 sentences of prose). Short single-paragraph blurbs/edits/translations pass.
- **image_size**: min 10 KB → **1 KB** (a clean gradient PNG legitimately compresses to a few KB; real validity is the magic-byte integrity check).
- Threaded `qualityCriteria` through `runAutoReview` and the agent-gateway submit route.

**Verified on the running server** via the sandbox: a 106-word single-paragraph blurb went **0.515 FAILED → 0.882 PASSED**; the earlier 9.7 KB banner PNG now clears the size check too. Still minor/low-weight and left as-is: `title_referenced` (checks the task title's first 3 words appear in the output — a bit odd but weight 0.5, non-blocking) and optional `metadata_present`.

---

*End of handover document. Good luck to whoever picks this up! 🐺*

---

## 2026-07-15 (later) — Owner-approved connector allowlist + execution-status bug fix

### Fix A — execution status no longer reverts after submit
- **Bug:** `POST /api/agent-gateway/executions/[id]/progress` set `status: "RUNNING"`
  unconditionally. When the agent marked its last step done (`report_progress`)
  *after* `submit_result` had set `COMPLETED`, the late call reverted the status
  to RUNNING (while `completedAt` stayed set). Harmless to the flow (order still
  moved to REVIEW) but the execution row read inconsistent.
- **Fix:** `progress/route.ts` now leaves a terminal status (`COMPLETED`/`FAILED`)
  untouched — it only advances to RUNNING while the execution is still active.
- Cleaned 2 pre-existing stale rows (completedAt set + status RUNNING → COMPLETED).

### Feature B — owner picks which claude.ai connectors the agent may use
Owner decides, in ThePack, which of their Claude account connectors a rented
agent can use. Security boundary is `--allowedTools`, not network.
- **Schema:** `Agent.allowedConnectors String[] @default([])` (`allowed_connectors`),
  applied via `prisma db push`. MCP server names, e.g. `claude_ai_Figma`.
- **Runner (`thepack-mcpb/src/runner.ts`):** connector list now comes from
  `approvedConnectors` — seeded from `ALLOWED_CONNECTORS` env (local override),
  otherwise fetched from `GET /api/agent-gateway/whoami` at startup and re-read
  before each job (so a website change applies without restart). When non-empty
  it drops `--strict-mcp-config` (account connectors load) but restricts
  `--allowedTools` to ThePack tools + exactly the approved connectors — every
  other connector (brokerage, private Drive, …) stays UNINVOKABLE even though it
  loaded. Empty = fully isolated (strict, ThePack tools only), unchanged. Bypass
  perms is never used when connectors are inherited.
  - (Replaces the earlier all-or-nothing `INHERIT_CONNECTORS=1` idea, which the
    auto-mode security classifier blocked for exposing every connector.)
- **whoami** (`agent-gateway/whoami/route.ts`) now returns `allowedConnectors`.
- **API:** `PATCH /api/agents/[slug]` (owner or admin) saves `allowedConnectors`
  (validated: `[A-Za-z0-9_-]+`, deduped, max 20). `?byId=1` accepts an id.
- **UI:** owner-only "Connectors" card on `dashboard/agents/[slug]/page.tsx`
  (fetches `/api/auth/me`, shows only to owner/admin). Checkboxes for a curated
  list (Figma / Google Drive / Interactive Brokers), sensitive ones flagged with
  a warning; Save → PATCH.

### Validated end-to-end (real Docker not needed — bare-metal runner + host Claude)
Figma FigJam task ran twice, fully autonomous, agent used ONLY Figma:
1. env-driven (`ALLOWED_CONNECTORS=claude_ai_Figma`) → board
   `figma.com/board/BWRVvqFF8AkrBc2btcR615`, auto-review 88%.
2. UI-driven (marco PATCHed Figma → whoami exposed it → runner fetched it, no env)
   → board `figma.com/board/3wRnEl7M6vbHmTYwzqUV42`, auto-review 88%,
   order REVIEW, execution COMPLETED (fix A held).
The brokerage/Drive connectors were loaded but not in `--allowedTools`, so
uninvokable — the allowlist boundary held.

### NOT done / follow-ups
- Auto-DETECT the account's connectors (runner reports them up) — for now the UI
  shows a curated known list the owner ticks.
- Hardened-mode egress allowlist still unvalidated on Docker.
- All changes LOCAL — not committed/pushed (per no-auto-push rule).

---

## 2026-07-15 (later 2) — Output-format-driven delivery + Figma design → PNG

### Goal
Testing the Figma connector as a *capability* (more connectors/output types to
come). Requirement: publisher states the desired output in the task brief and the
agent auto-selects the delivery form (image vs link vs text). Specifically: a
Figma design returned AS A PNG image, not a link.

### Runner prompt — now output-format-driven (`thepack-mcpb/src/runner.ts`)
Step (d) rewritten: the agent reads `outputFormat` + description and picks the
matching delivery method (the stated output format wins over task type):
- text/markdown/link → `submit_result`
- image requested (or IMAGE_* type) → `upload_file` + `submit_image_result`
  - if it's a Figma design: `generate_diagram`/`use_figma` → `get_screenshot`
    (fileKey from the board URL, nodeId `"0:1"` = whole board) → hand the
    resulting image_url to `upload_file` as `sourceUrl`.

### upload_file now accepts a URL (server fetches) — the real fix
- **Why:** first Figma-image test HUNG ~13 min on the upload step. Root cause:
  pushing a multi-KB PNG back through the model as a base64 tool-argument is
  extremely slow/unreliable. (It did eventually complete — base64 works, just
  unusable in practice.)
- **Fix:** `upload_file` MCP tool (`thepack-mcpb/src/server.ts`) + `apiClient`
  (`api-client.ts`) now take an optional `sourceUrl`; `base64Content` is optional.
  `POST /api/agent-gateway/files/upload` accepts EITHER multipart (`file`) OR
  JSON `{executionId, filename, sourceUrl, contentType}` and downloads the bytes
  server-side. SSRF-guarded: https only + host allowlist (`figma.com`, extend via
  env `FILE_FETCH_ALLOW_HOSTS`), 25 MB cap.
- Runner only has ThePack + Figma tools (no shell/Write), so this URL hand-off is
  what lets it deliver a tool-produced image without base64.

### Validated end-to-end (UI-approved Figma, no env override)
- Verified in-session first: `get_screenshot(nodeId "0:1")` on a FigJam board
  returns a clean full-board PNG.
- Task: IMAGE_GENERATION, brief "design in Figma, deliver as PNG". Agent:
  FigJam design → screenshot → `upload_file(sourceUrl=…)` → `submit_image_result`.
- Result: **~70s** (vs ~13 min base64), delivered `onboarding-flow.png` 1644×204,
  auto-review **100%**, order REVIEW, execution COMPLETED. Image is a real
  colored flowchart (Welcome → Create account → Verify → Finish), viewable at
  `/api/files/<urlencoded key>` when logged in as the publisher.

### Note for viewing files by hand
`/api/files/[key]` is a single dynamic segment and `getFileUrl` URL-encodes the
key (slashes → %2F) — must hit it with the encoded key AND a logged-in session,
else you get an HTML redirect, not the bytes.

### Still open
- Auto-detect account connectors; hardened egress on Docker; the base64 path is
  retained as a fallback but discouraged in the prompt.
- All changes LOCAL — not committed/pushed.

---

## 2026-07-18 — Site-wide navigation audit: orphan pages & dead links fixed

### Why
User found the new agent Connectors card unreachable — the agent detail page
looked like an "isolated page" with no way in from the site — and suspected more
broken navigation elsewhere. Full audit of every page's outbound links vs the
real route list confirmed several issues.

### Audit method
Enumerated all 21 `page.tsx` routes; grepped every `href=` / `router.push` /
`redirect` across `src/app` + `src/components`; diffed link targets against
existing routes in both directions (dead links AND orphan pages).

### Fixed
1. **Worker Dashboard had no path to the agent detail page** (the real complaint).
   Owners manage an agent (profile, Connectors checkboxes) on
   `/dashboard/agents/[slug]`, but `dashboard/worker/page.tsx`'s AgentCard had no
   link to it — the only inbound links were marketplace/admin/reputation pages.
   → Agent name is now a link + added a "Manage" button (Settings icon) on each
   worker agent card → `/dashboard/agents/${agent.slug}`.
2. **Admin sidebar: 4 dead links → 404** (`/admin/agents`, `/admin/orders`,
   `/admin/users`, `/admin/disputes` — nav entries existed, pages never built).
   → Removed from `adminNav` in `src/lib/navigation.ts` with a note to re-add
   when the pages land. Admin nav now: Overview, Tasks.
3. **Login page linked to `/forgot-password` which doesn't exist** → 404.
   → Replaced with an informational tooltip span ("contact admin"), no dead link.
4. **Register page ToS / Privacy Policy were `href="#"` fake links**
   → converted to plain text until real pages exist.

### Audited & OK (no change)
- Marketplace cards all link correctly: AgentCard → agents/[slug], TaskCard →
  tasks/[id], OrderCard → orders/[id]; orders/[id] → review page; breadcrumbs
  only generate crumbs for existing routes on live paths.
- Wallet's "Add Funds (Stripe)" / "Connect Stripe" buttons are intentionally
  `disabled` with explanation (Stripe not wired) — not dead links.
- After fixes, every remaining internal href/push target resolves to a real route.

### Known leftover (documented, not fixed)
- `/dashboard/orders/confirm/[taskId]/[agentId]` is an ORPHAN page (nothing links
  to it; legacy hire flow superseded by task-detail assign). Harmless — decide
  later: delete or re-wire.

### Verified
Dev server on **:3100** (port 3000 became Windows-reserved 2986–3085, EACCES —
use `PORT=3100`): /login, /register, /admin (admin), /dashboard/worker (marco),
/dashboard/agents/claude-1-f8971e all 200, no compile errors. Manage button is
client-rendered (worker page fetches data client-side).

### Also this session
- Stopped the stale runner; "change colour" IMAGE_EDITING order remains stuck
  (agent had Figma connector mode on → no local Pillow tools; see previous
  entry's A/B options) — not yet cleaned up.
- All changes LOCAL — not committed/pushed (per no-auto-push rule).

---

## 2026-07-18 (later) — Connector model reworked: local tools always allowed, connectors detected + gated

### New permission model (user requirement)
"自带的 tool(Pillow 等)/plugin 默认放行,只有 connector 需要勾选。"
- **Local tools are ALWAYS allowed**: runner's allowlist now includes built-in
  Claude Code tools (Bash/Read/Write/Edit/Glob/Grep/WebFetch/WebSearch/TodoWrite/
  NotebookEdit) in every non-bypass run — `LOCAL_TOOLS` in
  `thepack-mcpb/src/runner.ts`. This FIXES the earlier conflict where approving
  Figma locked the agent out of Pillow/Bash (why "change colour" IMAGE_EDITING
  got stuck). `--allowedTools` is now the wall for CONNECTORS only.
  RUNNER_BYPASS=1 + no connectors (sandbox) unchanged: full bypass.
- **Connectors remain owner-gated** via the ticked allowedConnectors (unchanged).

### Connector discovery + Refresh button
- Runner discovers account connectors with `claude mcp list` (parses
  "claude.ai Figma: https://… - ✔ Connected" lines; normalizes to tool-prefix
  form e.g. `claude_ai_Figma`; excludes our own `thepack` server) at startup +
  every 5 min, and reports them on the heartbeat (`connectors: [...]`).
- `POST /api/agent-gateway/heartbeat` accepts optional `connectors` array
  (validated `[A-Za-z0-9_-]+`, deduped, max 30) → stored on new
  `Agent.availableConnectors String[]` (`available_connectors`, db push done).
- Connectors card (`dashboard/agents/[slug]/page.tsx`) now renders the DETECTED
  list (fallback: curated KNOWN_CONNECTORS before first report; approved-but-
  undetected entries stay visible), with generic label prettification for
  unknown ones ("claude_ai_Microsoft_365" → "Microsoft 365"), plus a **Refresh
  button** (re-fetches agent) and copy explaining local tools are always on.

### Verified
- Discovery (bogus-key runner, real `claude mcp list`): found all 4 account
  connectors incl. newly-added Microsoft 365; bogus key correctly 403'd.
- Real-key heartbeat with connectors → DB `available_connectors` populated →
  GET /api/agents/[slug] exposes it → agent page 200.

### ⚠️ Noticed during verification
`Claude 1.allowed_connectors` came back EMPTY (yesterday's Figma approval gone) —
suspect today's `prisma db push` or an accidental empty save. Not silently
restored; owner should re-tick Figma in the UI (which also exercises the new
card). Worth watching whether db push resets String[] defaults again.

### Still open
- "change colour" IMAGE_EDITING order still stuck RUNNING (would likely succeed
  now that local tools are allowed alongside connectors — needs a runner restart
  and possibly a re-dispatch once its execution is reset).
- All changes LOCAL — not committed/pushed.

---

## 2026-07-18 (later 2) — Stuck "change colour" task RESCUED under the new permission model

### Result
The IMAGE_EDITING order stuck since morning completed autonomously end-to-end:
execution COMPLETED, auto-review **100%**, delivered `controller_blue.png`
(1280×1707, 1.5 MB). Quality is genuinely good: white controller body recolored
to vivid blue with lighting/shading/plastic texture preserved; the blue paw-print
thumbstick caps and background (mousepad/desk) untouched.

### Why it worked now (validation of the new model)
- Agent used REAL local pixel tools via Bash (U2Net/rembg segmentation +
  luminance-preserving tint gated by saturation, feathered mask) — possible only
  because LOCAL_TOOLS are now always allowed alongside the approved Figma
  connector (the old either/or conflict was the original cause of the hang).
- Owner had re-ticked Figma through the NEW Connectors UI (whoami → runner log
  `connectors approved by owner: claude_ai_Figma`) — full UI→runner loop works.

### ⚠️ Plumbing gap discovered: delivering LARGE local files
The 1.4 MB PNG couldn't go through `upload_file` base64 (too big for a tool
argument), and `sourceUrl` correctly REJECTED localhost + tmpfiles.org (SSRF
allowlist held — good). The agent improvised: uploaded the PNG as a Figma asset
and passed the Figma screenshot URL as sourceUrl (figma.com is allowlisted), so
the server pulled full resolution. Clever but fragile/roundabout.
**Proper fix (TODO):** `upload_file` should accept a local `filePath` — the MCP
server child runs on the same machine as claude, so it can read the file and do
the multipart POST directly. No base64 through the model, no external hop.

### Side artifacts of the run (harmless, cleanable)
- A Figma draft file "ThePack - Blue Controller Delivery" used as transfer host.
- Agent also briefly started (and shut down) a temporary local HTTP server while
  exploring delivery options.

### State
- Servers: dev server :3100 still running; runner stopped after the job.
- All changes LOCAL — not committed/pushed.

---

## 2026-07-18 (later 3) — Task page now links to its order (deliverables were invisible)

User (as publisher) opened their "change colour" TASK page and asked "这个output
怎么没有图片啊" — deliverables render on the ORDER page ("Delivered Files"), but
the task detail page gave NO route to it, even though `GET /api/tasks/[id]`
already includes the order. Same orphan-navigation class as the earlier audit.

Fix in `src/app/dashboard/tasks/[id]/page.tsx`:
- `Task` interface now carries `order { id, status, agent{name,slug} }`.
- New right-column "Work in progress" card whenever `task.order` exists —
  shows which agent is on it + a "View order & deliverables" button →
  `/dashboard/orders/[id]`.

Verified: task page 200 as publisher; API confirms order (REVIEW, Claude 1).
LOCAL only — not committed/pushed.

---

## 2026-07-18 (later 4) — Everything sandbox-validated for tomorrow's test; filePath upload lands

### Context
User pointed out (correctly) that all recent tests ran BARE-METAL on the host —
the Docker sandbox hadn't run since 07-16, so none of this week's features were
container-validated. Mandate: fix everything tonight, validate in the sandbox,
so tomorrow's test passes directly.

### Code changes
1. **`upload_file` now takes `filePath`** (the proper fix for large local files):
   - `thepack-mcpb/src/server.ts`: new optional `filePath` param — ABSOLUTE path;
     preference order filePath > sourceUrl > base64 (base64 = tiny files only).
   - `thepack-mcpb/src/api-client.ts`: reads the file from disk (the MCP server
     runs beside the model's workspace) and streams multipart — zero bytes
     through the model, any size works.
   - `runner.ts` WORK_PROMPT: locally produced files → filePath; Figma
     screenshots → sourceUrl; base64 last resort.
2. **Sandbox**: Dockerfile adds `python3-pip python3-venv` (agent can pip-install
   extras like rembg); `sandbox/.env` THEPACK_SERVER_URL →
   `http://host.docker.internal:3100` (port change).
3. **`the-pack-main/start-dev.bat`**: starts dev server with PORT=3100 +
   NEXT_PUBLIC_APP_URL (3000 is Windows-excluded-range; 3100 is the standard now).

### Sandbox validation (all in-container, fresh image build)
- Container reaches host platform on 3100 ✓; whoami → approved Figma ✓.
- **Connector discovery works IN the container**: `claude mcp list` found all 4
  account connectors with only `.credentials.json` copied — connectors are
  account-level, no `~/.claude.json` needed. ✓
- Task A "rich gradient poster" (local Pillow): delivered **2.88 MB** 1600×900
  PNG via the NEW filePath path (2× the size that hung yesterday), full-canvas
  gradient + centered text, auto-review **100%**. ✓
- Task B "Figma diagram as PNG": FigJam board → get_screenshot → sourceUrl →
  5.7 KB PNG delivered, auto-review **100%**. Both jobs done in one claude run,
  ~2.5 min total. ✓
- Everything shut down after validation (container down, dev server stopped).

### How to test tomorrow (works out of the box)
1. Double-click `the-pack-main/start-dev.bat` (platform on http://localhost:3100).
2. `thepack-mcpb/sandbox/start.bat` (rebuilds image if needed, copies login, runs).
3. Publish a task as alex@example.com / assign as marco@agents.io (password123),
   or use existing accounts — image, text, and Figma-as-PNG tasks all validated.
4. Deliverables: task page → "View order & deliverables" → Delivered Files.

### Notes
- Port 3100: Windows reserved ranges can shift after reboot; if 3100 ever hits
  EACCES, pick another port and update start-dev.bat + sandbox/.env together.
- All changes LOCAL — not committed/pushed (per no-auto-push rule).

---

## 2026-07-18 (later 5) — File-pipeline scaling assessed; object storage added to pre-launch list

### Question raised (user)
Does the platform-relay file path (agent → platform → viewers) have enough
pipeline width for production?

### Assessment of current implementation (code-verified)
- `/api/agent-gateway/files/upload` and `/api/files/[key]` both buffer WHOLE
  files in memory (`fs.readFile`/arrayBuffer → Buffer) — no streaming, no Range.
- Storage = platform-local disk (`src/lib/storage.ts`) — single-machine bound;
  breaks on multi-instance deploys and serverless (ephemeral FS).
- Every download passes through the Node process → platform pays bandwidth
  twice and the app server moonlights as a file server.
- Verdict: FINE for dev/demo (single machine, image-sized files, few users);
  REAL bottleneck for production or video-sized deliverables.

### Pre-launch TODO (added): migrate to object storage + presigned URLs
- `storage.ts` was deliberately built as a swappable layer — rewrite its
  read/write/getFileUrl against S3 / Supabase Storage / R2.
- Upload: platform issues presigned PUT; agent uploads DIRECTLY to storage
  (bytes never touch the platform server). Download: presigned GET / CDN URL.
- Estimated effort: ~0.5–1 day.
- Optional interim mitigation (1h): switch `/api/files/[key]` to
  `createReadStream` streaming + Range support to kill the memory hotspot.

### Pre-launch checklist (consolidated)
1. Object storage + presigned URLs (this entry).
2. Platform-side leak scanner for deliverables.
3. Hardened egress mode validated on real Docker.
4. Real Stripe payments.
5. Pricing rule unification (assign uses task.budget vs claim uses basePrice).

No code changed in this entry. All work remains LOCAL — not committed/pushed.

---

## 2026-07-20 — Sandbox image-EDITING test passed; runner watchdog added (real hang bug)

### Full flow validated in the Docker sandbox (image editing w/ attachment)
- Publisher (alex) uploaded a 600×400 red-circle PNG as a task-input attachment
  (`POST /api/files/upload` bucket=task-inputs → fileId → task `fileIds`), task
  type IMAGE_EDITING "recolour red→green", assigned to Claude 1 (marco).
- Sandbox agent: fetched the input image, recoloured the circle red→green with
  Pillow, verified background/text/position unchanged, uploaded via the new
  filePath path, submitted. Delivered `red_circle_green.png` 600×400, auto-review
  **0.964**. Output visually correct. ✅ (exercises BOTH input upload and output.)

### REAL BUG found + fixed: runner had no timeout on a hung claude
- Symptom: first attempt hit `API Error: Connection closed mid-response` → exit 1
  (recoverable, runner retried). Second attempt HUNG — claude neither exited nor
  errored (stalled API response stream). `runClaude()` only resolved on
  child close/error, so the promise never settled, `busy` stayed true FOREVER,
  and the runner silently stopped taking any work. One network hiccup = permanent
  wedge.
- Fix (`thepack-mcpb/src/runner.ts`): added a watchdog — spawn is `detached` on
  POSIX (process-group leader) so on timeout we `kill(-pid, SIGKILL)` the whole
  tree; resolve() is now idempotent (`settled` guard) across close/error/timeout.
  Timeout = `CLAUDE_TIMEOUT_MIN` (default 15; sandbox compose sets 8). A hung run
  is now killed and the job retried instead of wedging the runner.
- `sandbox/docker-compose.yml`: passes `CLAUDE_TIMEOUT_MIN` (default 8).
- After the fix + container rebuild, the retry completed cleanly (exit 0).

### Environmental note (NOT our bug)
The `Connection closed mid-response` drops happened only in the CONTAINER, not
bare-metal. MTU is 1500 both sides and the API is reachable — looks like
transient instability on the long streaming connection through Docker Desktop's
NAT (or an Anthropic-side blip that morning). The watchdog makes the runner
resilient to it regardless. Worth watching; if frequent, investigate Docker
Desktop networking / consider a lower MTU on the container.

### Minor bug fixed
`POST /api/tasks` returned the pre-update task object, so its `inputFiles` came
back `[]` even when attachments linked fine (DB was correct; task pages re-fetch
so were unaffected). Now reflects the linked files in the response.

### State
- Services LEFT RUNNING for continued testing: platform :3100 + sandbox container.
- All changes LOCAL — not committed/pushed.

---

## 2026-07-20 (later) — filePath INPUT side done + validated with an 8 MB image

### Change: input attachments no longer base64-through-model (mirrors the output fix)
`get_input_file` used to return the whole binary as base64 inline in the tool
result → for large images that floods the model context (slow/expensive/can
exceed the window). Now symmetric to the filePath upload:
- **Platform** `GET /api/agent-gateway/files/[fileId]?raw=1` streams raw bytes
  (Content-Type + Content-Disposition). Old JSON/base64 response kept for
  back-compat (no `?raw`).
- **`thepack-mcpb/src/api-client.ts`**: new `downloadInputFile(fileId, destDir)`
  — fetches `?raw=1`, writes the file into destDir, returns
  `{ filePath, filename, contentType, size }`.
- **`thepack-mcpb/src/server.ts`** `get_input_file`: downloads into `process.cwd()`
  (the per-job workspace Claude runs in) and returns the absolute `filePath`;
  for small text files (≤512 KB) also includes `content` inline. No large base64.
- **`runner.ts`** prompt step (a): open inputs by filePath (e.g. Pillow).

### Validated in the Docker sandbox with a genuinely large file
- Input: 2000×1500 incompressible random-noise PNG, **7.97 MB** (base64 would be
  ~11 MB / millions of tokens — impossible under the old path).
- IMAGE_EDITING "recolour the red box → green"; sandbox agent downloaded via
  filePath, edited with Pillow, uploaded the **8 MB** result via filePath,
  submitted. order=REVIEW, exec=COMPLETED, auto-review **0.964**.
- **Pixel-level verification** (input vs output, both 1500×2000):
  - box centre (220,20,20) red → (20,180,20) green ✓
  - background pixels bit-identical (corner + far pixel unchanged) ✓
  - changed pixels = 209,081, ALL inside the box bbox x[751..1249] y[541..959];
    **changes OUTSIDE the box region = 0** ✓ (noise background untouched)
  - visual crop confirms green fill + intact black border on noise.

### Net effect
Both directions of the file pipeline (input download + output upload) now keep
bytes OUT of the model context → large images work end-to-end. (Platform-side
scaling — whole-file-in-memory, single-disk — is still the separate object-storage
pre-launch TODO; unaffected by this change.)

### State: services still UP (platform :3100 + sandbox). LOCAL only — not pushed.

---

## 2026-07-20 (later 2) — Skill A/B test (core value prop) + FIRST validation that skills work in the sandbox

### What & why
Demo the "rent an agent = also rent its skills" value prop: same banner brief run
twice — no skill vs with a brand-design skill. Also the first real test that a
skill placed in the owner's ~/.claude/skills actually reaches and is used by the
containerized agent (previously the skills dir was empty, so untested).

### Setup
- Authored `~/.claude/skills/thepack-banner-design/SKILL.md` — a ThePack brand
  system (exact palette hex, asymmetric left-weighted layout grid, type hierarchy,
  cyan accent bar, concentric-ring motif, "ThePack" wordmark). Brief given to the
  agent contained ONLY copy + theme, none of the design rules.
- Added `fonts-dejavu-core` to the sandbox Dockerfile (fair text baseline).
- Control: same container. Run 1 with claude-home/skills EMPTY; Run 2 after copying
  the skill into claude-home/skills (claude re-scans skills per run — no rebuild).

### Result — skill IS discovered & applied in the container ✅ (first proof)
- Run 2's own summary: "following the ThePack brand design system (diagonal
  indigo→violet gradient, asymmetric left-aligned text with cyan accent bar,
  subtle ring motif, ThePack wordmark)" — i.e. it invoked the skill.
- Pixel proof of brand compliance (gradient corners):
  - Run 2 (skill): top-left #201B4E ≈ brand indigo #1E1B4B ✓, bottom-right
    #7939E9 ≈ brand violet #7C3AED ✓ — exact palette.
  - Run 1 (no skill): #080C20 → #361E5A — its OWN colors; violet endpoint does
    NOT match brand.
- Run 2 has the "ThePack" wordmark + concentric-ring motif per spec; Run 1 has
  neither (it invented a "PRODUCT LAUNCH" eyebrow + a CTA button, its own node-graph
  motif). Both 1600×600, auto-review passed.

### Honest finding for positioning
The no-skill baseline is ALREADY a professional-looking banner — the base model is
very strong. So the skill's demonstrated value is NOT "prettier" but **brand-spec
compliance + consistency/repeatability**: with the skill every banner hits the
exact ThePack palette/layout/wordmark; without it each run is a different, generic
interpretation. That's the more accurate (and B2B-compelling) way to pitch skills.

### Artifacts: banner_noskill.png / banner_skill.png (scratchpad). Services still UP.
### LOCAL only — the skill lives in ~/.claude/skills (not the repo). Dockerfile font change committed-pending.

## 2026-07-20 (later 3) — UI / HTML deliverable pipeline: deliver + LIVE PREVIEW

### What & why
Validate a full UI-delivery chain: publish a task → containerized agent builds a
self-contained web page → publisher opens the order and PREVIEWS the live page.
Ran 4 iterative UI tasks (counter / color-picker / greeting / stopwatch) and fixed
every content-type / preview gap found along the way.

### Fixes (three root causes, one per early iteration)
1. `src/lib/storage.ts` — `detectContentType` now knows `.html/.htm/.css/.js`
   (was returning octet-stream → served/downloaded, never previewed).
2. `api/agent-gateway/files/upload/route.ts` — normalize the served content-type:
   content-sniff the first 512 bytes (`<!doctype html>` / `<html`) → force
   `text/html`, else trust a known file extension over a generic caller type.
   Fixes agents that tag a page `text/plain` or name it `index.html.txt`.
3. `api/agent-gateway/executions/[executionId]/submit/route.ts` — same HTML
   sniffing on the INLINE `outputFiles` path (data: URIs), so an inlined page
   becomes `data:text/html` (live) instead of `data:text/plain` (source text).
4. `dashboard/orders/[id]/page.tsx` — delivered web pages now render in a
   **sandboxed `<iframe sandbox="allow-scripts">`** (JS runs, no same-origin →
   can't touch this site's cookies/DOM) + Open-in-new-tab / Download affordances.
5. Clean file-deliverable path end to end: `submit_result` MCP tool + api-client +
   submit route accept `fileIds` (upload_file → pass id to submit_result); runner
   web-branch prompt tells the agent to deliver ONE self-contained `index.html` as
   an UPLOADED FILE (contentType text/html) and NOT inline it or rename to .txt.

### Result — verified ✅
v4 "stopwatch" delivered with `type=text/html` (`data:text/html;…base64,PCFE…` =
`<!DOCTYPE html>…`), order page compiles 200, live sandboxed iframe preview works.
NOTE: v1–v3 were delivered DURING the iterative fixing, so they're frozen with the
pre-fix (broken) type/name (`text/plain`, `index.html.txt`) and preview blank —
EXPECTED; stored delivery records don't retro-update. Only NEW deliveries get the
fix (v4 proves it).

### Also (Desktop-skill bridging, from earlier this session)
`thepack-mcpb/sandbox/collect-skills.ps1` (NEW) merges `~/.claude/skills` + Claude
Desktop account skills (`%LOCALAPPDATA%\Packages\Claude_*\…\skills-plugin`) into
claude-home/skills (dedup by name, latest-wins); start.bat/start.sh call it.

### LOCAL only — nothing committed before this commit. Services stopped.

## 2026-07-20 (later 4) — Skill A/B #2: apple-design (Desktop skill) in the SANDBOX

### What & why
Second skill A/B, this time proving a Claude **Desktop account** skill reaches the
container (via collect-skills.ps1) AND changes the deliverable. Task chosen to
maximise visible difference: an interactive iOS-style **bottom sheet** (single
self-contained index.html). Brief stated WHAT (a sheet you drag up/down, flick to
dismiss, smooth/polished) but NOT HOW (no mention of springs/momentum/materials),
so any fluid-motion technique is the skill's own contribution. Both runs went
through the real Docker sandbox + delivery pipeline.

### Setup (clean A/B, same container)
- Baseline (task [noskill]): claude-home/skills EMPTY.
- Skill (task [appleskill]): ran collect-skills.ps1 → pulled 13 skills incl
  apple-design from the Claude Desktop package path; container saw apple-design.
- Both delivered as index.html, type=text/html (preview pipeline works end-to-end).

### Result — skill discovered & applied ✅ (code fingerprints, same brief)
| fingerprint            | no-skill | apple skill |
| requestAnimationFrame  |    0     |    2   |
| velocity               |    0     |   14   |
| spring                 |    0     |    4   |
| backdrop-filter (glass)|    0     |    5   |
| will-change            |    0     |    2   |
| CSS transition         |    4     |    1   |
| cubic-bezier           |    1     |    0   |
Skill version wrote a real spring solver (springTo w/ damping+response),
estimateVelocity() from pointer history, the WWDC momentum-projection formula
project(v,decel)=v/1000*decel/(1-decel), iOS rubberband() boundary resistance,
velocity-based flick detection (releaseVelocity>300 => dismiss), and frosted-glass
material. Baseline = fixed-duration CSS transition + class toggle, left-aligned flat
white sheet. Visual: skill = iOS grouped inset table, right-aligned values, pill
button, translucent material; baseline = plain white sheet. Motion (momentum/
interruptible spring) only observable live — headless stills can't freeze the JS
spring (itself evidence it's physics-driven, not a CSS snap).

### Artifacts (scratchpad): sheet_noskill.html / sheet_skill.html, shot_*.png.
### Orders: [noskill]=cmord396901a0db2730db85c3245d [skill]=cmorde2ecbf147129afdcd48a22db
### Sandbox delivery pipeline validated end-to-end. Services left UP for cross-machine test. Nothing committed.

## 2026-07-20 (later 5) — Skill A/B #3: apple-design on a FULL landing page

### Why
Bottom-sheet A/B showed a big diff but few elements. Richer test: a complete
"Cadence" marketing landing page (nav/hero/features/stats/pricing/CTA/footer),
single self-contained index.html. Same rules: brief = content only, no style words.
Clean isolation: skill run had ONLY apple-design in the sandbox (not the full 13).

### Result — visible stylistic difference, subtler than the interactive case
Both pages are complete & professional (base model is strong). apple-design's mark
on a STATIC page = RESTRAINT + typographic discipline, not more decoration:
- Color: no-skill leans on a loud violet gradient everywhere; skill uses a neutral
  warm-grey canvas + ONE blue accent, gradients used sparingly.
- Pro pricing card: no-skill = purple-outlined white card; skill = solid BLACK
  high-contrast card (classic Apple premium signaling).
- Bands: no-skill = bright violet stats + dark glowy CTA; skill = restrained deep-navy
  stats + calm soft-lavender CTA.
- Typography: skill letter-spacing count 14 vs 8 (tracking discipline).
- Interaction: skill explicitly wrote spring-based press feedback (scale(.97) on
  :active, lift+shadow) per the skill; only felt on click.
Fingerprints (noSkill/skill): backdrop-filter 1/2, cubic-bezier 0/1, transition 7/9,
letter-spacing 8/14, linear-gradient 6/7, box-shadow 13/16. Sizes ~24KB each.

### Takeaway for positioning
apple-design pays off MOST on interactive/motion work (bottom sheet: real spring
physics, momentum, rubber-band — objective, dramatic). On static visual pages its
value is real but taste-based: restraint, color discipline, typographic tracking,
strategic high-contrast. Pitch skills accordingly per task type.

### Orders: landing[noskill]=cmord988e41f649b229ea7df15ef9  landing[skill]=cmorde8b401818a05f5d853b695ff
### Artifacts: land_noskill.html/land_skill.html, page_noskill.png/page_skill.png (scratchpad). Services UP. Nothing committed.

## 2026-07-20 (later 6) — New task type: CUSTOM (unrestricted output)

### Why
A general-purpose task type for testing/anything: the publisher defines the
deliverable, no output-format restriction (HTML page, code file, image, mixed
text+files — whatever the brief/outputFormat says).

### Changes
- prisma/schema.prisma: enum TaskType += CUSTOM; DB `ALTER TYPE "TaskType" ADD
  VALUE 'CUSTOM'` applied; `npx prisma generate` (client + enums.ts updated).
- src/lib/task-types.ts: TaskTypeId += CUSTOM; TASK_TYPES entry "Custom Task"
  (Sparkles icon, acceptsInputFiles, NO outputFileTypes) → auto-appears in the
  task wizard with the free-text "Expected Output Format" field (no restriction).
- src/app/api/tasks/route.ts: createTaskSchema zod enum += CUSTOM.
- src/app/api/agents/route.ts: agent supportedTaskTypes zod list += CUSTOM.
- src/lib/auto-review.ts: early CUSTOM branch — lenient review (only output_exists
  + no error markers; passes any format). Publisher review is the real gate.
- Runner needs NO change: it already delivers by the brief/outputFormat
  ("publisher's stated output format wins over the task type").
- DB: added CUSTOM to Claude 1 agent supported+accept task types (for testing).

### tsc --noEmit clean. Committed to feature/ui-html-delivery-preview.

## 2026-07-21 — Cross-machine demo hardening: LAN dev origins + login redirect

### The big one: LAN access was completely broken (blocker for the two-laptop demo)
Opening the app from ANOTHER machine on the LAN loaded the HTML but React never
hydrated — buttons did nothing and the login form fell back to a native submit
(page "flashed", inputs cleared, stayed on /login). Correct password or not made
no difference, which is the tell: the JS handler was never attached.

Root cause: **Next 16 blocks cross-origin requests to dev-only assets** (`/_next/*`,
the HMR socket) from any origin other than the one the server booted on (localhost).
Console showed the HMR websocket failing against the LAN IP. Only reproducible over
the LAN IP — localhost was always fine, which is why it looked like a phantom.

Fix: `next.config.ts` sets `allowedDevOrigins` by **enumerating this machine's
non-internal IPv4 addresses at startup** rather than hardcoding one, because the LAN
IP changes with the network (venue WiFi vs phone hotspot). A relaunch picks up the
new IP. Verified over the LAN IP with a headless browser: demo-account button now
fills the form, login redirects to /dashboard, and the full publish wizard completes.

### Also fixed: login/register redirect race
`router.push(...)` followed immediately by `router.refresh()` — the refresh could
cancel the pending navigation, so a correct password sometimes just sat there.
Both pages now use `window.location.assign()`: logging in changes the session
cookie, so a full document load (re-rendering every server component against it) is
the right behavior anyway. Unused `useRouter` imports removed. `tsc --noEmit` clean.

### Runner watchdog raised 8 -> 15 min (sandbox/.env, gitignored)
A task with TWO complex interactions (inertial horizontal scroller + bottom sheet)
blew the 8-min watchdog twice and the runner retried forever, burning quota each
time. Lesson for demos: ONE interaction per task, and add "Do not try to run a
browser, install packages, or set up any tooling" (the agent kept adding a browser
test step it cannot perform in the container).

### Verified end-to-end, twice, including a real two-machine rehearsal
Publish from another laptop (alex) -> "Take task" clicked in a real browser (marco)
-> sandbox agent picks up in ~7s -> delivers index.html (text/html) -> live preview.
Work time 3m55s and 4m5s for the slimmed "Kyoto trip details panel" task — well
inside the 15-min watchdog. apple-design fingerprints in the delivered file:
velocity 23, spring 20, backdrop-filter 4, rubberband 3, momentum projection 5 —
none of those words appear anywhere in the brief.

### Demo timing note
~4 min of agent work is 40% of a 10-min slot. Don't stand in silence: the task page
shows the agent's own plan ticking off live — narrate the Claude Code workflow over it.

### Cleanup: deleted the failed oversized task + a leftover smoke-test task, and
### refunded its $100 frozen escrow (deleting an order otherwise locks it forever).

## 2026-07-22 — "Open in a new tab" for delivered pages + an honest A/B correction

### Open delivered HTML in its own tab (new route)
An inline deliverable is stored as a `data:` URI, and browsers refuse to open a
`data:` URL as a top-level navigation — so a delivered web page could only ever be
previewed in an iframe. Added `GET /api/deliverables/[executionId]/[name]`, which
re-serves the stored content from a real URL with a real Content-Type (decoding the
data URI; uploaded files redirect to their storage URL). The order page now shows an
explicit "Open" button for HTML deliverables, and the iframe preview points at the
same URL.

Access is limited to the order's publisher, the agent's owner, or an admin.
Security: the payload is agent-authored HTML, so it is served under
`Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups`, which
parks the document in an opaque origin — scripts run, but it cannot act as this site
against the signed-in user's session. Verified: 200 + text/html + CSP header, and
401 without a session.

NOTE: it lives under `/api/deliverables/` and not `/api/executions/` because that
segment already uses an `[orderId]` slug and Next forbids two slug names at the same
path position (the dev server refuses to boot).

### Honest correction: the full-page A/B does NOT demonstrate the skill
Ran the identical "Wander" landing-page brief twice — skills dir empty vs only
`apple-design`. Result: effectively no attributable difference.
- Fingerprints: velocity 4/4, spring 1/1, rubber-band 0/0, momentum projection 0/0,
  pointer capture 2/2; the BASELINE used more letter-spacing (13 vs 8).
- Both independently produced the same structure AND both chose a black "most
  popular" pricing card — which invalidates the earlier 2026-07-20 note attributing
  that black card to the skill. Colour (coral vs violet) is run-to-run variation.
- Times: no-skill 4m38s, with-skill 7m05s.

Why: a marketing landing page never exercises gesture physics, which is what
`apple-design` is actually about, and the base model is already strong at static
page design. The skill's effect is only large on interaction-heavy tasks — the
focused Kyoto bottom-sheet pair still shows velocity 0→23, spring 0→20,
rubber-band 0→3, momentum projection 0→5.

Takeaway for the demo: present the landing page as "the agent autonomously builds a
complete product page", NOT as a skill A/B; use the sheet pair (side-by-side source)
if the skill's value needs demonstrating.

### demo-assets/ added (durable, was previously only in a temp scratch dir)
Both Wander runs + renders, the Cadence pair, the Kyoto sheet pair, the exact task
brief, and a README documenting all of the above including the correction.

### Services stopped. tsc --noEmit clean.

## 2026-07-22 (later) — Selectable agent model + the A/B that actually works

### CLAUDE_MODEL: the rented agent's model is now configurable
`runner.ts` passes `--model` to the `claude` CLI when `CLAUDE_MODEL` is set
(alias `opus` | `sonnet` | `fable`, or a full model name; empty = account default).
Plumbed through `sandbox/docker-compose.yml` and `sandbox/.env`, and the startup
banner now prints it: `Brain: local 'claude' CLI, model=sonnet (...)`.

### Why it matters: on a top model, a skill has nothing left to add
The earlier landing-page A/B on opus came out equivalent with vs without
`apple-design` because opus already designs well unaided. Re-ran on **sonnet** with
a deliberately thin brief (list the sections, ask for "Apple's design language",
no other guidance) and the skill's contribution became clearly visible:

| | no skill | with skill |
|---|---|---|
| canvas | dark theme (the stock "dark = premium" read of *Apple*) | light canvas + grey section bands, as apple.com actually does |
| CTA | two filled buttons | blue pill + text link with chevron — Apple's real pattern |
| destinations row | 5th card clipped off-screen (layout bug) | all five fit |
| letter-spacing | 6 | 11 |
| cubic-bezier | 0 | 3 |
| prefers-reduced-motion | 0 | **1** |

`prefers-reduced-motion` is the strongest evidence: accessible motion degradation is
an explicit section of the skill and only the skill run implemented it — knowledge
arriving from the skill, not taste. Work time 3m18s vs 3m43s, roughly half of opus
(4m38s / 7m05s), which also suits a 10-minute stage slot better.

Note the brief here DOES ask for Apple style, unlike the earlier experiments. That
makes it a fairer product question — "when the customer asks for Apple style, does
the skill deliver it more authentically?" — since both runs attempt it.

### demo-assets/: the sonnet pair is now the PRIMARY material (PRIMARY_* files),
### with the README documenting the comparison, the reasoning for using sonnet, and
### which pairs must NOT be presented as skill A/Bs.

### Services stopped.

## 2026-07-22 (later 2) — Demo deck, script, runbook + enhanced apple-design skill

Presentation-day materials, all in demo-assets/:
- presentation.html — self-contained scrollytelling deck (dark control-room look,
  violet=agent / cyan=skill colour coding, hand-drawn flow diagrams, the 5-step
  workflow loop). Double-click → F11.
- speech.md — casual ~8–9 min talk script, aligned section-by-section with the deck.
- RUNBOOK.md — exact startup flow (start-dev.bat + start.bat), the 30-sec verify
  (the "click Alex button" LAN-hydration check), demo steps, and every gotcha.
- apple-design_SKILL_enhanced.md — ARCHIVE COPY of the improved skill (the live
  skill lives in the user's Claude Desktop path, outside this repo, so it's copied
  here to preserve it). Added section 18 "The Apple web look" — concrete visual
  tokens (light canvas #fbfbfd, band #f5f5f7, pill+chevron CTA, frosted nav,
  weight-600 type, the six signature "tells") because the skill was ~all motion and
  little static-visual guidance, which is why earlier landing-page A/Bs were subtle.
- _compare/1_NO-skill, 2_OLD-skill, 3_NEW-skill — the three landing pages showing
  the skill enhancement's effect (sonnet).

Key finding this session: switching the agent model to sonnet (via CLAUDE_MODEL) +
the enhanced skill makes the with/without-skill difference clearly visible; on opus
the skill added little because the base model already designs well.

Nothing else changed in the app code. Committed to feature/ui-html-delivery-preview.
## 2026-07-31 — Multi-round Revision System (v0.9.11)

### Summary
Publishers can now **request revisions** instead of only accepting or disputing.
The agent reworks the delivery based on publisher feedback (text + file attachments),
and resubmits. Configurable round limits with paid extra-round purchase.

### Flow
```
Agent submits → auto-review → Order=REVIEW → Publisher decides:
  ├─ Accept & Pay        → settle (unchanged)
  ├─ Request Revision    → snapshot delivery → Execution=RUNNING (reset)
  │                        → Order=REVISION_REQUESTED → agent re-does work
  │                        → agent resubmits → Order=REVIEW (loop)
  └─ Dispute             → freeze funds (unchanged)
```
Maximum rounds = `task.maxRevisions` (default 3) + `order.extraRevisions` (purchased).
Each revision resets deadline to 50% of original `deadlineHours` (min 1 hour).

### Schema changes (`prisma/schema.prisma`)

**New enum value**: `OrderStatus.REVISION_REQUESTED`

**New fields**:
- `Task.maxRevisions` (`Int @default(3)`) — publisher sets at task creation
- `Order.currentRound` (`Int @default(1)`) — tracks current submission round
- `Order.extraRevisions` (`Int @default(0)`) — paid additional rounds
- `File.revisionId` (`String?`) — links feedback files to a revision

**New model: `Revision`**
```prisma
model Revision {
  id              String   @id @default(cuid())
  orderId         String   @map("order_id")
  round           Int                              // which round was revised
  feedback        String                           // publisher's text instructions
  previousScore   Float?   @map("previous_score")  // snapshot of prior auto-review score
  previousFiles   Json?    @map("previous_files")  // snapshot of prior outputFiles
  createdAt       DateTime @default(now())

  order           Order    @relation(...)
  feedbackFiles   File[]   @relation("RevisionFeedbackFiles")  // attached reference files

  @@map("revisions")
}
```

### New API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/reviews/[orderId]/revision` | Publisher requests revision (body: `{ feedback, fileIds? }`) |
| `POST` | `/api/orders/[id]/add-revisions` | Publisher purchases extra rounds (body: `{ rounds }`, cost: 10% of budget/round) |
| `GET`  | `/api/agent-gateway/executions/[id]/revision-feedback` | Agent fetches latest revision feedback |

### Modified API endpoints

| Path | Change |
|------|--------|
| `GET /api/agent-gateway/jobs` | Now includes `REVISION_REQUESTED` orders; response adds `currentRound`, `maxRevisions`, `extraRevisions`, `isRevision`, and `revision` (feedback + files) |
| `POST /api/agent-gateway/executions/[id]/submit` | `review.create` → `review.upsert` (resets user decision on re-submit) |
| `POST /api/tasks` | Accepts `maxRevisions` field (default 3) |
| `GET /api/orders/[id]` | Includes `revisions` with `feedbackFiles` in response |

### MCP Bridge changes (`thepack-mcpb/`)

- **New tool**: `get_revision_feedback` — agent reads publisher feedback + attached files
- **`runner.ts`**: WORK_PROMPT now detects revision jobs (`currentRound > 1`), instructs agent to read feedback first and redo accordingly
- **`api-client.ts`**: `getRevisionFeedback(executionId)` method
- **THEPACK_TOOLS**: `get_revision_feedback` added to allowlist

### Frontend changes

| File | Change |
|------|--------|
| `review/page.tsx` | Third button "Request Revision" (amber) with feedback form (textarea + file upload), round counter badge, revision history below deliverables |
| `orders/[id]/page.tsx` | Round badge in header, `REVISION_REQUESTED` timeline event, revision history card (right column), "Buy Extra Rounds" button, auto-refresh for revision status |
| `order-status-badge.tsx` | Added `REVISION_REQUESTED` (orange) and `FUNDED` (sky) status colors |
| `task-wizard.tsx` | "Revision Rounds" picker (0/1/2/3/5 presets, default 3) in Step 3 |
| `file-upload.tsx` | Added `revision-feedback` to bucket type union |

### Storage changes

| File | Change |
|------|--------|
| `storage.ts` | New `revision-feedback` bucket (images + PDF + text, 10 MB limit) |
| `files/upload/route.ts` | `revision-feedback` added to server-side bucket allowlist |

### Design decisions

1. **Limits not hardcoded**: `maxRevisions` (x) per task, `extraRevisions` (y) per order; system supports arbitrary x and y for future market strategy flexibility.
2. **Execution reset**: On revision request, Execution.status → `RUNNING` so existing submit guard clause (`!= PENDING && != RUNNING`) naturally allows re-submission.
3. **Review upsert**: On re-submit, previous auto-review scores overwritten; user rating/comment/accepted fields reset to null.
4. **Snapshot before reset**: Each Revision record captures the previous auto-review score and outputFiles JSON for audit trail.
5. **Rich feedback**: Publishers attach files (images/PDFs) as revision reference; agent accesses them via `get_input_file`.

### State: committed and pushed.

## 2026-09-01 — Second brain: Nous Hermes Agent support (AGENT_CLI)

### What
ThePack agents can now be powered by **Nous Hermes Agent** instead of Claude Code,
at full parity: sandboxed, MCP-wired, same job loop, same delivery pipeline.
One switch picks the brain — `AGENT_CLI=claude` (default) or `AGENT_CLI=hermes`.

### Why it works at all
Hermes has the two things that made Claude Code sandboxable:
- **Headless one-shot**: `hermes -z "<prompt>"` — "print ONLY the final response
  … approvals are auto-bypassed. Intended for scripts / pipes." (= `claude -p`)
- **MCP**: `hermes mcp add <name> --command node --args …` so our 13 ThePack tools
  are callable. Bonus over Claude: `--usage-file` writes a per-run cost/token
  report (useful for marketplace accounting), plus `-m/--provider/--reasoning`
  and `-t TOOLSETS` (its equivalent of `--allowedTools`).

### Runner (thepack-mcpb/src/runner.ts)
- `runClaude()` → `runAgent()`, now CLI-agnostic: workspace, watchdog, streaming
  and cleanup are shared; only command construction branches.
- Hermes branch spawns **without a shell**, passing argv directly — its one-shot
  flag takes the prompt as an ARGUMENT (it cannot read stdin), and argv avoids
  every quoting/length problem a multi-KB prompt would hit through a shell.
- `ensureHermesMcp()` registers the ThePack MCP server at startup
  (remove-then-add = idempotent, picks up a changed key/URL). **Gotcha:**
  `mcp add` is interactive — it asks "Enable all N tools?" — so the runner
  answers `Y` on stdin, otherwise registration silently cancels.
- Connector discovery (`claude mcp list`) is skipped for Hermes: claude.ai
  connectors are a Claude-account concept.

### Sandbox
- Base image **node:20-slim → node:24-slim**: the Hermes installer rejects Node 20
  (wants 22.22+/24.11+/26+) and would otherwise download a second Node runtime.
- apt adds `curl ripgrep xz-utils build-essential` — **without a C++ compiler the
  installer cannot build node-pty and Hermes never lands** (first attempt failed
  exactly here).
- Installed as the `worker` user via `install.sh … --skip-setup` (non-interactive);
  binary at `~/.local/bin/hermes`, agent at `~/.hermes/hermes-agent`.
  `--build-arg INSTALL_HERMES=0` for a leaner Claude-only image.
- Credentials: `~/.hermes` holds the installed agent AS WELL AS the config, so it
  cannot be mounted over the way `./claude-home` is. Instead `./hermes-home` is
  mounted read-only beside it and the entrypoint copies `auth.json`,
  `config.yaml`, `shared/nous_auth.json` into place. start.bat seeds it from
  `%LOCALAPPDATA%\hermes`. **hermes-home/ added to .gitignore** (it holds a login).

### Platform
`CONNECTION_TYPES` += `HERMES` so an agent can record which brain it runs.

### Verified end to end (twice)
- Host: runner in Hermes mode → picked up the job → 4-step plan → progress →
  `submit_result` → **COMPLETED in 1m37s**, auto-review 88%.
- **Sandbox**: same flow inside the container → **COMPLETED in 1m27s**, auto-review
  88.2%, delivered a real markdown file. Container shows `hermes v0.21.3`,
  credentials injected, "ThePack MCP server registered with Hermes."
- `tsc` clean for platform and mcp.
