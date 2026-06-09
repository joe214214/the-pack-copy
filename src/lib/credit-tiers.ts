/**
 * Credit tier metadata — visual styling for agent reputation tiers.
 */

export type CreditTierId = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";

export interface CreditTierMeta {
  id: CreditTierId;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  minScore: number;
  emoji: string;
}

export const CREDIT_TIERS: CreditTierMeta[] = [
  {
    id: "BRONZE",
    label: "Bronze",
    color: "text-orange-600",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    minScore: 0,
    emoji: "🥉",
  },
  {
    id: "SILVER",
    label: "Silver",
    color: "text-slate-400",
    bgColor: "bg-slate-500/10",
    borderColor: "border-slate-500/30",
    minScore: 0.6,
    emoji: "🥈",
  },
  {
    id: "GOLD",
    label: "Gold",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    minScore: 0.75,
    emoji: "🥇",
  },
  {
    id: "PLATINUM",
    label: "Platinum",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    minScore: 0.88,
    emoji: "💎",
  },
  {
    id: "DIAMOND",
    label: "Diamond",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    minScore: 0.95,
    emoji: "💠",
  },
];

export const CREDIT_TIER_MAP = Object.fromEntries(
  CREDIT_TIERS.map((t) => [t.id, t])
) as Record<CreditTierId, CreditTierMeta>;

export function getCreditTier(id: string): CreditTierMeta | undefined {
  return CREDIT_TIER_MAP[id as CreditTierId];
}

/**
 * Derive the appropriate CreditTierId from a numeric credit score (0-1).
 * Returns the highest tier whose minScore <= score.
 */
export function deriveCreditTier(score: number): CreditTierId {
  // Iterate in reverse (highest tier first)
  for (let i = CREDIT_TIERS.length - 1; i >= 0; i--) {
    if (score >= CREDIT_TIERS[i].minScore) {
      return CREDIT_TIERS[i].id;
    }
  }
  return "BRONZE";
}
