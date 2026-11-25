/**
 * Order lifecycle — the ONLY code allowed to change Task / Order / Execution
 * status or to move an order's money.
 *
 * Every operation here:
 *   - runs in ONE database transaction, so Task, Order, Execution, the ledger
 *     and agent stats can never disagree with each other;
 *   - changes status with a compare-and-set (`updateMany where status in
 *     [allowed from-states]`), so a stale read or a concurrent request cannot
 *     apply a transition twice — the loser gets a LifecycleError (HTTP 409);
 *   - moves money only through src/lib/ledger.ts.
 *
 * State machine (Order), with the Task / Execution side effects:
 *
 *   openOrder       (task OPEN)            -> EXECUTING     task IN_PROGRESS, exec PENDING, escrow held
 *   markDelivered   EXECUTING | REVISION_REQUESTED -> REVIEW   exec COMPLETED, deliveredAt = now
 *   requestRevision REVIEW                 -> REVISION_REQUESTED  exec RUNNING
 *   acceptOrder     REVIEW                 -> SETTLED       task COMPLETED, escrow -> owner + fee
 *   disputeOrder    REVIEW                 -> DISPUTED      (funds stay in escrow)
 *   cancelOrder     EXECUTING | REVISION_REQUESTED (| legacy CREATED/FUNDED)
 *                                          -> CANCELLED     task CANCELLED, exec FAILED, escrow refunded
 *   resolveDispute  DISPUTED               -> SETTLED (pay / split) | REFUNDED (refund)
 *
 * SETTLED, REFUNDED and CANCELLED are terminal. ACCEPTED is no longer written
 * (accepting settles immediately); it is still read for legacy rows.
 *
 * Capability tests (Task.isQualification) use the same rows but never touch
 * the ledger, credit records or agent stats, and have their own transitions:
 *
 *   openQualification                      -> EXECUTING     task IN_PROGRESS, exec PENDING, price 0
 *   finishQualification EXECUTING          -> SETTLED (passed) | CANCELLED (failed)
 *                                                           exec COMPLETED; on pass the type moves
 *                                                           from agent.pendingTaskTypes to supportedTaskTypes
 *   expireQualification EXECUTING          -> CANCELLED     exec TIMEOUT (run by runOrderMaintenance)
 */
import { prisma } from "@/lib/prisma";
import type { OrderStatus, TaskStatus, TaskType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { holdEscrow, releaseEscrow, payOut, adminAdjust, post, splitFee, toCents, type Tx } from "@/lib/ledger";
import { calculateFees } from "@/lib/fees";
import { getFileUrl } from "@/lib/storage";
import { deriveCreditTier } from "@/lib/credit-tiers";

export class LifecycleError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
    this.name = "LifecycleError";
  }
}

/** How long a delivery may sit in REVIEW before it is accepted automatically. */
export const AUTO_ACCEPT_DAYS = Number(process.env.AUTO_ACCEPT_DAYS || 7);

/** Statuses during which the publisher's money is held in escrow for the order. */
export const ESCROW_HOLDING: OrderStatus[] = [
  "CREATED", "FUNDED", "EXECUTING", "REVIEW", "REVISION_REQUESTED", "DISPUTED", "ACCEPTED",
];

// ─── Compare-and-set helpers ────────────────────────────────────────────────

async function moveOrder(tx: Tx, orderId: string, from: OrderStatus[], data: Record<string, unknown>) {
  const r = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data });
  if (r.count !== 1) {
    const cur = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!cur) throw new LifecycleError("Order not found", 404);
    throw new LifecycleError(`Order is ${cur.status}; expected ${from.join(" or ")}`);
  }
}

async function moveTask(tx: Tx, taskId: string, to: TaskStatus) {
  await tx.task.update({ where: { id: taskId }, data: { status: to } });
}

async function audit(tx: Tx, actorId: string | null, action: string, orderId: string, details?: object) {
  await tx.auditLog.create({
    data: { actorId, action, entityType: "order", entityId: orderId, details: details ?? {} },
  });
}

async function loadOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { agent: { select: { id: true, ownerId: true } }, execution: { select: { id: true, status: true } }, review: true },
  });
  if (!order) throw new LifecycleError("Order not found", 404);
  return order;
}

// ─── Agent stats, recomputed from the source rows (never incremented blindly) ─

export async function recomputeAgentStats(tx: Tx, agentId: string) {
  const real = { agentId, task: { isQualification: false } };
  const [totalOrders, settled, records, rated] = await Promise.all([
    tx.order.count({ where: real }),
    tx.order.aggregate({ where: { ...real, status: "SETTLED" }, _count: { _all: true }, _avg: { price: true } }),
    tx.creditRecord.findMany({ where: { agentId }, select: { successScore: true, qualityScore: true, ratingScore: true } }),
    tx.review.aggregate({ where: { order: real, userRating: { not: null } }, _avg: { userRating: true } }),
  ]);
  const n = records.length;
  const avg = (k: "successScore" | "qualityScore" | "ratingScore") =>
    n ? records.reduce((s, r) => s + Number(r[k]), 0) / n : 0;
  const creditScore = n ? avg("successScore") * 0.4 + avg("qualityScore") * 0.35 + avg("ratingScore") * 0.25 : 0;
  await tx.agent.update({
    where: { id: agentId },
    data: {
      totalOrders,
      completedOrders: settled._count._all,
      successRate: avg("successScore"),
      creditScore,
      creditTier: deriveCreditTier(creditScore),
      avgRating: rated._avg.userRating ?? 0,
      avgCost: settled._avg.price ?? 0,
    },
  });
}

/** One CreditRecord per finished order: success on settle, failure on timeout / refunded dispute. */
async function recordOutcome(tx: Tx, order: { id: string; agentId: string; deadline: Date | null; review: { autoScore: unknown } | null }, success: boolean, rating?: number) {
  await tx.creditRecord.upsert({
    where: { orderId: order.id },
    create: {
      agentId: order.agentId,
      orderId: order.id,
      successScore: success ? 1 : 0,
      timelinessScore: !order.deadline || new Date() <= order.deadline ? 1 : 0.5,
      qualityScore: Number(order.review?.autoScore ?? (success ? 0.7 : 0)),
      ratingScore: rating ? (rating - 1) / 4 : success ? 0.7 : 0,
    },
    update: {},
  });
}

// ─── Operations ─────────────────────────────────────────────────────────────

/**
 * Starts work: binds an OPEN task to an agent, holds the task budget in the
 * publisher's escrow, creates the EXECUTING order and its PENDING execution.
 * Used by both the web "Take this task" (assign) and the agent's claim_task.
 * The price is ALWAYS the task budget — the publisher agreed to that number.
 */
export async function openOrder(a: { taskId: string; agentId: string; actorId: string | null; source: "assign" | "claim" }) {
  return prisma.$transaction(async (tx) => {
    const agent = await tx.agent.findUnique({ where: { id: a.agentId } });
    if (!agent) throw new LifecycleError("Agent not found", 404);
    if (agent.status !== "ACTIVE") throw new LifecycleError("Agent is not active");

    const task = await tx.task.findUnique({ where: { id: a.taskId }, include: { order: { select: { id: true } } } });
    if (!task) throw new LifecycleError("Task not found", 404);
    if (task.order) throw new LifecycleError("Task has already been taken");
    if (task.publisherId === agent.ownerId) throw new LifecycleError("An agent cannot take its own owner's task", 403);
    if (!agent.supportedTaskTypes.includes(task.type)) throw new LifecycleError(`Agent does not support ${task.type}`);

    // Claim the task first: only one request can flip it out of OPEN.
    const claimed = await tx.task.updateMany({ where: { id: task.id, status: "OPEN" }, data: { status: "IN_PROGRESS" } });
    if (claimed.count !== 1) throw new LifecycleError(`Task is ${task.status}, not available`);

    const price = Number(task.budget);
    const { platformFee, escrowAmount } = calculateFees(price);
    const order = await tx.order.create({
      data: {
        taskId: task.id,
        agentId: agent.id,
        publisherId: task.publisherId,
        price,
        platformFee,
        escrowAmount,
        paymentMethod: "BALANCE",
        status: "EXECUTING",
        deadline: new Date(Date.now() + task.deadlineHours * 3600_000),
      },
    });
    // Throws InsufficientFundsError (rolling everything back) if the publisher can't cover it.
    await holdEscrow(tx, { publisherId: task.publisherId, orderId: order.id, amount: escrowAmount, actorId: a.actorId });

    const execution = await tx.execution.create({
      data: { orderId: order.id, executionSource: agent.connectionType, status: "PENDING" },
    });
    await tx.agent.update({ where: { id: agent.id }, data: { totalOrders: { increment: 1 } } });
    await audit(tx, a.actorId, `order.open.${a.source}`, order.id, { taskId: task.id, agentId: agent.id, escrowAmount });
    return { orderId: order.id, executionId: execution.id };
  });
}

/**
 * The agent delivered a round. Called from the submit route's transaction
 * after it has written outputFiles and the auto-review.
 */
export async function markDelivered(tx: Tx, a: { orderId: string; executionId: string }) {
  const ex = await tx.execution.updateMany({
    where: { id: a.executionId, status: { in: ["PENDING", "RUNNING"] } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (ex.count !== 1) throw new LifecycleError("Execution is not accepting submissions");
  await moveOrder(tx, a.orderId, ["EXECUTING", "REVISION_REQUESTED"], { status: "REVIEW", deliveredAt: new Date() });
}

/** Publisher asks for another round. Called inside the revision route's transaction. */
export async function markRevisionRequested(tx: Tx, a: { orderId: string; executionId: string; deadline: Date }) {
  await moveOrder(tx, a.orderId, ["REVIEW"], {
    status: "REVISION_REQUESTED",
    currentRound: { increment: 1 },
    deadline: a.deadline,
    deliveredAt: null,
  });
  await tx.execution.update({ where: { id: a.executionId }, data: { status: "RUNNING", completedAt: null } });
}

/**
 * Publisher (or the 7-day timer) accepts the delivery: the whole escrow is
 * paid out — agent owner gets it minus the platform fee — and the task closes.
 */
export async function acceptOrder(a: { orderId: string; actorId: string | null; rating?: number; comment?: string; auto?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, a.orderId);
    // ACCEPTED is a legacy state: the old PATCH accept set it without paying
    // anyone. Settling it here finishes what that call should have done.
    await moveOrder(tx, order.id, ["REVIEW", "ACCEPTED"], { status: "SETTLED" });

    const total = Number(order.escrowAmount);
    const { fee, payout } = await payOut(tx, {
      publisherId: order.publisherId,
      agentOwnerId: order.agent.ownerId,
      orderId: order.id,
      amount: total,
      actorId: a.actorId,
      memo: a.auto ? `Auto-accepted after ${AUTO_ACCEPT_DAYS} days in review` : undefined,
    });
    await tx.settlement.create({
      data: { orderId: order.id, totalAmount: total, platformFee: fee, agentPayout: payout, status: "COMPLETED", settledAt: new Date() },
    });
    await tx.review.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, reviewerId: a.actorId, userAccepted: true, userRating: a.rating, userComment: a.comment },
      update: { reviewerId: a.actorId, userAccepted: true, userRating: a.rating, userComment: a.comment },
    });
    await moveTask(tx, order.taskId, "COMPLETED");
    await recordOutcome(tx, order, true, a.rating);
    await recomputeAgentStats(tx, order.agentId);
    await audit(tx, a.actorId, a.auto ? "order.auto_accept" : "order.accept", order.id, { total, fee, payout });
    return { total, fee, payout };
  });
}

/** Publisher rejects the delivery. Funds stay in escrow until an admin resolves it. */
export async function disputeOrder(a: { orderId: string; actorId: string; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, a.orderId);
    await moveOrder(tx, order.id, ["REVIEW"], { status: "DISPUTED" });
    await tx.review.updateMany({ where: { orderId: order.id }, data: { reviewerId: a.actorId, userAccepted: false, userComment: a.reason } });
    const dispute = await tx.dispute.create({
      data: { orderId: order.id, raisedById: a.actorId, reason: a.reason || "Output rejected by publisher", status: "OPEN" },
    });
    await audit(tx, a.actorId, "order.dispute", order.id, { disputeId: dispute.id });
    return { disputeId: dispute.id };
  });
}

/**
 * Stops an order before it is delivered and refunds the publisher in full.
 * kind "timeout" also counts against the agent's reputation.
 */
export async function cancelOrder(a: { orderId: string; actorId: string | null; reason: string; kind: "cancel" | "timeout" | "admin" }) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, a.orderId);
    await moveOrder(tx, order.id, ["CREATED", "FUNDED", "EXECUTING", "REVISION_REQUESTED"], { status: "CANCELLED" });
    if (order.execution) {
      await tx.execution.updateMany({
        where: { id: order.execution.id, status: { in: ["PENDING", "RUNNING"] } },
        data: { status: a.kind === "timeout" ? "TIMEOUT" : "FAILED", errorMessage: a.reason, completedAt: new Date() },
      });
    }
    await releaseEscrow(tx, { publisherId: order.publisherId, orderId: order.id, amount: Number(order.escrowAmount), actorId: a.actorId, memo: a.reason });
    await moveTask(tx, order.taskId, "CANCELLED");
    if (a.kind === "timeout") await recordOutcome(tx, order, false);
    await recomputeAgentStats(tx, order.agentId);
    await audit(tx, a.actorId, `order.${a.kind}`, order.id, { reason: a.reason, refunded: Number(order.escrowAmount) });
  });
}

/**
 * Admin decision on a DISPUTED order.
 *   pay    — agent owner is paid in full (minus fee), as if accepted
 *   refund — publisher gets everything back
 *   split  — agentShare (0..1) of the escrow is paid out, the rest refunded
 */
export async function resolveDispute(a: { orderId: string; adminId: string; outcome: "pay" | "refund" | "split"; agentShare?: number; note: string }) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, a.orderId);
    const total = Number(order.escrowAmount);
    const share = a.outcome === "pay" ? 1 : a.outcome === "refund" ? 0 : Math.min(1, Math.max(0, a.agentShare ?? 0.5));
    const toAgent = Math.round(toCents(total) * share) / 100;
    const toPublisher = Math.round((total - toAgent) * 100) / 100;

    await moveOrder(tx, order.id, ["DISPUTED"], { status: toAgent > 0 ? "SETTLED" : "REFUNDED" });
    let fee = 0, payout = 0;
    if (toAgent > 0) {
      ({ fee, payout } = await payOut(tx, { publisherId: order.publisherId, agentOwnerId: order.agent.ownerId, orderId: order.id, amount: toAgent, actorId: a.adminId, memo: `Dispute resolved: ${a.note}` }));
      await tx.settlement.create({ data: { orderId: order.id, totalAmount: toAgent, platformFee: fee, agentPayout: payout, status: "COMPLETED", settledAt: new Date() } });
    }
    if (toPublisher > 0) {
      await releaseEscrow(tx, { publisherId: order.publisherId, orderId: order.id, amount: toPublisher, actorId: a.adminId, memo: `Dispute resolved: ${a.note}` });
    }
    await tx.dispute.updateMany({
      where: { orderId: order.id, status: { not: "RESOLVED" } },
      data: { status: "RESOLVED", resolution: `${a.outcome} (${Math.round(share * 100)}% to agent): ${a.note}`, resolvedById: a.adminId, resolvedAt: new Date() },
    });
    await moveTask(tx, order.taskId, toAgent > 0 ? "COMPLETED" : "CANCELLED");
    await recordOutcome(tx, order, share >= 0.5);
    await recomputeAgentStats(tx, order.agentId);
    await audit(tx, a.adminId, "order.dispute_resolve", order.id, { outcome: a.outcome, toAgent, toPublisher, fee, payout });
    return { toAgent, toPublisher, fee, payout };
  });
}

/**
 * Publisher buys extra revision rounds. The cost (10% of the order price per
 * round) goes INTO this order's escrow, so it is paid to the agent owner on
 * settlement — or refunded with everything else on cancel.
 */
export async function buyExtraRevisions(a: { orderId: string; actorId: string; rounds: number; costPerRound: number }) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, a.orderId);
    const cost = Math.round(a.costPerRound * a.rounds * 100) / 100;
    await moveOrder(tx, order.id, ["EXECUTING", "REVIEW", "REVISION_REQUESTED"], {
      extraRevisions: { increment: a.rounds },
      escrowAmount: { increment: cost },
    });
    await holdEscrow(tx, { publisherId: order.publisherId, orderId: order.id, amount: cost, actorId: a.actorId, kind: "EXTRA_REVISION", memo: `${a.rounds} extra revision round(s)` });
    await audit(tx, a.actorId, "order.extra_revisions", order.id, { rounds: a.rounds, cost });
    return { cost };
  });
}

/** Admin credit (+) or debit (-) of a user's available balance, with a reason. */
export async function adjustBalance(a: { userId: string; amount: number; adminId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const groupId = await adminAdjust(tx, a);
    await tx.auditLog.create({
      data: { actorId: a.adminId, action: "user.balance_adjust", entityType: "user", entityId: a.userId, details: { amount: a.amount, reason: a.reason, groupId } },
    });
    return { groupId };
  });
}

/**
 * How much of a user's frozen balance is NOT backed by any order still holding
 * escrow. Old code could delete or settle orders without releasing their
 * escrow, leaving money frozen with nothing behind it.
 */
export async function unbackedEscrow(userId: string, tx: Tx = prisma) {
  const [user, held] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, select: { frozenBalance: true } }),
    tx.order.aggregate({ where: { publisherId: userId, status: { in: ESCROW_HOLDING } }, _sum: { escrowAmount: true } }),
  ]);
  const cents = toCents(user?.frozenBalance ?? 0) - toCents(held._sum.escrowAmount ?? 0);
  return Math.max(0, cents) / 100;
}

/** Admin returns unbacked frozen money to the user's available balance. */
export async function releaseUnbackedEscrow(a: { userId: string; adminId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const amount = await unbackedEscrow(a.userId, tx);
    if (amount <= 0) throw new LifecycleError("All of this user's frozen balance is backed by active orders");
    const groupId = await post(tx, {
      kind: "ADMIN_ADJUSTMENT",
      actorId: a.adminId,
      memo: `Released unbacked escrow: ${a.reason}`,
      legs: [
        { account: "ESCROW", userId: a.userId, amount: -amount },
        { account: "AVAILABLE", userId: a.userId, amount },
      ],
    });
    await tx.auditLog.create({
      data: { actorId: a.adminId, action: "user.release_unbacked_escrow", entityType: "user", entityId: a.userId, details: { amount, reason: a.reason, groupId } },
    });
    return { amount };
  });
}

// ─── Scheduled maintenance (worker / cron) ──────────────────────────────────

/**
 * Times out undelivered orders past their deadline and auto-accepts
 * deliveries that sat in REVIEW for AUTO_ACCEPT_DAYS. Each order is handled in
 * its own transaction; a failure on one never blocks or repeats the others,
 * because the compare-and-set makes a second attempt a no-op.
 */
export async function runOrderMaintenance(now = new Date()) {
  const result = { timedOut: 0, autoAccepted: 0, errors: [] as string[] };

  const overdue = await prisma.order.findMany({
    where: { status: { in: ["EXECUTING", "REVISION_REQUESTED"] }, deadline: { lt: now } },
    select: { id: true, task: { select: { isQualification: true } } },
  });
  for (const o of overdue) {
    try {
      // A capability test that was never handed in just lapses: no refund to
      // make and no failure to put on the agent's credit record.
      if (o.task.isQualification) await expireQualification(o.id);
      else await cancelOrder({ orderId: o.id, actorId: null, kind: "timeout", reason: "Deadline passed without a delivery" });
      result.timedOut++;
    } catch (e) {
      result.errors.push(`timeout ${o.id}: ${(e as Error).message}`);
    }
  }

  const cutoff = new Date(now.getTime() - AUTO_ACCEPT_DAYS * 86400_000);
  const stale = await prisma.order.findMany({
    where: {
      status: "REVIEW",
      OR: [{ deliveredAt: { lt: cutoff } }, { deliveredAt: null, updatedAt: { lt: cutoff } }],
    },
    select: { id: true },
  });
  for (const o of stale) {
    try {
      await acceptOrder({ orderId: o.id, actorId: null, auto: true });
      result.autoAccepted++;
    } catch (e) {
      result.errors.push(`auto-accept ${o.id}: ${(e as Error).message}`);
    }
  }
  return result;
}

// ─── Capability tests ───────────────────────────────────────────────────────

/** Statuses in which a capability test is still waiting for the agent. */
const QUALIFICATION_OPEN: OrderStatus[] = ["EXECUTING"];

/**
 * Issues a capability test to an agent as a free job. `inputFileId`, when
 * given, is an already-uploaded task-inputs file that becomes the job's input.
 * Refuses a second open test of the same type for the same agent.
 */
export async function openQualification(a: {
  agentId: string;
  publisherId: string;
  type: TaskType;
  spec: Prisma.InputJsonValue;
  brief: { title: string; description: string; outputFormat: string };
  deadlineHours: number;
  inputFileId?: string;
  actorId: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.order.findFirst({
      where: { agentId: a.agentId, status: { in: QUALIFICATION_OPEN }, task: { isQualification: true, type: a.type } },
      select: { id: true },
    });
    if (open) throw new LifecycleError("A test of this type is already waiting for this agent");

    const task = await tx.task.create({
      data: {
        publisherId: a.publisherId,
        type: a.type,
        title: a.brief.title,
        description: a.brief.description,
        outputFormat: a.brief.outputFormat,
        budget: 0,
        deadlineHours: a.deadlineHours,
        maxRevisions: 0,
        qualityCriteria: {},
        inputFiles: [],
        status: "IN_PROGRESS",
        isQualification: true,
        qualificationSpec: a.spec,
      },
    });
    if (a.inputFileId) {
      const file = await tx.file.update({ where: { id: a.inputFileId }, data: { taskId: task.id } });
      await tx.task.update({
        where: { id: task.id },
        data: {
          inputFiles: [{ id: file.id, name: file.filename, url: getFileUrl(file.key), size: file.size, type: file.contentType }],
        },
      });
    }
    const order = await tx.order.create({
      data: {
        taskId: task.id,
        agentId: a.agentId,
        publisherId: a.publisherId,
        price: 0,
        platformFee: 0,
        escrowAmount: 0,
        status: "EXECUTING",
        deadline: new Date(Date.now() + a.deadlineHours * 3600_000),
      },
    });
    const execution = await tx.execution.create({ data: { orderId: order.id, status: "PENDING" } });
    await audit(tx, a.actorId, "qualification.open", order.id, { agentId: a.agentId, type: a.type });
    return { taskId: task.id, orderId: order.id, executionId: execution.id };
  });
}

/**
 * Closes a graded capability test. Runs inside the submit route's
 * transaction, after the outputs and the grading are written. On a pass the
 * type becomes work the agent can be given.
 */
export async function finishQualification(tx: Tx, a: { orderId: string; executionId: string; agentId: string; type: TaskType; passed: boolean }) {
  const ex = await tx.execution.updateMany({
    where: { id: a.executionId, status: { in: ["PENDING", "RUNNING"] } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (ex.count !== 1) throw new LifecycleError("Execution is not accepting submissions");
  const order = await tx.order.findUniqueOrThrow({ where: { id: a.orderId }, select: { taskId: true } });
  await moveOrder(tx, a.orderId, QUALIFICATION_OPEN, { status: a.passed ? "SETTLED" : "CANCELLED", deliveredAt: new Date() });
  await moveTask(tx, order.taskId, a.passed ? "COMPLETED" : "CANCELLED");
  if (a.passed) await grantTaskType(tx, a.agentId, a.type);
  await audit(tx, null, a.passed ? "qualification.pass" : "qualification.fail", a.orderId, { agentId: a.agentId, type: a.type });
}

/** A test nobody handed in before its deadline. */
export async function expireQualification(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    await moveOrder(tx, order.id, QUALIFICATION_OPEN, { status: "CANCELLED" });
    if (order.execution) {
      await tx.execution.updateMany({
        where: { id: order.execution.id, status: { in: ["PENDING", "RUNNING"] } },
        data: { status: "TIMEOUT", errorMessage: "The test was not handed in before its deadline", completedAt: new Date() },
      });
    }
    await moveTask(tx, order.taskId, "CANCELLED");
    await audit(tx, null, "qualification.expire", order.id, { agentId: order.agentId });
  });
}

async function grantTaskType(tx: Tx, agentId: string, type: TaskType) {
  const agent = await tx.agent.findUniqueOrThrow({
    where: { id: agentId },
    select: { supportedTaskTypes: true, acceptTaskTypes: true, pendingTaskTypes: true },
  });
  const add = (xs: TaskType[]) => (xs.includes(type) ? xs : [...xs, type]);
  await tx.agent.update({
    where: { id: agentId },
    data: {
      supportedTaskTypes: add(agent.supportedTaskTypes),
      acceptTaskTypes: add(agent.acceptTaskTypes),
      pendingTaskTypes: agent.pendingTaskTypes.filter((t) => t !== type),
    },
  });
}

/** Admin takes a type back (e.g. a test image turned out to be a stock photo). */
export async function revokeTaskType(a: { agentId: string; type: TaskType; adminId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const agent = await tx.agent.findUniqueOrThrow({
      where: { id: a.agentId },
      select: { supportedTaskTypes: true, acceptTaskTypes: true, pendingTaskTypes: true },
    });
    if (!agent.supportedTaskTypes.includes(a.type)) throw new LifecycleError("The agent does not have this type");
    await tx.agent.update({
      where: { id: a.agentId },
      data: {
        supportedTaskTypes: agent.supportedTaskTypes.filter((t) => t !== a.type),
        acceptTaskTypes: agent.acceptTaskTypes.filter((t) => t !== a.type),
        pendingTaskTypes: agent.pendingTaskTypes.includes(a.type) ? agent.pendingTaskTypes : [...agent.pendingTaskTypes, a.type],
      },
    });
    await tx.auditLog.create({
      data: { actorId: a.adminId, action: "qualification.revoke", entityType: "agent", entityId: a.agentId, details: { type: a.type, reason: a.reason } },
    });
  });
}

export { splitFee };
