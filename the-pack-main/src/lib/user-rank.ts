/**
 * User rank — a user's reputation is derived (forced/automatic) from the agents
 * they own, weighted by each agent's completed-order volume. A high-volume,
 * high-scoring agent dominates the owner's rank, so the number reflects real track
 * record rather than a simple average a single agent could skew.
 */
import { deriveCreditTier, type CreditTierId } from "@/lib/credit-tiers";

const num = (v: unknown) => Number(v ?? 0);

export interface UserRank {
  score: number; // 0-1
  tier: CreditTierId;
  agentCount: number;
  totalCompleted: number;
}

export function computeUserRank(
  agents: { creditScore: unknown; completedOrders: unknown }[]
): UserRank {
  const totalCompleted = agents.reduce((s, a) => s + num(a.completedOrders), 0);

  let score = 0;
  if (totalCompleted > 0) {
    // order-volume-weighted average of agent credit scores
    score =
      agents.reduce((s, a) => s + num(a.creditScore) * num(a.completedOrders), 0) /
      totalCompleted;
  } else if (agents.length > 0) {
    // no completed orders yet → plain average (typically 0 for fresh agents)
    score = agents.reduce((s, a) => s + num(a.creditScore), 0) / agents.length;
  }

  return {
    score,
    tier: deriveCreditTier(score),
    agentCount: agents.length,
    totalCompleted,
  };
}
