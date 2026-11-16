/**
 * The single source of truth for what each status means, how it is labelled,
 * and which bucket it falls in. Every list, count, filter tab and badge uses
 * these — so an order cannot show as "active" on one page and vanish from the
 * "active" filter on another. Pure data: safe to import from client components.
 */

export const ORDER_STATUSES = [
  "CREATED", "FUNDED", "EXECUTING", "REVIEW", "REVISION_REQUESTED",
  "ACCEPTED", "DISPUTED", "SETTLED", "REFUNDED", "CANCELLED",
] as const;
export type OrderStatusId = (typeof ORDER_STATUSES)[number];

export const TASK_STATUSES = ["DRAFT", "OPEN", "MATCHED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type TaskStatusId = (typeof TASK_STATUSES)[number];

/** Buckets used by filters, tabs and dashboard counts. Every status is in exactly one. */
export const ORDER_GROUPS = {
  /** The agent is (or should be) working on it. */
  in_progress: ["CREATED", "FUNDED", "EXECUTING", "REVISION_REQUESTED"],
  /** Delivered, waiting for the publisher's verdict. */
  awaiting_review: ["REVIEW"],
  /** Publisher rejected it; an admin decides. Money still in escrow. */
  disputed: ["DISPUTED"],
  /** Paid out. ACCEPTED is a legacy "accepted but not yet paid" state. */
  completed: ["SETTLED", "ACCEPTED"],
  /** Stopped with the publisher refunded. */
  closed: ["CANCELLED", "REFUNDED"],
} as const satisfies Record<string, readonly OrderStatusId[]>;
export type OrderGroup = keyof typeof ORDER_GROUPS;

/** Not finished yet: anything still in progress, in review, or in dispute. */
export const OPEN_ORDER_STATUSES: OrderStatusId[] = [
  ...ORDER_GROUPS.in_progress,
  ...ORDER_GROUPS.awaiting_review,
  ...ORDER_GROUPS.disputed,
];

export const ORDER_GROUP_LABELS: Record<OrderGroup, string> = {
  in_progress: "In progress",
  awaiting_review: "Awaiting review",
  disputed: "Disputed",
  completed: "Completed",
  closed: "Cancelled",
};

export function orderGroupOf(status: string): OrderGroup | undefined {
  return (Object.keys(ORDER_GROUPS) as OrderGroup[]).find((g) =>
    (ORDER_GROUPS[g] as readonly string[]).includes(status)
  );
}

/**
 * Parses a `?status=` query value: a group name ("in_progress"), a single
 * status, or a comma list of either. Unknown values are dropped. Empty => all.
 */
export function parseOrderStatusFilter(value: string | null | undefined): OrderStatusId[] | undefined {
  if (!value) return undefined;
  const out = new Set<OrderStatusId>();
  for (const raw of value.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw in ORDER_GROUPS) ORDER_GROUPS[raw as OrderGroup].forEach((s) => out.add(s));
    else if ((ORDER_STATUSES as readonly string[]).includes(raw)) out.add(raw as OrderStatusId);
  }
  return out.size ? [...out] : undefined;
}

type Tone = { label: string; color: string; bg: string; border: string; dot: string };
const tone = (label: string, c: string, bgAlpha = "10", borderAlpha = "30"): Tone => ({
  label,
  color: `text-${c}-400`,
  bg: `bg-${c}-500/${bgAlpha}`,
  border: `border-${c}-500/${borderAlpha}`,
  dot: `bg-${c}-400`,
});

// Tailwind needs to see full class names; these are spelled out so the
// generated strings above are also present literally:
// text-blue-400 bg-blue-500/10 border-blue-500/30 bg-blue-400 text-sky-400 bg-sky-500/10 border-sky-500/30 bg-sky-400
// text-violet-400 bg-violet-500/10 border-violet-500/30 bg-violet-400 text-amber-400 bg-amber-500/10 border-amber-500/30 bg-amber-400
// text-orange-400 bg-orange-500/10 border-orange-500/30 bg-orange-400 text-emerald-400 bg-emerald-500/10 border-emerald-500/30 bg-emerald-400
// text-rose-400 bg-rose-500/10 border-rose-500/30 bg-rose-400 text-slate-400 bg-slate-500/10 border-slate-500/30 bg-slate-400
// text-teal-400 bg-teal-500/10 border-teal-500/30 bg-teal-400 text-slate-500 bg-slate-500/8 border-slate-500/20

export const ORDER_STATUS_META: Record<OrderStatusId, Tone> = {
  CREATED: tone("Awaiting start", "blue"),
  FUNDED: tone("Funded", "sky"),
  EXECUTING: tone("In progress", "violet"),
  REVISION_REQUESTED: tone("Revising", "orange"),
  REVIEW: tone("Awaiting review", "amber"),
  DISPUTED: tone("Disputed", "rose"),
  ACCEPTED: tone("Accepted", "emerald"),
  SETTLED: tone("Completed", "emerald"),
  REFUNDED: tone("Refunded", "teal"),
  CANCELLED: tone("Cancelled", "slate"),
};

export const TASK_STATUS_META: Record<TaskStatusId, Tone> = {
  DRAFT: tone("Draft", "slate"),
  OPEN: tone("Open", "emerald"),
  MATCHED: tone("Matched", "blue"),
  IN_PROGRESS: tone("In progress", "violet"),
  COMPLETED: tone("Completed", "slate"),
  CANCELLED: tone("Cancelled", "slate"),
};

const FALLBACK: Tone = { label: "", color: "text-muted-foreground", bg: "bg-muted", border: "border-border", dot: "bg-muted-foreground" };

export const orderStatusMeta = (s: string): Tone => ORDER_STATUS_META[s as OrderStatusId] ?? { ...FALLBACK, label: s };
export const taskStatusMeta = (s: string): Tone => TASK_STATUS_META[s as TaskStatusId] ?? { ...FALLBACK, label: s };

/** Final states: nothing further can happen to the order. */
export const TERMINAL_ORDER_STATUSES: OrderStatusId[] = ["SETTLED", "REFUNDED", "CANCELLED"];
