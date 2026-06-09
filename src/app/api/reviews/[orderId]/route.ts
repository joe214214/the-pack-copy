/**
 * POST /api/reviews/[orderId]  — Submit user review (accept/dispute + rating + comment)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { debitFrozenBalance, creditBalance } from "@/lib/balance";
import { calculateFees } from "@/lib/fees";
import { deriveCreditTier } from "@/lib/credit-tiers";
import { z } from "zod";

const reviewSchema = z.object({
  accepted: z.boolean(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const body = await request.json();
    const { accepted, rating, comment } = reviewSchema.parse(body);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        agent: { include: { owner: true } },
        review: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status !== "REVIEW") {
      return NextResponse.json({ error: "Order is not in review" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update review record
      await tx.review.update({
        where: { orderId },
        data: {
          userAccepted: accepted,
          userRating: rating,
          userComment: comment,
        },
      });

      if (accepted) {
        // 2. Update order status to ACCEPTED
        await tx.order.update({
          where: { id: orderId },
          data: { status: "ACCEPTED" },
        });

        // 3. Settle funds: debit publisher escrow, credit agent owner
        const price = Number(order.price);
        const { platformFee, agentPayout } = calculateFees(price);
        await debitFrozenBalance(order.publisherId, price);
        await creditBalance(order.agent.owner.id, agentPayout);

        // 4. Create settlement record
        await tx.settlement.create({
          data: {
            orderId,
            totalAmount: price,
            platformFee,
            agentPayout,
            status: "COMPLETED",
            settledAt: new Date(),
          },
        });

        // 5. Update order to SETTLED
        await tx.order.update({
          where: { id: orderId },
          data: { status: "SETTLED" },
        });

        // 6. Create credit record for agent
        const successScore = 1.0;
        const deadline = order.deadline;
        const completedAt = new Date();
        const timelinessScore = completedAt <= deadline ? 1.0 : 0.5;
        const qualityScore = Number(order.review?.autoScore ?? 0.7);
        const ratingScore = rating ? (rating - 1) / 4 : 0.7;

        await tx.creditRecord.create({
          data: {
            agentId: order.agentId,
            orderId,
            successScore,
            timelinessScore,
            qualityScore,
            ratingScore,
          },
        });

        // 7. Update agent aggregate stats
        const agent = await tx.agent.findUnique({
          where: { id: order.agentId },
          include: { creditRecords: { select: { successScore: true, qualityScore: true, ratingScore: true } } },
        });
        if (agent) {
          const records = agent.creditRecords;
          const n = records.length;
          const avgSuccess = records.reduce((s, r) => s + Number(r.successScore), 0) / n;
          const avgQuality = records.reduce((s, r) => s + Number(r.qualityScore), 0) / n;
          const avgRatingScore = records.reduce((s, r) => s + Number(r.ratingScore), 0) / n;
          const newCreditScore = avgSuccess * 0.4 + avgQuality * 0.35 + avgRatingScore * 0.25;

          await tx.agent.update({
            where: { id: order.agentId },
            data: {
              completedOrders: { increment: 1 },
              avgRating: rating ? (Number(agent.avgRating) * (n - 1) + rating) / n : undefined,
              successRate: avgSuccess,
              creditScore: newCreditScore,
              creditTier: deriveCreditTier(newCreditScore),
              avgCost: price,
            },
          });
        }
      } else {
        // Dispute path — keep funds frozen, flag for admin
        await tx.order.update({
          where: { id: orderId },
          data: { status: "DISPUTED" },
        });
        await tx.dispute.create({
          data: {
            orderId,
            raisedById: order.publisherId,
            reason: comment ?? "Output rejected by publisher",
            status: "OPEN",
          },
        });
      }
    });

    return NextResponse.json({ success: true, accepted });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 422 });
    }
    console.error("[POST /api/reviews/[orderId]]", error);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
}
