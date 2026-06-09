# ThePack MCP 接入层改造 — 实施计划

> **目标**：将 ThePack 从"本机 Docker 假执行"升级为"MCP/REST API 远端真实 Agent 执行"架构，让 Agent Owner 可以通过 Claude Code、OpenClaw 等平台接入 ThePack 接单。

---

## Phase 1：数据库 Schema 扩展（Day 1）

扩展 Prisma Schema，为 Agent 和 Execution 模型添加 MCP 接入所需的字段。

### [MODIFY] [schema.prisma](file:///d:/graduate_pojects/The%20pack/the-pack-main/prisma/schema.prisma)

**Agent 模型新增字段：**
```prisma
// === MCP 接入字段 ===
connectionType    String      @default("MCP") @map("connection_type")   // "MCP" | "WEBHOOK" | "OPENCLAW" | "COZE"
mcpEndpoint       String?     @map("mcp_endpoint")                      // MCP/Webhook 连接地址
apiKey            String?     @unique @map("api_key")                   // Agent 的 API Key（用于鉴权）
heartbeatInterval Int         @default(30) @map("heartbeat_interval")   // 心跳间隔（秒）
lastHeartbeat     DateTime?   @map("last_heartbeat")                    // 最后心跳时间
isOnline          Boolean     @default(false) @map("is_online")         // 是否在线
autoAccept        Boolean     @default(false) @map("auto_accept")       // 是否自动接单
acceptTaskTypes   TaskType[]  @map("accept_task_types")                 // 接受的任务类型过滤
dailyLimit        Int         @default(10) @map("daily_limit")          // 每日接单上限
dailyCompleted    Int         @default(0) @map("daily_completed")       // 今日已完成
```

**Execution 模型新增字段：**
```prisma
// === 远端执行字段 ===
executionSource   String?     @default("MCP") @map("execution_source")  // "LOCAL" | "MCP" | "OPENCLAW" | "COZE"
remoteSessionId   String?     @map("remote_session_id")                 // 远端会话 ID
heartbeatStatus   String?     @default("ALIVE") @map("heartbeat_status") // "ALIVE" | "STALE" | "DEAD"
lastHeartbeatAt   DateTime?   @map("last_heartbeat_at")                 // Execution 级心跳
```

### [MODIFY] [seed.ts](file:///d:/graduate_pojects/The%20pack/the-pack-main/prisma/seed.ts)

- 为现有 6 个种子 Agent 添加新字段的默认值
- 为每个 Agent 生成唯一的 `apiKey`（格式：`tpk_` + 随机字符串）
- 设置合理的 `acceptTaskTypes`、`dailyLimit` 等

### 验证
```bash
npx prisma db push       # 同步 Schema 到数据库
npm run db:seed           # 重新导入种子数据
npx prisma studio         # 检查新字段是否正确
```

---

## Phase 2：Agent Gateway REST API（Day 2-3）

实现 5 个核心 API 端点 + 1 个鉴权中间件。这些是普通的 REST API，供 MCP Server / OpenClaw Skill / Coze Plugin 等所有外部接入方调用。

### [NEW] `src/lib/agent-auth.ts` — API Key 鉴权

```typescript
// 从 Authorization header 提取 API Key
// 查询 Agent 表验证 Key 是否有效
// 返回 Agent 信息
// 格式：Authorization: Bearer tpk_xxxxxx
```

### [NEW] `src/app/api/agent-gateway/tasks/pending/route.ts` — 查询待领取任务

```
GET /api/agent-gateway/tasks/pending
Query: agentId, taskTypes[], limit
Auth: Bearer API Key
Response: { tasks: [{ taskId, type, title, description, budget, deadline }] }
```

逻辑：
1. 鉴权：验证 API Key → 获取 agentId
2. 查询 status=OPEN 且类型匹配的任务
3. 按匹配引擎打分排序
4. 返回 top N

### [NEW] `src/app/api/agent-gateway/tasks/claim/route.ts` — 领取任务

```
POST /api/agent-gateway/tasks/claim
Body: { taskId }
Auth: Bearer API Key
Response: { orderId, executionId, status: "claimed" }
```

逻辑：
1. 鉴权
2. 检查 Agent 是否在线、是否达到每日上限
3. 检查任务是否仍为 OPEN
4. 创建 Order + Execution 记录
5. 冻结发单方余额（调用现有 `balance.ts`）
6. 更新 Task 状态为 MATCHED → IN_PROGRESS
7. 返回 orderId + executionId

### [NEW] `src/app/api/agent-gateway/tasks/[taskId]/detail/route.ts` — 获取任务详情

```
GET /api/agent-gateway/tasks/{taskId}/detail
Auth: Bearer API Key
Response: { title, description, inputFiles[], outputFormat, qualityCriteria, deadline }
```

逻辑：
1. 鉴权
2. 验证该 Agent 已领取该任务（有对应 Order）
3. 返回完整任务信息

### [NEW] `src/app/api/agent-gateway/executions/[executionId]/submit/route.ts` — 回传结果

```
POST /api/agent-gateway/executions/{executionId}/submit
Body: { result: string, outputFiles: [{ name, content }], metadata: {} }
Auth: Bearer API Key
Response: { received: true, autoReviewScore, autoReviewPassed }
```

逻辑：
1. 鉴权
2. 验证 executionId 对应的 Order 属于该 Agent
3. 保存输出内容（先存本地，后续改 S3/Supabase Storage）
4. 更新 Execution 状态为 COMPLETED
5. 运行 auto-review 引擎（调用现有 `auto-review.ts`）
6. 创建 Review 记录
7. 更新 Order 状态为 REVIEW
8. 返回验收结果

### [NEW] `src/app/api/agent-gateway/heartbeat/route.ts` — 心跳上报

```
POST /api/agent-gateway/heartbeat
Body: { executionId?, status: "alive" | "busy" | "idle" }
Auth: Bearer API Key
Response: { ack: true, pendingTaskCount?: number }
```

逻辑：
1. 鉴权
2. 更新 Agent 的 `lastHeartbeat` 和 `isOnline`
3. 如有 executionId，更新 Execution 的 `lastHeartbeatAt` 和 `heartbeatStatus`
4. 顺便返回待领取任务数量（方便 Agent 决策）

### 验证
- 用 curl / Postman 测试全部 5 个端点
- 测试完整流程：查询任务 → 领取 → 获取详情 → 提交结果 → 心跳
- 测试鉴权失败场景（无 Key、错误 Key、Key 不匹配 Agent）
- 测试边界情况（领取已被领取的任务、提交不存在的 execution 等）

---

## Phase 3：匹配引擎 + 现有 API 适配（Day 4）

### [MODIFY] [matching.ts](file:///d:/graduate_pojects/The%20pack/the-pack-main/src/lib/matching.ts)

新增两个硬性过滤条件：
```typescript
// Agent 必须在线
if (!agent.isOnline) return null;
// Agent 未达每日上限
if (agent.dailyCompleted >= agent.dailyLimit) return null;
```

新增查询字段：`isOnline`, `dailyCompleted`, `dailyLimit`

### [MODIFY] `src/app/api/executions/[orderId]/route.ts`

POST 触发执行：
- 旧逻辑：入 BullMQ 队列 → Docker 执行
- 新逻辑：创建 Execution 记录（状态 PENDING），等待 Agent 通过 Gateway API 提交结果
- 保留 BullMQ 用于超时监控：创建一个 delayed job，到 deadline 时检查是否已完成

### [MODIFY] `src/app/api/agents/[slug]/route.ts`

Agent 详情 API 增加返回：`isOnline`, `connectionType`, `autoAccept`, `dailyLimit`, `dailyCompleted`

### 验证
- 测试匹配引擎：离线 Agent 不应出现在推荐列表
- 测试达到上限的 Agent 不应出现
- 测试执行触发不再走 Docker 路径

---

## Phase 4：Worker 重写 + 监控系统（Day 5-6）

### [MODIFY] [worker/index.ts](file:///d:/graduate_pojects/The%20pack/the-pack-main/src/worker/index.ts)

完全重写。新 Worker 的职责：

```
1. 超时监控 Worker（每 60 秒）：
   - 查询所有 status=EXECUTING 且超过 deadline 的 Order
   - 标记 Execution 为 TIMEOUT
   - 标记 Order 为 CANCELLED
   - 退款给发单方

2. 心跳监控 Worker（每 60 秒）：
   - 查询所有 isOnline=true 的 Agent
   - 检查 lastHeartbeat 是否超时（> heartbeatInterval * 2）
   - 超时的标记 isOnline=false
   - 如果该 Agent 有 EXECUTING 的任务，标记 heartbeatStatus=STALE

3. 结算 Worker（BullMQ）：
   - 从 settlement 队列取任务
   - 执行结算逻辑（已有代码保留）

4. 每日重置（cron，每天 00:00）：
   - 所有 Agent 的 dailyCompleted 重置为 0
```

### [DELETE] [docker-executor.ts](file:///d:/graduate_pojects/The%20pack/the-pack-main/src/lib/docker-executor.ts)

完全删除。不再需要 Docker 执行。

### [NEW] `src/lib/heartbeat-monitor.ts` — 心跳监控逻辑

独立模块，被 Worker 调用。

### [NEW] `src/lib/timeout-monitor.ts` — 超时监控逻辑

独立模块，被 Worker 调用。

### 验证
- 模拟 Agent 领取任务后不提交，验证超时机制是否触发
- 模拟 Agent 停止心跳，验证是否标记为离线
- 验证结算流程是否正常

---

## Phase 5：MCP Server npm 包（Day 7-10）

### [NEW] `packages/thepack-mcp-server/` — 独立 npm 包

```
packages/thepack-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 入口：启动 MCP Server + 心跳后台进程
│   ├── server.ts             # MCP Server 定义（5 个工具）
│   ├── tools/
│   │   ├── get-pending-tasks.ts
│   │   ├── claim-task.ts
│   │   ├── get-task-detail.ts
│   │   ├── submit-result.ts
│   │   └── heartbeat.ts
│   ├── api-client.ts         # 封装 ThePack REST API 调用
│   ├── heartbeat-worker.ts   # 后台心跳线程
│   └── config.ts             # 配置（API Key、Server URL）
└── README.md
```

**5 个 MCP 工具定义：**

```typescript
// 1. get_pending_tasks — 查询待领取任务
server.tool("get_pending_tasks", {
  taskTypes: z.array(z.string()).optional(),
  limit: z.number().optional().default(5),
}, async (params) => { /* 调用 REST API */ });

// 2. claim_task — 领取任务
server.tool("claim_task", {
  taskId: z.string(),
}, async (params) => { /* 调用 REST API */ });

// 3. get_task_detail — 获取任务详情
server.tool("get_task_detail", {
  taskId: z.string(),
}, async (params) => { /* 调用 REST API */ });

// 4. submit_result — 提交执行结果
server.tool("submit_result", {
  executionId: z.string(),
  result: z.string(),
  outputFiles: z.array(z.object({ name: z.string(), content: z.string() })).optional(),
}, async (params) => { /* 调用 REST API */ });

// 5. heartbeat — 心跳（通常由后台自动调用，但也可手动）
server.tool("heartbeat", {
  status: z.enum(["alive", "busy", "idle"]).default("alive"),
}, async (params) => { /* 调用 REST API */ });
```

**心跳后台进程：**
```typescript
// MCP Server 启动时，同时启动心跳
// 每 30 秒自动调用 POST /api/agent-gateway/heartbeat
// 不依赖 Claude 调用，完全独立运行
```

**Owner 安装方式：**
```bash
claude mcp add thepack -- npx thepack-mcp-server --agent-key=tpk_xxxxx --server-url=https://thepack.app
```

### 验证
- 用 `mcp-inspector` 工具测试 Server 的工具定义是否正确
- 在 Claude Code 中安装并测试完整流程：
  1. 安装 MCP Server
  2. 让 Claude 查询任务
  3. 领取一个测试任务
  4. 让 Claude 执行（写一段内容）
  5. 提交结果
  6. 验证 ThePack 后端收到结果并完成 auto-review
- 验证心跳后台进程正常运行
- 验证 Claude Code 关闭后心跳停止、Agent 被标记为离线

---

## Phase 6：前端适配 + 修复（Day 11-12）

### [MODIFY] Agent 详情页组件

- 显示 Agent 在线状态（绿色/灰色圆点）
- 显示连接类型（MCP / OpenClaw / Coze 等）
- 显示今日接单量 / 每日上限

### [MODIFY] Agent 市场页

- 新增"在线筛选"过滤器
- 列表中显示在线/离线状态

### [MODIFY] Dashboard

- Agent Owner 视角：显示自己的 Agent 在线状态、今日接单数
- Publisher 视角：显示匹配到的 Agent 的在线状态

### [MODIFY] 订单详情页

- 增加远端执行状态展示（心跳状态、执行来源）
- 增加"Agent 已离线"告警提示

### 修复已知 Bug

- **creditTier 同步**：Review API 中更新 creditScore 后同步更新 creditTier

### 验证
- 检查所有页面显示正常
- 测试在线/离线状态实时更新

---

## 文件变更汇总

| 操作 | 文件 | Phase |
|---|---|---|
| MODIFY | `prisma/schema.prisma` | 1 |
| MODIFY | `prisma/seed.ts` | 1 |
| NEW | `src/lib/agent-auth.ts` | 2 |
| NEW | `src/app/api/agent-gateway/tasks/pending/route.ts` | 2 |
| NEW | `src/app/api/agent-gateway/tasks/claim/route.ts` | 2 |
| NEW | `src/app/api/agent-gateway/tasks/[taskId]/detail/route.ts` | 2 |
| NEW | `src/app/api/agent-gateway/executions/[executionId]/submit/route.ts` | 2 |
| NEW | `src/app/api/agent-gateway/heartbeat/route.ts` | 2 |
| MODIFY | `src/lib/matching.ts` | 3 |
| MODIFY | `src/app/api/executions/[orderId]/route.ts` | 3 |
| MODIFY | `src/app/api/agents/[slug]/route.ts` | 3 |
| DELETE | `src/lib/docker-executor.ts` | 4 |
| MODIFY | `src/worker/index.ts` | 4 |
| NEW | `src/lib/heartbeat-monitor.ts` | 4 |
| NEW | `src/lib/timeout-monitor.ts` | 4 |
| NEW | `packages/thepack-mcp-server/*` (整个包) | 5 |
| MODIFY | 前端组件（Agent 详情、市场、Dashboard、订单详情） | 6 |
| MODIFY | `src/app/api/reviews/[orderId]/route.ts`（修复 creditTier bug） | 6 |

---

## 时间估算

| Phase | 内容 | 预估 |
|---|---|---|
| Phase 1 | Schema 扩展 + 种子数据 | 1 天 |
| Phase 2 | Agent Gateway REST API | 2 天 |
| Phase 3 | 匹配引擎 + 现有 API 适配 | 1 天 |
| Phase 4 | Worker 重写 + 监控 | 2 天 |
| Phase 5 | MCP Server npm 包 | 3-4 天 |
| Phase 6 | 前端适配 + 修复 | 2 天 |
| **总计** | | **11-12 天** |

---

## Open Questions

> [!IMPORTANT]
> **Q1：输出文件存储**
> Agent 提交的结果文件（outputFiles），MVP 阶段先存本地磁盘还是直接上 Supabase Storage？
> - 本地磁盘：简单，但部署后会丢
> - Supabase Storage：稍复杂，但一步到位

> [!IMPORTANT]
> **Q2：MCP Server npm 包是否发布到 npm**
> - 发布到 npm：Owner 可以 `npx thepack-mcp-server` 直接用，体验最好
> - 不发布：Owner 需要 clone 仓库手动运行，适合开发阶段
> 建议：开发阶段先不发布，放在 monorepo 的 `packages/` 目录下。等稳定后再发布。

> [!IMPORTANT]
> **Q3：Phase 的执行顺序**
> 上面的 Phase 1-6 是我建议的顺序。Phase 1-4 是后端核心改造，Phase 5 是 MCP Server 开发，Phase 6 是前端。你想先做哪一部分？还是按顺序来？
