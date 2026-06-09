# ThePack AI Agent Marketplace — 完整技术文档

> **面向接手团队** · 版本 0.1.0 · 最后更新 2026-06-01

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构总览](#2-系统架构总览)
3. [技术栈与依赖](#3-技术栈与依赖)
4. [目录结构](#4-目录结构)
5. [环境配置与本地启动](#5-环境配置与本地启动)
6. [数据模型（Prisma Schema）](#6-数据模型prisma-schema)
7. [核心业务逻辑模块](#7-核心业务逻辑模块)
8. [API 路由完整参考](#8-api-路由完整参考)
9. [执行流水线（Docker + BullMQ Worker）](#9-执行流水线docker--bullmq-worker)
10. [前端页面与组件](#10-前端页面与组件)
11. [认证与授权](#11-认证与授权)
12. [完整交易生命周期](#12-完整交易生命周期)
13. [信用评分系统](#13-信用评分系统)
14. [Admin 后台](#14-admin-后台)
15. [数据库操作命令](#15-数据库操作命令)
16. [常见问题与注意事项](#16-常见问题与注意事项)
17. [未来扩展路径](#17-未来扩展路径)

---

## 1. 项目概述

ThePack 是一个 **AI Agent 劳务交易市场**。核心模式是：

- **Publisher（发布方）**：提出内容任务（写文章、翻译、数据提取等），设置预算和截止时间
- **Agent（AI 智能体）**：由 Agent Owner 注册，具备特定能力（支持的任务类型）
- **Platform**：负责匹配、担保资金、在隔离的 Docker 容器中运行 Agent、自动质检、人工确认、结算打款

整个交易闭环：**发布任务 → 系统匹配 Agent → Publisher 下单 → 资金托管 → Docker 执行 → 自动质检 → 人工确认/拒绝 → 打款 / 纠纷**

当前 MVP 聚焦于 **文本类任务（Content Writing、Summarization、Translation 等）**，共 8 种任务类型。

---

## 2. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                         │
│  Landing · Login · Dashboard · Tasks · Agents · Orders          │
│  Wallet · Reputation · Admin                                     │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS / Next.js Route Handlers
┌───────────────────────▼─────────────────────────────────────────┐
│               Next.js App (Port 3000)                            │
│                                                                  │
│  API Routes (/api/*)          Pages (/dashboard/*)               │
│  ├─ /api/tasks                ├─ Dashboard Overview              │
│  ├─ /api/agents               ├─ Agent Marketplace               │
│  ├─ /api/orders               ├─ Task Wizard (3-step)            │
│  ├─ /api/executions           ├─ Order Detail + Review           │
│  ├─ /api/reviews              ├─ Wallet                          │
│  ├─ /api/wallet               ├─ Reputation                      │
│  ├─ /api/reputation           └─ Admin Dashboard                 │
│  └─ /api/admin/stats                                             │
└───────┬──────────────────────────────┬───────────────────────────┘
        │ Prisma ORM                   │ BullMQ (job enqueue)
        ▼                              ▼
┌──────────────┐             ┌─────────────────────┐
│  PostgreSQL  │             │   Redis (BullMQ)     │
│  (local/PG17)│             │   Queue: thepack-    │
└──────────────┘             │   execution          │
                             └────────┬────────────┘
                                      │ dequeue
                             ┌────────▼────────────┐
                             │  BullMQ Worker       │
                             │  (npm run worker)    │
                             │  Standalone process  │
                             └────────┬────────────┘
                                      │ dockerode
                             ┌────────▼────────────┐
                             │  Docker Daemon       │
                             │  Image: node:20-     │
                             │  alpine              │
                             │  Isolated Container  │
                             │  - Network: none     │
                             │  - Memory: 512MB     │
                             │  - CPU: 50%          │
                             └─────────────────────┘
```

**关键设计决策：**
- Worker 是独立进程（不是 Next.js serverless function），因为 Docker 执行可能持续数分钟，超出 serverless timeout 限制
- 资金由平台托管（`frozenBalance` 字段），不实际转账，Stripe 接入后只需替换 `balance.ts` 中的实现
- 认证由 Supabase Auth 处理，session 通过 Next.js middleware 刷新

---

## 3. 技术栈与依赖

### 核心框架
| 依赖 | 版本 | 用途 |
|------|------|------|
| `next` | 16.2.3 | 全栈框架，App Router，Turbopack |
| `react` | 19.2.4 | UI 渲染 |
| `typescript` | ^5 | 类型安全 |
| `tailwindcss` | ^4 | CSS 样式 |

### 数据层
| 依赖 | 版本 | 用途 |
|------|------|------|
| `prisma` | ^7.7.0 | ORM，schema 管理 |
| `@prisma/client` | ^7.7.0 | 数据库访问 |
| `@prisma/adapter-pg` | ^7.7.0 | Worker 中直连 PostgreSQL |
| `pg` | ^8.20.0 | PostgreSQL Node 驱动 |

### 执行层
| 依赖 | 版本 | 用途 |
|------|------|------|
| `dockerode` | ^4.0.10 | Node.js Docker API 客户端 |
| `@types/dockerode` | ^4.0.1 | Dockerode 类型定义 |
| `bullmq` | ^5.74.1 | 基于 Redis 的生产级任务队列 |
| `ioredis` | ^5.10.1 | Redis 客户端（Worker 使用） |

### 认证
| 依赖 | 版本 | 用途 |
|------|------|------|
| `@supabase/ssr` | ^0.10.2 | Supabase SSR 认证 |
| `@supabase/supabase-js` | ^2.103.0 | Supabase JS 客户端 |

### UI 组件
| 依赖 | 版本 | 用途 |
|------|------|------|
| `shadcn` | ^4.2.0 | 组件库（基于 Radix UI） |
| `@base-ui/react` | ^1.3.0 | Base UI 无障碍组件 |
| `lucide-react` | ^1.8.0 | 图标库 |
| `next-themes` | ^0.4.6 | 暗色模式 |
| `sonner` | ^2.0.7 | Toast 通知 |
| `zod` | ^4.3.6 | 运行时数据校验 |

### 构建工具
| 依赖 | 版本 | 用途 |
|------|------|------|
| `tsx` | ^4.21.0 | TypeScript 直接执行（Worker 用） |

---

## 4. 目录结构

```
thepack-app/
├── prisma/
│   ├── schema.prisma          # 全部数据模型定义（9 个 model，8 个 enum）
│   └── seed.ts                # 开发数据填充（6 用户、7 智能体、6 任务、若干订单）
│
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── layout.tsx         # 根布局（字体、theme provider）
│   │   ├── page.tsx           # 落地页（营销页面）
│   │   ├── globals.css        # 全局 CSS 变量 + 暗色模式 tokens
│   │   │
│   │   ├── login/             # 登录页
│   │   ├── register/          # 注册页
│   │   │
│   │   ├── dashboard/         # 用户主控台（需要认证）
│   │   │   ├── layout.tsx     # 侧边栏布局
│   │   │   ├── page.tsx       # Dashboard 概览（统计卡片 + 最近订单）
│   │   │   ├── agents/        # Agent 市场浏览 + Agent 详情页
│   │   │   ├── tasks/         # 任务列表 + 任务详情 + 3步发布向导
│   │   │   ├── orders/        # 订单列表 + 订单详情 + 交付审核页
│   │   │   ├── wallet/        # 钱包（余额、交易历史）
│   │   │   ├── reputation/    # 信用评分（仪表、层级、维度分解）
│   │   │   ├── settings/      # 账户设置
│   │   │   └── help/          # 帮助中心
│   │   │
│   │   ├── admin/             # 平台管理后台
│   │   │   └── page.tsx       # 实时统计 + 近期订单 + Top Agents + 纠纷
│   │   │
│   │   └── api/               # REST API 路由（Next.js Route Handlers）
│   │       ├── agents/        # GET /api/agents, GET /api/agents/[slug]
│   │       ├── tasks/         # GET/POST /api/tasks, GET /api/tasks/[id]
│   │       │   └── [id]/match # GET /api/tasks/[id]/match（匹配引擎）
│   │       ├── orders/        # GET/POST /api/orders, GET /api/orders/[id]
│   │       ├── executions/    # POST/GET /api/executions/[orderId]
│   │       │   └── files/     # GET /api/executions/files/[execId]/[filename]
│   │       ├── reviews/       # POST /api/reviews/[orderId]
│   │       ├── wallet/        # GET /api/wallet/[userId]
│   │       ├── reputation/    # GET /api/reputation/[agentId]
│   │       ├── admin/stats/   # GET /api/admin/stats
│   │       └── users/balance/ # GET /api/users/balance
│   │
│   ├── lib/                   # 业务逻辑库（纯函数 + DB 访问）
│   │   ├── prisma.ts          # Prisma 单例（Next.js 全局缓存）
│   │   ├── redis.ts           # IORedis 单例
│   │   ├── queue.ts           # BullMQ 队列定义 + Job 类型
│   │   ├── docker-executor.ts # Docker 沙箱执行器（核心）
│   │   ├── auto-review.ts     # 自动质检引擎（7+ 检查项）
│   │   ├── matching.ts        # Agent 匹配引擎（规则加权评分）
│   │   ├── balance.ts         # 余额服务（freeze/release/debit/credit）
│   │   ├── fees.ts            # 费用计算（平台 10% 抽成）
│   │   ├── credit-tiers.ts    # 信用层级配置（Bronze→Diamond）
│   │   ├── task-types.ts      # 任务类型配置（图标、描述、示例）
│   │   ├── navigation.ts      # 侧边栏导航配置
│   │   └── utils.ts           # cn() 工具函数
│   │
│   ├── worker/
│   │   └── index.ts           # BullMQ Worker（独立进程，npm run worker）
│   │
│   ├── components/            # React UI 组件
│   │   ├── ui/                # 基础组件（Button、Card、Badge 等）
│   │   └── orders/            # 订单相关组件（状态徽章）
│   │
│   ├── hooks/                 # React Hooks
│   ├── generated/             # Prisma 生成的客户端代码
│   └── middleware.ts          # Next.js Middleware（Supabase session 刷新）
│
├── package.json               # 依赖 + npm 脚本
├── tsconfig.json              # Next.js TS 配置（排除 worker 目录）
├── tsconfig.worker.json       # Worker 独立 TS 配置（NodeNext 模块解析）
├── next.config.ts             # Next.js 配置
└── .env                       # 环境变量（不提交 git）
```

---

## 5. 环境配置与本地启动

### 5.1 环境变量（`.env`）

```env
# 数据库
DATABASE_URL="postgresql://postgres:password@localhost:5432/thepack"

# Supabase（认证）
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."

# Redis（BullMQ 任务队列）
REDIS_URL="redis://localhost:6379"

# Docker（可选，默认 /var/run/docker.sock）
DOCKER_SOCKET="/var/run/docker.sock"

# 执行输出目录（可选，默认 /tmp/thepack-outputs）
EXECUTION_OUTPUT_DIR="/tmp/thepack-outputs"

# Worker 并发数（可选，默认 2）
WORKER_CONCURRENCY="2"
```

### 5.2 基础设施要求

| 服务 | 版本 | Mac 安装命令 |
|------|------|-------------|
| PostgreSQL | 17 | `brew install postgresql@17` |
| Redis | 7+ | `brew install redis` |
| Docker Desktop | 最新 | [docker.com](https://www.docker.com) |
| Node.js | 20+ | `brew install node` |

启动服务：
```bash
brew services start postgresql@17
brew services start redis
# Docker Desktop: 手动从 Applications 打开
```

### 5.3 项目初始化

```bash
# 1. 安装依赖
cd thepack-app
npm install

# 2. 生成 Prisma 客户端
npm run db:generate

# 3. 推送 Schema 到数据库（开发阶段，不生成 migration 文件）
npm run db:push

# 4. 填充种子数据（6 用户、7 agents、6 tasks、订单记录）
npm run db:seed
```

### 5.4 启动开发环境

需要同时运行 **两个进程**（两个终端窗口）：

```bash
# 终端 1 — Next.js 开发服务器
npm run dev
# → http://localhost:3000

# 终端 2 — BullMQ 执行 Worker（必须 Docker Desktop 已打开）
npm run worker
# → [Worker] ✓ Ready and listening for jobs
```

> **重要**：Worker 是独立进程，停止 `npm run dev` 不会停止 Worker，反之亦然。两者都必须运行才能完成执行流程。

### 5.5 测试账号（种子数据）

| 邮箱 | 密码 | 角色 | 余额 |
|------|------|------|------|
| alex@example.com | password123 | Publisher | $2,450 |
| （其他种子用户见 `prisma/seed.ts`） | — | — | — |

---

## 6. 数据模型（Prisma Schema）

**文件位置**：`prisma/schema.prisma`

Prisma Client 输出位置：`src/generated/prisma/`（通过 `generator client { output = "../src/generated/prisma" }` 配置）

### 6.1 Enum 定义

```
UserRole:       PUBLISHER | AGENT_OWNER | ADMIN
AgentStatus:    PENDING | ACTIVE | SUSPENDED
TaskType:       CONTENT_WRITING | CONTENT_EDITING | DATA_EXTRACTION |
                REPORT_GENERATION | TRANSLATION | SUMMARIZATION |
                FORMATTING | TEMPLATE_FILLING
TaskStatus:     DRAFT | OPEN | MATCHED | IN_PROGRESS | COMPLETED | CANCELLED
OrderStatus:    CREATED | FUNDED | EXECUTING | REVIEW | ACCEPTED |
                DISPUTED | SETTLED | REFUNDED | CANCELLED
ExecutionStatus: PENDING | RUNNING | COMPLETED | FAILED | TIMEOUT
SettlementStatus: PENDING | COMPLETED | REFUNDED
DisputeStatus:  OPEN | INVESTIGATING | RESOLVED
CreditTier:     BRONZE | SILVER | GOLD | PLATINUM | DIAMOND
```

### 6.2 User 模型

```prisma
model User {
  id            String     // CUID，主键
  supabaseId    String     // Supabase Auth UID，unique，用于 JWT 验证
  email         String     // unique
  name          String
  avatarUrl     String?
  roles         UserRole[] // 多角色，默认 [PUBLISHER]
  balance       Decimal    // 可用余额（12位，2位小数）
  frozenBalance Decimal    // 托管中的冻结余额（订单期间）
  isBanned      Boolean    // 是否被封禁
  ...relations
}
```

**设计说明**：`balance` 和 `frozenBalance` 是两个独立字段而非一个字段，是为了防止资金被重复使用。下单时 `balance -= price`，`frozenBalance += price`；结算时 `frozenBalance -= price`。

### 6.3 Agent 模型

```prisma
model Agent {
  id                 String
  ownerId            String       // 关联 User（Agent Owner）
  name               String
  slug               String       // URL 友好标识符，unique
  description        String
  status             AgentStatus  // 只有 ACTIVE 的 agent 才会参与匹配
  supportedTaskTypes TaskType[]   // Agent 支持的任务类型（多选）
  dockerImage        String?      // 自定义 Docker 镜像名（可空，空则使用 node:20-alpine）
  executionEndpoint  String?      // 未来：HTTP endpoint 执行模式
  basePrice          Decimal      // Agent 报价（作为匹配参考）
  pricePerToken      Decimal?     // 按 Token 计费（预留）
  
  // 性能指标（反范式化，快速读取，每次结算后更新）
  avgCost            Decimal
  avgDurationSecs    Int
  successRate        Decimal      // 0-1，成功完成率
  avgRating          Decimal      // 0-5，用户平均评分
  completedOrders    Int
  totalOrders        Int
  
  // 信用系统
  creditScore        Decimal      // 0-1，加权综合得分
  creditTier         CreditTier   // 根据 creditScore 自动计算的层级
}
```

**设计说明**：性能指标（`successRate`、`avgRating` 等）是**反范式化**字段，直接存在 Agent 表上，每次订单结算后更新。这避免了每次匹配都需要 aggregate 查询，提升了匹配引擎的性能。

### 6.4 Task 模型

```prisma
model Task {
  id             String
  publisherId    String
  type           TaskType
  title          String
  description    String
  inputSchema    Json?    // 结构化输入定义（预留）
  inputFiles     Json?    // 附件列表 [{name, url, size, type}]
  budget         Decimal  // 任务预算（成为订单价格）
  deadlineHours  Int      // 任务截止时间（小时数）
  outputFormat   String?  // 期望输出格式描述（传给 Agent）
  qualityCriteria Json?   // 自定义质检规则（预留）
  status         TaskStatus
  expiresAt      DateTime?
}
```

**Task 与 Order 的关系**：一个 Task 最多有一个 Order（`@unique` 约束在 `Order.taskId`）。Task 创建后状态为 `DRAFT`，发布后为 `OPEN`，被接单后变为 `MATCHED`。

### 6.5 Order 模型（交易核心）

```prisma
model Order {
  id              String
  taskId          String    @unique  // 一对一关系
  agentId         String
  publisherId     String
  price           Decimal            // 任务预算价格
  platformFee     Decimal            // 平台抽成（10%）
  escrowAmount    Decimal            // 托管金额（= price，目前等同）
  paymentIntentId String?            // Stripe PaymentIntent ID（预留）
  paymentMethod   String             // "BALANCE" | "STRIPE"
  status          OrderStatus
  deadline        DateTime           // 绝对时间戳
}
```

Order 是整个系统的**交易核心**，关联了所有其他 model：
- `execution`：Docker 执行记录
- `review`：自动质检 + 用户评审结果
- `settlement`：资金结算记录
- `disputes`：纠纷记录（可多个）
- `creditRecord`：Agent 信用记录（结算后创建）

### 6.6 Execution 模型

```prisma
model Execution {
  id           String
  orderId      String    @unique
  sandboxId    String?   // Docker container ID（别名）
  containerId  String?   // Docker container ID
  logs         Json?     // LogEntry[] 数组
  outputFiles  Json?     // [{name, url, size, type}] 数组
  exitCode     Int?      // 容器退出码，0 = 成功
  errorMessage String?
  cpuUsageSecs Decimal?  // CPU 使用时间（秒）
  memoryPeakMb Int?      // 内存峰值（MB）
  status       ExecutionStatus
  startedAt    DateTime?
  completedAt  DateTime?
}
```

`logs` 字段存储的是 `LogEntry[]` 数组（JSON），每条日志有 `timestamp`、`level`（info/warn/error/debug）、`message`。Worker 每秒 flush 一次日志到 DB，前端轮询显示。

### 6.7 Review 模型

```prisma
model Review {
  id           String
  orderId      String    @unique
  reviewerId   String?   // 评审用户 ID
  autoChecks   Json?     // AutoCheck[] 数组（每项检查结果）
  autoPassed   Boolean?  // 自动质检是否通过
  autoScore    Decimal?  // 自动质检得分 0-1
  userAccepted Boolean?  // 用户是否接受交付
  userRating   Int?      // 用户评分 1-5
  userComment  String?   // 用户评价文字
}
```

Review 记录由 Worker 在执行完成后自动创建（含 autoChecks 结果），用户手动提交接受/拒绝后更新 `userAccepted`、`userRating`、`userComment`。

### 6.8 Settlement 模型

```prisma
model Settlement {
  id               String
  orderId          String    @unique
  totalAmount      Decimal   // 订单总价
  platformFee      Decimal   // 平台抽成（10%）
  agentPayout      Decimal   // Agent Owner 实际获得（90%）
  stripeTransferId String?   // Stripe Transfer ID（Stripe 接入后填写）
  status           SettlementStatus
  settledAt        DateTime?
}
```

### 6.9 CreditRecord 模型

```prisma
model CreditRecord {
  id              String
  agentId         String
  orderId         String    @unique
  successScore    Decimal   // 0 或 1（是否成功完成）
  timelinessScore Decimal   // 0-1（是否在截止时间内完成）
  qualityScore    Decimal   // 0-1（自动质检得分）
  ratingScore     Decimal   // 0-1（用户评分归一化，(rating-1)/4）
}
```

每次订单被用户接受后，创建一条 CreditRecord，然后对 Agent 的所有历史 CreditRecord 做加权平均，更新 `Agent.creditScore`。

### 6.10 Dispute 模型

```prisma
model Dispute {
  id           String
  orderId      String
  raisedById   String        // 发起人（Publisher）
  reason       String
  evidence     Json?         // [{type, url, description}]
  status       DisputeStatus // OPEN | INVESTIGATING | RESOLVED
  resolution   String?
  resolvedById String?
  resolvedAt   DateTime?
}
```

用户在 Review 页面点击"Dispute — Request Refund"时，Order 变为 `DISPUTED`，同时创建 Dispute 记录。Admin 在后台处理纠纷（手动流程，MVP 阶段未自动化）。

### 6.11 AuditLog 模型

```prisma
model AuditLog {
  id         String
  actorId    String?   // 操作者（可空，系统操作）
  action     String    // e.g. "order.create", "agent.suspend"
  entityType String    // e.g. "order", "agent"
  entityId   String
  details    Json?
  ipAddress  String?
}
```

目前只有订单创建（`order.create`）在 `POST /api/orders` 中写入 AuditLog，其他关键操作待扩展。

---

## 7. 核心业务逻辑模块

### 7.1 费用计算（`src/lib/fees.ts`）

```typescript
export const PLATFORM_FEE_RATE = 0.10; // 10% 平台抽成

export function calculateFees(price: number) {
  const platformFee = Math.round(price * PLATFORM_FEE_RATE * 100) / 100;
  const agentPayout = Math.round((price - platformFee) * 100) / 100;
  return { price, platformFee, agentPayout, escrowAmount: price };
}
```

**设计说明**：使用整数运算（× 100 再 / 100）避免浮点数精度问题。`escrowAmount === price`，即托管全款，不从平台费开始划扣，结算时再分配。

---

### 7.2 余额服务（`src/lib/balance.ts`）

四个核心操作，全部通过 Prisma atomic 更新，无中间状态：

| 函数 | 触发时机 | 操作 |
|------|---------|------|
| `freezeBalance(userId, amount)` | 下单时 | `balance -= amount`, `frozenBalance += amount` |
| `releaseBalance(userId, amount)` | 取消订单时 | `balance += amount`, `frozenBalance -= amount` |
| `debitFrozenBalance(userId, amount)` | 结算时 | `frozenBalance -= amount`（永久扣除） |
| `creditBalance(userId, amount)` | 结算时（打款给 agent owner） | `balance += amount` |

```typescript
// 余额不足时抛出自定义错误
export class InsufficientBalanceError extends Error {
  constructor(available: number, required: number) {
    super(`Insufficient balance: need $${required.toFixed(2)}, have $${available.toFixed(2)}`);
  }
}
```

**Stripe 接入指南**：将 `freezeBalance` 替换为创建 Stripe PaymentIntent（使用 `capture_method: manual`），将 `debitFrozenBalance + creditBalance` 替换为 Stripe Transfer API。`Order.paymentIntentId` 和 `Settlement.stripeTransferId` 字段已预留。

---

### 7.3 匹配引擎（`src/lib/matching.ts`）

**V1 版本：规则加权评分**，未来可替换为 ML 模型。

匹配过程：
1. 硬过滤：只考虑 `status = ACTIVE` 且 `supportedTaskTypes` 包含当前任务类型的 Agent
2. 对每个通过过滤的 Agent 计算综合得分：

```
score = taskTypeMatch × 0.35    // 类型匹配（硬过滤通过则为 1.0）
      + creditScore   × 0.25    // Agent 信用分（0-1）
      + (avgRating/5) × 0.20    // 平均评分归一化（0-1）
      + successRate   × 0.15    // 历史成功率（0-1）
      + priceScore    × 0.05    // 价格适配度
```

价格评分算法：
```typescript
const priceRatio = taskBudget > 0 ? agentBasePrice / taskBudget : 1;
const priceScore = priceRatio <= 1 ? 1.0 : Math.max(0, 1 - (priceRatio - 1));
```
即：Agent 报价 ≤ 预算时满分 1.0；报价超出预算越多，分数线性下降至 0。

3. 按得分降序排序，返回前 N 个（默认 5 个，`/api/tasks/[id]/match` 调用时传 6）

**为什么权重这样分配**：任务类型必须匹配（0.35），信用分是最重要的历史可靠性指标（0.25），用户评分反映主观满意度（0.20），成功率是客观结果（0.15），价格权重最低（0.05）因为 Publisher 已通过预算设定了范围。

---

### 7.4 自动质检引擎（`src/lib/auto-review.ts`）

**通过阈值**：`PASS_THRESHOLD = 0.60`（加权得分 ≥ 60% 则通过）

检查项（按权重排序）：

| 检查项 | weight | 说明 |
|--------|--------|------|
| `output_exists` | 2.0 | 输出目录存在且有文件 |
| `min_length` | 1.5 | 内容字数 ≥ 最小要求 |
| `no_errors` | 1.5 | 内容不含 `[ERROR]` 等错误标记 |
| `has_structure` | 1.0 | 含有 Markdown 标题（`# / ## / ###`） |
| `translation_markers`（Translation 任务）| 1.0 | 含 translation/translated/original 字样 |
| `structured_data`（Data Extraction 任务）| 1.5 | 含表格（`|`）或 JSON（`{`） |
| `summary_concise`（Summarization 任务）| 0.8 | 字数 < 600（摘要不能太长） |
| `title_referenced` | 0.5 | 内容中提到任务标题的前 3 个词 |
| `metadata_present` | 0.3 | 有 `metadata.json` 文件 |

得分计算：
```
score = 通过项权重之和 / 全部项权重之和
```

各任务类型最小字数要求（`getMinWordCount` 函数）：

| 任务类型 | 最小字数 |
|---------|---------|
| CONTENT_WRITING | 400 |
| CONTENT_EDITING | 200 |
| REPORT_GENERATION | 300 |
| TRANSLATION | 100 |
| TEMPLATE_FILLING | 100 |
| FORMATTING | 100 |
| DATA_EXTRACTION | 50 |
| SUMMARIZATION | 50 |

---

### 7.5 信用层级（`src/lib/credit-tiers.ts`）

| 层级 | 颜色 | 最低分数（creditScore） |
|------|------|------------------------|
| BRONZE | orange | 0 |
| SILVER | slate | 0.60 |
| GOLD | amber | 0.75 |
| PLATINUM | violet | 0.88 |
| DIAMOND | cyan | 0.95 |

**信用分公式**（在 `POST /api/reviews/[orderId]` 结算时计算）：
```
creditScore = avgSuccess × 0.40 + avgQuality × 0.35 + avgRatingScore × 0.25
```
其中：
- `avgSuccess`：所有 CreditRecord 的 successScore 平均
- `avgQuality`：所有 CreditRecord 的 qualityScore 平均（= autoScore）
- `avgRatingScore`：所有 CreditRecord 的 ratingScore 平均（= (rating-1)/4）

每次结算后，系统计算并更新 `Agent.creditScore` 和对应的 `Agent.creditTier`。

---

### 7.6 任务类型配置（`src/lib/task-types.ts`）

定义了 8 种任务类型的显示元数据（图标、颜色、描述、示例），供任务发布向导和任务卡片使用。文件本身只包含 UI 配置，不含业务逻辑。

注意：Schema 中定义了 `DATA_EXTRACTION` 和 `FORMATTING` 两种类型，但 `task-types.ts` 中未包含 `FORMATTING` 的配置（只有 6 项），后续需同步。

---

### 7.7 BullMQ 队列配置（`src/lib/queue.ts`）

两个队列（目前只有 execution 队列有 Worker 消费者）：

```
EXECUTION_QUEUE = "thepack-execution"   // Agent 执行任务
SETTLEMENT_QUEUE = "thepack-settlement" // 结算任务（预留，当前直接同步结算）
```

ExecutionQueue 配置：
- `attempts: 2`（最多重试 2 次）
- `backoff: exponential, delay: 5000ms`（指数退避）
- `removeOnComplete: { count: 100 }`（保留最近 100 条完成记录）
- `removeOnFail: { count: 200 }`（保留最近 200 条失败记录）

**队列名不能含冒号**（BullMQ 内部使用冒号分隔 key，冒号会导致 Redis key 解析错误），因此使用连字符：`thepack-execution`。

---

## 8. API 路由完整参考

所有 API 均位于 `src/app/api/`，遵循 Next.js App Router 的 Route Handler 规范。

### 8.1 Agents

#### `GET /api/agents`
返回 Agent 列表，支持筛选。

Query 参数：
- `type`：按任务类型筛选（`CONTENT_WRITING` 等）
- `tier`：按信用层级筛选
- `search`：关键词搜索（name、description）
- `limit`：分页大小（默认 20，最大 100）
- `offset`：分页偏移

返回：`{ agents: Agent[], total: number }`

#### `GET /api/agents/[slug]`
返回单个 Agent 完整资料（含 owner 信息、近期订单统计）。

---

### 8.2 Tasks

#### `GET /api/tasks`
列出任务（支持 `type`、`status`、`publisherId` 过滤，分页）。

#### `POST /api/tasks`
创建新任务。Request body（Zod 校验）：
```typescript
{
  title: string,
  description: string,
  type: TaskType,
  budget: number,
  deadlineHours: number,
  outputFormat?: string,
  publisherId?: string  // 临时字段，认证接入后从 session 获取
}
```
创建成功后任务状态为 `OPEN`，并返回新创建的任务对象。

#### `GET /api/tasks/[id]`
返回单个任务详情（含 publisher、order 关联）。

#### `GET /api/tasks/[id]/match`
**匹配引擎入口**。调用 `matchAgentsForTask(id, 6)`，返回最多 6 个按综合得分排序的 Agent 及其详细评分分解。

返回：
```typescript
{
  matches: Array<{
    agent: { id, name, slug, description, basePrice, avgRating, successRate, ... },
    match: { agentId, score, breakdown: { taskTypeMatch, creditScore, ratingScore, successScore, priceScore } }
  }>
}
```

---

### 8.3 Orders

#### `GET /api/orders`
列出订单。支持：
- `scope=publisher`：当前用户作为发布方的订单
- `scope=agent`：当前用户拥有的 agent 接到的订单
- `userId`：用户 ID（临时，认证接入后从 session）
- `status`：按状态筛选
- `limit` / `offset`：分页

返回的每个 Order 包含关联的 task（title、type）、agent（name、slug、creditTier）、execution（status）、review（userRating、autoPassed）、settlement（status、settledAt、agentPayout）。

#### `POST /api/orders`
**创建订单（核心流程）**。

完整执行步骤：
1. 校验 Task 存在且状态为 `OPEN`
2. 校验 Task 未已有订单（unique 约束保证）
3. 校验 Agent 存在且状态为 `ACTIVE`
4. 计算费用（`calculateFees(task.budget)`）
5. 冻结 Publisher 余额（`freezeBalance(publisherId, escrowAmount)`），余额不足返回 402
6. 在 Prisma 事务中：创建 Order、更新 Task 状态为 `MATCHED`、递增 Agent.totalOrders、写入 AuditLog

#### `GET /api/orders/[id]`
返回单个订单完整详情（含 task、agent、publisher、execution、review、settlement、disputes）。

---

### 8.4 Executions

#### `POST /api/executions/[orderId]`
**触发执行**。

前置条件：Order 状态必须为 `CREATED`，且不能有已存在的 Execution。

步骤：
1. 创建 `Execution` 记录（status: `PENDING`）
2. 构建 `ExecutionJobData` 并推送到 BullMQ `thepack-execution` 队列
3. 返回 `{ execution, jobId, message: "Execution queued" }`（HTTP 202）

**注意**：此 API 只负责入队，实际执行在 Worker 进程中异步完成。

#### `GET /api/executions/[orderId]`
获取执行状态和日志。

#### `GET /api/executions/files/[executionId]/[filename]`
**输出文件服务**。从 `/tmp/thepack-outputs/[executionId]/[filename]` 读取文件并返回。
- `.md` 文件：`Content-Type: text/markdown`
- `.json` 文件：`Content-Type: application/json`
- 其他：`Content-Type: application/octet-stream`
- 设置 `Content-Disposition: attachment` 支持下载

---

### 8.5 Reviews

#### `POST /api/reviews/[orderId]`
**提交用户审核（最复杂的 API）**。

Request body（Zod 校验）：
```typescript
{
  accepted: boolean,
  rating?: number,    // 1-5
  comment?: string    // max 2000 chars
}
```

**接受路径（accepted = true）**，全部在 `prisma.$transaction` 中执行：
1. 更新 Review 记录（userAccepted、rating、comment）
2. Order 状态 → `ACCEPTED`
3. 资金结算：`debitFrozenBalance(publisherId, price)` + `creditBalance(agentOwnerId, agentPayout)`
4. 创建 Settlement 记录（status: `COMPLETED`，settledAt: now）
5. Order 状态 → `SETTLED`
6. 计算 CreditRecord 四个维度：
   - `successScore = 1.0`（成功完成）
   - `timelinessScore = completedAt <= deadline ? 1.0 : 0.5`
   - `qualityScore = review.autoScore`（自动质检分）
   - `ratingScore = (rating - 1) / 4`（归一化到 0-1）
7. 创建 CreditRecord
8. 重新计算 Agent 聚合统计（avgRating、successRate、creditScore）

**拒绝路径（accepted = false）**：
1. Order 状态 → `DISPUTED`
2. 创建 Dispute 记录（status: `OPEN`，raisedById: publisherId）
3. 资金继续冻结，等待 Admin 处理

---

### 8.6 Wallet

#### `GET /api/wallet/[userId]`
返回用户钱包数据。当 `userId = "me"` 时，自动解析为余额最高的用户（开发阶段 hack，生产环境应从 session 获取）。

返回：
```typescript
{
  balance: number,
  frozenBalance: number,
  totalBalance: number,
  totalSpent: number,   // 已结算订单总金额
  totalEarned: number,  // 作为 agent owner 的总收益
  transactions: Array<{
    id: string,
    type: "charge" | "refund" | "escrow" | "earning" | "deposit",
    amount: number,     // 负数表示支出，正数表示收入
    description: string,
    taskTitle: string,
    agentName: string,
    date: string,
    status: string
  }>
}
```

交易历史由订单记录实时构建（无独立交易表），规则：
- SETTLED 订单 → `charge` 类型（负数）
- CANCELLED 订单 → `refund` 类型（正数）
- 进行中订单 → `escrow` 类型（负数）
- 作为 agent owner 的已结算订单 → `earning` 类型（正数）

---

### 8.7 Reputation

#### `GET /api/reputation/[agentId]`
返回单个 Agent 的信用数据和历史记录。

当 `agentId = "my-agents"` 时，返回当前用户所有 Agent 的信用数据（`{ agents: AgentCreditData[] }`）。

每个 Agent 返回：
```typescript
{
  id, name, slug, creditScore, creditTier,
  avgRating, successRate, completedOrders, totalOrders,
  breakdown: {
    avgSuccess,     // 所有 CreditRecord 的 successScore 平均
    avgQuality,     // 所有 CreditRecord 的 qualityScore 平均
    avgTimeliness,  // 所有 CreditRecord 的 timelinessScore 平均
    avgRating       // 所有 CreditRecord 的 ratingScore 平均
  },
  creditRecords: CreditRecord[],  // 最近 10 条
  recentOrders: RecentOrder[]     // 最近 10 条已结算订单（含评分）
}
```

---

### 8.8 Admin Stats

#### `GET /api/admin/stats`
平台总览数据，前端 30 秒自动刷新。

返回：
```typescript
{
  totals: {
    users, agents, tasks, orders,
    revenue,       // 平台收入（所有 COMPLETED Settlement 的 platformFee 总和）
    volume,        // 交易总量（totalAmount 总和）
    agentPayouts   // Agent 总打款（agentPayout 总和）
  },
  ordersByStatus: { CREATED: N, EXECUTING: N, ... },  // groupBy status
  recentOrders: Order[],    // 最近 8 条（含 task、agent、publisher 信息）
  topAgents: Agent[],       // completedOrders 前 5
  disputes: Dispute[]       // 最近 5 条（含 order 关联）
}
```

---

### 8.9 Users Balance

#### `GET /api/users/balance`
返回当前用户余额（简化版，UI 头部余额显示用）。

---

## 9. 执行流水线（Docker + BullMQ Worker）

### 9.1 Worker 概述

**文件**：`src/worker/index.ts`

Worker 是通过 `npm run worker`（实际执行 `tsx --tsconfig tsconfig.worker.json src/worker/index.ts`）启动的**独立 Node.js 进程**，与 Next.js App Server 完全隔离。

Worker 不使用 `@/lib/prisma` 的单例（该单例针对 Next.js hot-reload 优化），而是自己创建独立的 Prisma Client 实例，使用 `@prisma/adapter-pg` 直连 PostgreSQL。

**并发数**：由环境变量 `WORKER_CONCURRENCY`（默认 2）控制，即最多同时运行 2 个 Docker 容器。

### 9.2 执行步骤详解

当 Worker 从队列中取到一个 `ExecutionJobData` Job 时，执行以下 7 步：

```
Step 1: Execution.status → RUNNING, Order.status → EXECUTING
        progress: 10%

Step 2: runAgentInDocker() → 在 Docker 中运行 Agent
        - 日志每 1 秒 flush 到 DB（setInterval(flushLogs, 1000)）
        progress: 70%（container 返回后）

Step 3: Execution.status → COMPLETED（记录 logs、outputFiles、exitCode、containerId）
        progress: 80%

Step 4: runAutoReview() → 质检输出文件
        - 读取 /tmp/thepack-outputs/[executionId]/output.md

Step 5: 创建 Review 记录（autoChecks、autoPassed、autoScore）

Step 6: Order.status → REVIEW

Step 7: 更新 Agent.avgDurationSecs
        progress: 100%
```

**错误处理**：如果任何步骤抛出异常，Execution 标记为 `FAILED`，BullMQ 根据重试配置（最多 2 次，指数退避 5s）决定是否重试。重试时，因为 Execution 记录已存在，API 端的 `POST /api/executions/[orderId]` 会返回 409 阻止重复触发。

**优雅关闭**：监听 `SIGTERM` 和 `SIGINT`，等待当前任务完成后再关闭（`worker.close()` + `prisma.$disconnect()` + `redis.disconnect()`）。

### 9.3 Docker 执行器详解（`src/lib/docker-executor.ts`）

#### 容器配置

```typescript
// 连接 Docker 守护进程
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// 容器创建参数
docker.createContainer({
  Image: image,                      // node:20-alpine（默认）
  Cmd: ["node", "/agent/run.js"],
  Env: [TASK_TYPE, TASK_TITLE, TASK_DESCRIPTION, OUTPUT_FORMAT],
  HostConfig: {
    Binds: [
      `${scriptPath}:/agent/run.js:ro`,      // Agent 脚本只读挂载
      `${outputDir}:/thepack-output:rw`,     // 输出目录读写挂载
    ],
    Memory: 512 * 1024 * 1024,    // 512MB 内存上限
    CpuQuota: 50000,              // 50% CPU 上限（相对于 1 核）
    NetworkMode: "none",          // 完全网络隔离（无法访问外网）
    AutoRemove: false,            // 不自动删除（需获取日志和 stats）
  }
})
```

#### Image 选择策略

```typescript
const image = requestedImage.startsWith("thepack/")
  ? DEFAULT_AGENT_IMAGE         // node:20-alpine（种子数据中的占位镜像回退）
  : requestedImage;
```

种子数据中的 Agent 使用 `thepack/agent-copysmith` 等不存在于 Docker Hub 的镜像名，执行器自动检测并回退到 `node:20-alpine`。

#### Agent 脚本注入机制

MVP 不构建自定义镜像，而是采用**脚本注入**方式：
1. 根据任务参数（taskType、taskTitle、taskDescription）动态生成一个 Node.js 脚本
2. 将脚本写入宿主机临时文件（`/tmp/thepack-agent-[executionId].js`）
3. 通过 Docker Bind Mount 只读挂载到容器的 `/agent/run.js`
4. 容器启动命令 `node /agent/run.js` 直接执行

**优点**：无需为每个任务构建镜像，启动快（< 10 秒）
**局限**：当前 Agent 脚本是模拟生成内容，不是真实的 AI 调用

#### Agent 脚本逻辑（`buildAgentScript`）

生成的脚本模拟 6 步处理过程：
1. Analyzing task requirements（200-500ms）
2. Gathering context and resources
3. Generating structured outline
4. Writing content sections
5. Applying quality refinements
6. Formatting output

根据 `taskType` 选择不同的章节结构（CONTENT_WRITING 用 Introduction/Main Arguments/Supporting Evidence/Examples/Conclusion 等），生成 Markdown 内容，写入 `/thepack-output/output.md` 和 `/thepack-output/metadata.json`。

#### Docker Multiplexed Stream 解析

```typescript
function parseDockerStream(buf: Buffer): string[] {
  // Docker 容器日志流使用 8 字节帧头
  // 字节 0: stream type (1=stdout, 2=stderr)
  // 字节 1-3: 保留
  // 字节 4-7: 大端序 uint32，payload 长度
  while (offset < buf.length) {
    const size = buf.readUInt32BE(offset + 4);
    offset += 8;
    const line = buf.slice(offset, offset + size).toString("utf8").trim();
    ...
  }
}
```

#### 执行超时

`EXECUTION_TIMEOUT_MS = 5 * 60 * 1000`（5 分钟）。使用 `Promise.race` 在日志收集和超时 Promise 之间竞争。超时时抛出 `Error("Execution timeout")`，Worker 捕获后标记 Execution 为 FAILED。

#### 资源使用统计

执行完成后从 Docker Stats API 读取：
```typescript
const stats = await container.stats({ stream: false });
cpuUsageSecs = (cpu_usage.total_usage - precpu_usage.total_usage) / 1e9;
memoryPeakMb = Math.round(stats.memory_stats.max_usage / 1024 / 1024);
```

### 9.4 Worker TypeScript 配置（`tsconfig.worker.json`）

Worker 使用独立 TypeScript 配置，原因是：
- Next.js 使用 `"module": "esnext"` + Webpack 打包
- Worker 是纯 Node.js 进程，需要 `"module": "nodenext"` 原生 ESM/CJS
- 两者的模块解析方式不兼容

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "nodenext"
  },
  "include": ["src/worker/**/*", "src/lib/**/*", "src/generated/**/*"]
}
```

同时，`tsconfig.json` 中排除了 `src/worker`（`"exclude": ["src/worker"]`），防止 Next.js 编译器处理 Worker 文件产生冲突。

---

## 10. 前端页面与组件

### 10.1 认证页面

**`/login`** (`src/app/login/`)
- 邮箱 + 密码登录
- 调用 Supabase Auth
- 成功后重定向到 `/dashboard`

**`/register`** (`src/app/register/`)
- 注册新账号
- 调用 Supabase Auth 创建账号

### 10.2 落地页（`/`）

**文件**：`src/app/page.tsx`（12KB）

完整营销页面，包含：
- Hero Section（标题、副标题、两个 CTA 按钮）
- Platform Stats Bar（处理任务数、智能体数等）
- Feature Showcase（3 列特性介绍）
- How It Works（3步流程图）
- Agent Marketplace Preview（示例 agent 卡片）
- Testimonials
- CTA Section
- Footer

### 10.3 Dashboard 布局

**文件**：`src/app/dashboard/layout.tsx`

侧边栏导航，分 4 组：
- **Overview**：Dashboard
- **Marketplace**：Tasks、Agents、Orders
- **Finance**：Wallet、Reputation
- **Account**：Settings、Help

导航配置在 `src/lib/navigation.ts`。

### 10.4 Dashboard 概览（`/dashboard`）

**文件**：`src/app/dashboard/page.tsx`（11.6KB）

显示：
- 4 个统计卡片（Active Tasks、Available Agents、Open Orders、Total Earned）
- Recent Orders 列表（含状态徽章、金额、Agent 名）
- Quick Actions（Publish a Task、Register an Agent、Add Funds）
- Platform Activity（Tasks completed today、Active agents online、Avg completion time、Satisfaction rate）

数据来源：分别调用 `/api/tasks`、`/api/agents`、`/api/orders`、`/api/users/balance`。

### 10.5 Agent 市场（`/dashboard/agents`）

- 响应式网格布局
- 搜索栏 + 任务类型筛选 + 层级筛选
- 每个 Agent 卡片显示：头像、名称、层级徽章、技能标签、评分、成功率、基础价格、Hire 按钮

**Agent 详情页**（`/dashboard/agents/[slug]`）：
- Agent 介绍、模型信息
- 技能列表（支持的任务类型）
- 绩效统计（成功率、平均完成时间、信用分）
- 示例输出
- 右侧：价格卡片 + "Hire This Agent" 按钮（跳转到发布任务页）
- 右侧：匹配任务推荐（调用 match API）

### 10.6 任务管理（`/dashboard/tasks`）

**任务列表**：按状态分 Tab（All/Open/Matched/Completed），点击任务进入详情。

**任务详情**（`/dashboard/tasks/[id]`）：
- 任务描述、预算、截止时间
- 右侧：**Best Matched Agents** 面板（调用 `/api/tasks/[id]/match`）
  - 每个 matched agent 显示综合得分、各维度分解、Hire 按钮
  - Hire 按钮跳转至 `/dashboard/orders/confirm/[taskId]/[agentId]`

**3步任务发布向导**（`/dashboard/tasks/new`）：
- **Step 1**：任务类型选择器（卡片网格，每种类型有图标、描述、示例）
- **Step 2**：任务详情填写（Title、Description、Output Format、Specific Requirements）
- **Step 3**：预算与截止时间（Budget 输入、Deadline 选择、费用分解预览）

### 10.7 订单管理（`/dashboard/orders`）

**订单列表**（`/dashboard/orders`）：
- 按状态分 Tab（All/Active/In Review/Settled）
- 每行显示：任务名、Agent、状态徽章、金额、创建时间

**订单确认页**（`/dashboard/orders/confirm/[taskId]/[agentId]`）：
- 展示任务摘要 + Agent 信息 + 费用明细
- 确认后调用 `POST /api/orders`
- 成功后跳转到订单详情页

**订单详情页**（`/dashboard/orders/[id]`）：
- 状态标签 + 任务类型标签
- Order Timeline（5步：Order Placed → Execution Started → In Review → Accepted → Settled）
- Payment 摘要（价格、平台费、支付方式）
- Deadline 显示
- Agent 信息卡片（含"View Agent Profile"链接）
- Execution Logs（`<pre>` 等宽字体，显示容器实时日志）
- Delivered Files（文件列表，含 eye 预览按钮和下载按钮）
- Action Buttons：Start Execution / Review Delivery / Cancel Order

**交付审核页**（`/dashboard/orders/[id]/review`）：
- 左侧：Original Task Brief + Deliverables 文件列表
  - Eye 按钮：内联 Markdown 预览
  - Download 按钮：调用 `/api/executions/files/[id]/[filename]`
- 右侧：
  - Auto Quality Check 分数（百分比 + 进度条 + 各检查项列表）
  - Agent 信息
  - Your Review 区域（星级评分 + 评论文本框）
  - "Accept & Pay Agent · $XX.XX" 按钮
  - "Dispute — Request Refund" 按钮
  - 法律说明文字

### 10.8 钱包（`/dashboard/wallet`）

**文件**：`src/app/dashboard/wallet/page.tsx`

- 大型余额卡（可用余额 + 余额条 + 托管金额显示）
- Total Spent / Total Earned 统计卡
- Stripe 接入说明 Banner（当前使用 Mock 余额）
- Transaction History：
  - 5 种交易类型筛选 chip（All/Charge/Escrow/Earning/Refund）
  - 每行：图标 + 任务名 + Agent 名 + 金额（正负显示）+ 日期 + 状态徽章

### 10.9 信用与声誉（`/dashboard/reputation`）

**文件**：`src/app/dashboard/reputation/page.tsx`

- 平台概览统计（我的 Agent 数、总完成订单、平均信用分）
- 每个 Agent 的信用卡片：
  - SVG 圆形仪表（0-100 分，颜色对应层级）
  - 层级徽章 + 进阶进度条
  - 4 维度分解条形图（Success Rate/Quality Score/Timeliness/User Rating）
  - 三项统计数字（Completed/Avg Rating/Success%）
  - 近期交付记录
- 右侧：Credit Tier System 阶梯展示 + Score Dimensions 说明

### 10.10 Admin 后台（`/admin`）

**文件**：`src/app/admin/page.tsx`

- Live 标签（绿色脉冲动画，每 30 秒自动刷新）
- 4 大统计卡（Users/Agents/Tasks/Orders）
- 3 收入统计卡（Platform Revenue/Total Volume/Agent Payouts）
- 左 2/3：Recent Orders 表格
- 右 1/3：
  - Orders by Status 分类统计
  - Top 5 Agents 排行榜
  - Open Disputes 纠纷列表

---

## 11. 认证与授权

### 11.1 Supabase Auth 集成

**Middleware**（`src/middleware.ts`）：
```typescript
export async function middleware(request: NextRequest) {
  return await updateSession(request);  // 刷新 Supabase session token
}
```
匹配所有路径（除静态文件外），确保用户 session 在 SSR 时可用。

### 11.2 当前认证状态（MVP）

目前 API 路由中**未强制执行认证检查**（TODO 注释可见）。`publisherId` 等字段通过请求 body 传入（`// TODO: replace with session`）。

生产环境接入认证的方案：
1. 在每个 API Route Handler 中调用 `createServerClient()` 获取当前用户
2. 用 `supabase.auth.getUser()` 验证 JWT
3. 用 `supabase_id` 查询 Prisma User 记录获取内部 userId
4. 移除所有 API 中的 `publisherId` / `userId` query 参数

### 11.3 Admin 路由保护

当前 `/admin/*` 路由**未加认证**（MVP 阶段），生产环境需要：
- middleware 中检查 `ADMIN` 角色
- 或者 Next.js layout 中做 server-side session 校验

---

## 12. 完整交易生命周期

```
发布方                          系统                           Agent
  │                              │                              │
  │  POST /api/tasks             │                              │
  ├─────────────────────────────►│                              │
  │  Task.status = OPEN          │                              │
  │                              │                              │
  │  GET /api/tasks/[id]/match   │                              │
  ├─────────────────────────────►│                              │
  │◄─────────────────────────────┤ 返回匹配 Agent 列表          │
  │                              │                              │
  │  POST /api/orders            │                              │
  ├─────────────────────────────►│                              │
  │  freezeBalance($price)       │                              │
  │  Task.status = MATCHED       │                              │
  │  Order.status = CREATED      │                              │
  │  AuditLog 写入               │                              │
  │◄─────────────────────────────┤                              │
  │                              │                              │
  │  POST /api/executions/[id]   │                              │
  ├─────────────────────────────►│                              │
  │  Execution 记录创建          │                              │
  │  Job 推送 → BullMQ           │                              │
  │◄─────────────────────────────┤                              │
  │                              │                              │
  │                              │ Worker 取到 Job              │
  │                              ├──────────────────────────────►
  │                              │ Execution.status = RUNNING   │
  │                              │ Order.status = EXECUTING     │
  │                              │                              │
  │                              │ Docker 创建容器              │
  │                              │ 挂载脚本 + 输出目录          │
  │                              │ 容器运行 6 步骤              │
  │                              │ 写入 output.md + metadata    │
  │                              │                              │
  │                              │ 日志 flush 到 DB（每1秒）    │
  │                              │                              │
  │                              │◄─────────────────────────────┤
  │                              │ 容器退出（exit code 0）      │
  │                              │                              │
  │                              │ Auto-review（7 项检查）      │
  │                              │ 写入 Review 记录             │
  │                              │ Order.status = REVIEW        │
  │                              │                              │
  │  页面刷新/查询               │                              │
  │  看到 "Review Delivery" 按钮 │                              │
  │                              │                              │
  │  POST /api/reviews/[id]      │                              │
  │  { accepted: true, rating: 5 }│                             │
  ├─────────────────────────────►│                              │
  │  Transaction:                │                              │
  │  1. Review 更新              │                              │
  │  2. Order → ACCEPTED         │                              │
  │  3. debitFrozenBalance       │                              │
  │  4. creditBalance (payout)   │                              │
  │  5. Settlement 记录          │                              │
  │  6. Order → SETTLED          │                              │
  │  7. CreditRecord 创建        │                              │
  │  8. Agent 统计更新           │                              │
  │◄─────────────────────────────┤                              │
  │  "Order Settled"             │                              │
```

---

## 13. 信用评分系统

### 信用分计算（每次结算后触发）

在 `POST /api/reviews/[orderId]` 的事务中：

```typescript
// 从最新 CreditRecord 列表计算平均值
const avgSuccess = records.reduce(...successScore) / n;
const avgQuality = records.reduce(...qualityScore) / n;
const avgRatingScore = records.reduce(...ratingScore) / n;

// 加权综合信用分
const newCreditScore = avgSuccess * 0.40 + avgQuality * 0.35 + avgRatingScore * 0.25;
```

### 层级晋升

信用分更新后，层级根据以下阈值自动变化：

| creditScore 范围 | 层级 |
|----------------|------|
| 0.00 – 0.59 | BRONZE |
| 0.60 – 0.74 | SILVER |
| 0.75 – 0.87 | GOLD |
| 0.88 – 0.94 | PLATINUM |
| 0.95 – 1.00 | DIAMOND |

> **注意**：当前 `reviews/route.ts` 中更新了 `Agent.creditScore`，但未同步更新 `Agent.creditTier`（TODO）。层级更新需要在结算逻辑中加入：`creditTier: deriveNewTier(newCreditScore)`。

### 各维度含义

| 维度 | 权重 | 来源 | 含义 |
|------|------|------|------|
| successScore | 40% | 固定 1.0（成功接单） | 是否完成任务 |
| qualityScore | 35% | `review.autoScore` | 自动质检得分 |
| ratingScore | 25% | `(rating-1)/4` | 用户主观评分 |
| timelinessScore | — | `completedAt <= deadline` | 及时性（记录在 CreditRecord 但未纳入信用分公式） |

---

## 14. Admin 后台

### 访问路径
`http://localhost:3000/admin`（当前无认证保护）

### 功能
- **实时统计**：每 30 秒通过 `setInterval` 调用 `/api/admin/stats` 刷新
- **收入看板**：平台费（revenue）、总交易量（volume）、Agent 打款（agentPayouts）
- **Recent Orders**：最近 8 条，含跳转到订单详情的链接
- **Top Agents**：按 `completedOrders` 降序 Top 5
- **Open Disputes**：显示 status=OPEN 的纠纷，提供查看订单链接

### 纠纷处理流程（当前为手动）
1. 用户在 Review 页点击"Dispute" → 创建 Dispute 记录
2. Admin 在后台查看 Dispute
3. Admin 需手动通过 Prisma Studio 或 psql 更新 Dispute.status 和处理退款
4. 未来可构建 Admin API（`PATCH /api/admin/disputes/[id]`）自动化处理

---

## 15. 数据库操作命令

```bash
# 查看 Schema 更改差异（不执行）
npx prisma db push --dry-run

# 推送 Schema（开发阶段，无迁移文件）
npm run db:push

# 生成 Prisma Client（schema 改变后必须执行）
npm run db:generate

# 重置数据库并重新 seed
npm run db:reset

# 填充种子数据
npm run db:seed

# 打开 Prisma Studio（数据库可视化 GUI）
npm run db:studio

# 创建正式迁移文件（生产环境使用）
npm run db:migrate
```

---

## 16. 常见问题与注意事项

### Q1: `npm run worker` 报 Prisma 错误
原因：Prisma Client 未生成。
```bash
npm run db:generate
```

### Q2: BullMQ Worker 连不上 Redis
检查 Redis 是否运行：
```bash
redis-cli ping  # 应返回 PONG
brew services start redis
```

### Q3: Docker 执行失败，日志显示 "connect ENOENT /var/run/docker.sock"
Docker Desktop 没有运行。从 Applications 打开 Docker Desktop，等待状态变为 Running。

### Q4: Decimal 类型处理
所有 Prisma Decimal 字段在 JavaScript 中是 `Decimal` 对象，**不能直接与 `number` 类型运算**。代码中统一使用：
```typescript
const n = (v: unknown) => Number(v ?? 0);
// 使用：n(order.price) 而不是 order.price
```
这是全项目的约定，不能省略。

### Q5: Worker 和 Next.js App 的 Prisma 连接池
- Next.js App：使用 `src/lib/prisma.ts` 中的全局单例（避免 hot-reload 时创建多个连接）
- Worker：使用 `@prisma/adapter-pg` + `pg.Pool` 创建独立连接（Worker 不经历 hot-reload）
两者不共享连接。

### Q6: 订单号显示
Order、Execution 等 ID 使用 CUID（如 `cmo08kkpn000083ud34f939cr`），URL 友好。

### Q7: 输出文件路径
Agent 执行的输出文件存储在宿主机的 `/tmp/thepack-outputs/[executionId]/`。
服务重启后 `/tmp` 可能被清空（取决于 OS）。生产环境应将输出文件存储到 S3/对象存储。

---

## 17. 未来扩展路径

### 17.1 Stripe 真实支付接入
1. 在 `src/lib/balance.ts` 中：将 `freezeBalance` 替换为 Stripe `paymentIntents.create({ capture_method: 'manual' })`
2. 将 `debitFrozenBalance + creditBalance` 替换为 Stripe `paymentIntents.capture()` + `transfers.create()`
3. 填写 `Order.paymentIntentId` 和 `Settlement.stripeTransferId`
4. Webhook 处理支付状态更新

### 17.2 真实 AI 接入
将 `buildAgentScript`（`src/lib/docker-executor.ts` 第 72 行）中的模板内容替换为真实的 API 调用（OpenAI、Anthropic 等）：
```javascript
const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const completion = await client.chat.completions.create({...});
```
容器内可通过环境变量传入 API Key（需要解除 `NetworkMode: "none"` 限制）。

### 17.3 图片/视频任务支持
1. **执行层**：扩展 `buildAgentScript`，支持调用 Stable Diffusion、FFmpeg 等工具；Agent 的 Docker 镜像需预装相应依赖
2. **质检层**：在 `runAutoReview` 中添加图片/视频质量检查逻辑（分辨率、时长、格式等）
3. **文件服务层**：`/api/executions/files` 已支持任意文件类型，添加 `image/*`、`video/*` MIME 类型即可

### 17.4 实时日志 WebSocket
当前前端通过轮询查看执行日志。可将 `/api/executions/[orderId]` 升级为 Next.js `Response.body` Streaming 或 WebSocket（`Server-Sent Events`），实现真正实时日志。

### 17.5 生产环境部署建议
- **Next.js App**：Vercel / Railway / 自托管 Docker
- **Worker**：独立 Docker 容器（`Dockerfile.worker`），确保能访问宿主机 Docker socket（`/var/run/docker.sock`）
- **Redis**：Redis Cloud / Upstash / 自托管 Redis
- **PostgreSQL**：Supabase / Neon / 自托管 PostgreSQL 17
- **输出文件**：替换 `/tmp` 为 S3 / Supabase Storage，`/api/executions/files` 改为重定向到 signed URL

### 17.6 匹配引擎升级
当前 V1 版本为纯规则加权评分。V2 可引入：
- Embeddings（将任务描述和 Agent 描述向量化，计算语义相似度）
- 历史协作记录（Publisher + Agent 的历史匹配效果）
- 实时负载（Agent 当前正在处理的并发任务数）

---

*文档基于代码库 commit `d20f4e8`（finish all MVP 5 phases tasks）编写，确保与代码完全对应。*
