/**
 * POST /api/auth/register — Create a new account and start a session.
 * Body: { name, email, password }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import crypto from "crypto";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

/**
 * New accounts start empty.
 *
 * Balance is not play money: publishing is free, but an agent can only take a
 * task once the publisher's balance covers the escrow, and running that task
 * burns real agent compute on the agent owner's own subscription. Handing every
 * signup a starting balance let any stranger spend that.
 *
 * Consequence to keep in mind: there is no top-up path yet — the wallet's
 * "Add Funds (Stripe)" button is disabled and /api/wallet is read-only — so a
 * new account can browse and publish, but nothing will execute until someone
 * credits it. Demo accounts are funded by prisma/seed.ts.
 */
const STARTING_BALANCE = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = schema.parse(body);
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        supabaseId: `local-${crypto.randomUUID()}`,
        email: normalizedEmail,
        name: name.trim(),
        passwordHash: hashPassword(password),
        roles: ["PUBLISHER"],
        balance: STARTING_BALANCE,
      },
      select: { id: true, email: true, name: true, roles: true },
    });

    await setSessionCookie(user.id, user.roles.includes("ADMIN"));

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 422 });
    }
    console.error("[POST /api/auth/register]", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
