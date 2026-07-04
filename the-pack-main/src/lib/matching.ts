/**
 * Matching Engine — V1 Rule-Based
 *
 * Scores and ranks available agents for a given task.
 * Scoring weights (total = 1.0):
 *   - Task type match:   0.35  (must match, or agent scores 0)
 *   - Credit score:      0.25
 *   - Avg rating:        0.20
 *   - Success rate:      0.15
 *   - Price fit:         0.05  (closer to task budget = better)
 */

import { prisma } from "@/lib/prisma";

const n = (v: unknown) => Number(v ?? 0);

export interface MatchScore {
  agentId: string;
  score: number;           // 0–1 composite score
  breakdown: {
    taskTypeMatch: number;
    creditScore: number;
    ratingScore: number;
    successScore: number;
    priceScore: number;
  };
}

export interface MatchedAgent {
  agent: {
    id: string;
    name: string;
    slug: string;
    description: string;
    modelInfo: string | null;
    basePrice: number;
    avgRating: number;
    successRate: number;
    avgDurationSecs: number;
    completedOrders: number;
    creditScore: number;
    creditTier: string;
    supportedTaskTypes: string[];
    isOnline: boolean;
    dailyCompleted: number;
    dailyLimit: number;
  };
  match: MatchScore;
}

export async function matchAgentsForTask(
  taskId: string,
  options: { limit?: number; onlyAvailable?: boolean } = {}
): Promise<MatchedAgent[]> {
  const limit = options.limit ?? 5;
  const onlyAvailable = options.onlyAvailable ?? false;

  // Fetch the task
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { type: true, budget: true },
  });

  if (!task) return [];

  const taskBudget = n(task.budget);

  // Fetch all active agents
  const agents = await prisma.agent.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      modelInfo: true,
      basePrice: true,
      avgRating: true,
      successRate: true,
      avgDurationSecs: true,
      completedOrders: true,
      creditScore: true,
      creditTier: true,
      supportedTaskTypes: true,
      isOnline: true,
      dailyCompleted: true,
      dailyLimit: true,
    },
  });

  // Score each agent
  const scored = agents
    .map((agent) => {
      const supportedTypes = agent.supportedTaskTypes as string[];

      // Hard filter: must support the task type
      if (!supportedTypes.includes(task.type)) {
        return null;
      }

      // Hard filter: availability
      if (onlyAvailable) {
        if (!agent.isOnline) return null;
        if (agent.dailyCompleted >= agent.dailyLimit) return null;
      }

      const agentBasePrice = n(agent.basePrice);
      const agentCreditScore = n(agent.creditScore);
      const agentRating = n(agent.avgRating);
      const agentSuccessRate = n(agent.successRate);

      // Price fit: 1.0 if price ≤ budget, decays as price exceeds budget
      const priceRatio = taskBudget > 0 ? agentBasePrice / taskBudget : 1;
      const priceScore = priceRatio <= 1 ? 1.0 : Math.max(0, 1 - (priceRatio - 1));

      const breakdown = {
        taskTypeMatch: 1.0,
        creditScore: agentCreditScore,
        ratingScore: agentRating / 5,
        successScore: agentSuccessRate,
        priceScore,
      };

      const score =
        breakdown.taskTypeMatch  * 0.35 +
        breakdown.creditScore    * 0.25 +
        breakdown.ratingScore    * 0.20 +
        breakdown.successScore   * 0.15 +
        breakdown.priceScore     * 0.05;

      return {
        agent: {
          ...agent,
          supportedTaskTypes: agent.supportedTaskTypes as string[],
          creditTier: agent.creditTier as string,
          basePrice: agentBasePrice,
          avgRating: agentRating,
          successRate: agentSuccessRate,
          avgDurationSecs: n(agent.avgDurationSecs),
          completedOrders: n(agent.completedOrders),
          creditScore: agentCreditScore,
          isOnline: agent.isOnline,
          dailyCompleted: agent.dailyCompleted,
          dailyLimit: agent.dailyLimit,
        },
        match: { agentId: agent.id, score, breakdown },
      } satisfies MatchedAgent;
    })
    .filter((x): x is MatchedAgent => x !== null)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);

  return scored;
}
