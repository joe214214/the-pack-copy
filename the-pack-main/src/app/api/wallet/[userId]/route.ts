/**
 * GET /api/wallet/[userId]  — balance + transaction history
 * GET /api/wallet/me        — current user's wallet
 *
 * The history IS the ledger: one line per ledger movement that touched this
 * user's available balance or escrow, so the list always explains the balance
 * (src/lib/ledger.ts, scripts/reconcile-ledger.ts). Orders settled before the
 * ledger existed are shown as read-only "legacy" lines; their effect is already
 * inside the opening balance.
 *
 * totalSpent / totalEarned come from Settlement rows — the same source as the
 * dashboard and worker dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const n = (v: unknown) => Number(v ?? 0);

type TxType = "escrow" | "charge" | "fee" | "refund" | "earning" | "deposit" | "adjustment" | "opening";
interface WalletTx {
  id: string;
  type: TxType;
  /** Effect on the available balance (+ in, − out). */
  amount: number;
  /** Effect on escrow (+ frozen, − released or spent). */
  escrowDelta: number;
  description: string;
  taskTitle: string;
  agentName: string;
  orderId: string | null;
  date: string;
  status: "completed" | "held" | "legacy";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;
  const resolvedId = userId === "me" ? sessionUser.id : userId;
  if (resolvedId !== sessionUser.id && !sessionUser.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: resolvedId },
      select: { id: true, balance: true, frozenBalance: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [entries, ledgerStart, spentAgg, earnedAgg] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { userId: resolvedId },
        orderBy: { createdAt: "desc" },
        take: 300,
        include: { order: { select: { id: true, publisherId: true, task: { select: { title: true } }, agent: { select: { name: true } } } } },
      }),
      prisma.ledgerEntry.findFirst({ where: { userId: resolvedId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      prisma.settlement.aggregate({ _sum: { totalAmount: true }, where: { status: "COMPLETED", order: { publisherId: resolvedId } } }),
      prisma.settlement.aggregate({ _sum: { agentPayout: true }, where: { status: "COMPLETED", order: { agent: { ownerId: resolvedId } } } }),
    ]);

    // One line per ledger group (a group can have an AVAILABLE and an ESCROW leg for this user).
    const groups = new Map<string, WalletTx>();
    for (const e of entries) {
      let tx = groups.get(e.groupId);
      if (!tx) {
        const isPublisher = e.order?.publisherId === resolvedId;
        const type: TxType =
          e.kind === "ESCROW_HOLD" || e.kind === "EXTRA_REVISION" ? "escrow"
          : e.kind === "ESCROW_RELEASE" ? "refund"
          : e.kind === "PAYOUT" ? (isPublisher ? "charge" : "earning")
          : e.kind === "PLATFORM_FEE" ? "fee"
          : e.kind === "DEPOSIT" ? "deposit"
          : e.kind === "OPENING_BALANCE" ? "opening"
          : "adjustment";
        const description: Record<TxType, string> = {
          escrow: e.kind === "EXTRA_REVISION" ? "Extra revision rounds (held in escrow)" : "Funds held in escrow",
          refund: "Escrow returned",
          charge: "Paid to agent",
          fee: "Platform fee",
          earning: "Agent payout",
          deposit: "Deposit",
          adjustment: "Balance adjustment",
          opening: "Opening balance",
        };
        tx = {
          id: e.groupId,
          type,
          amount: 0,
          escrowDelta: 0,
          description: e.memo && (type === "adjustment" || type === "refund") ? `${description[type]}: ${e.memo}` : description[type],
          taskTitle: e.order?.task?.title ?? "",
          agentName: e.order?.agent?.name ?? "",
          orderId: e.orderId,
          date: e.createdAt.toISOString(),
          status: type === "escrow" ? "held" : "completed",
        };
        groups.set(e.groupId, tx);
      }
      if (e.account === "AVAILABLE") tx.amount += n(e.amount);
      if (e.account === "ESCROW") tx.escrowDelta += n(e.amount);
    }
    const transactions = [...groups.values()];

    // Settlements from before the ledger, for context only.
    if (ledgerStart) {
      const legacy = await prisma.settlement.findMany({
        where: {
          settledAt: { lt: ledgerStart.createdAt },
          order: { OR: [{ publisherId: resolvedId }, { agent: { ownerId: resolvedId } }] },
        },
        include: { order: { select: { id: true, publisherId: true, task: { select: { title: true } }, agent: { select: { name: true } } } } },
        orderBy: { settledAt: "desc" },
        take: 100,
      });
      for (const s of legacy) {
        const asPublisher = s.order.publisherId === resolvedId;
        transactions.push({
          id: `legacy-${s.id}`,
          type: asPublisher ? "charge" : "earning",
          amount: asPublisher ? -n(s.totalAmount) : n(s.agentPayout),
          escrowDelta: 0,
          description: asPublisher ? "Paid for task (before the ledger)" : "Agent payout (before the ledger)",
          taskTitle: s.order.task?.title ?? "",
          agentName: s.order.agent?.name ?? "",
          orderId: s.order.id,
          date: (s.settledAt ?? s.createdAt).toISOString(),
          status: "legacy",
        });
      }
    }

    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      balance: n(user.balance),
      frozenBalance: n(user.frozenBalance),
      totalBalance: n(user.balance) + n(user.frozenBalance),
      totalSpent: n(spentAgg._sum.totalAmount),
      totalEarned: n(earnedAgg._sum.agentPayout),
      transactions,
    });
  } catch (error) {
    console.error("[GET /api/wallet/[userId]]", error);
    return NextResponse.json({ error: "Failed to fetch wallet" }, { status: 500 });
  }
}
