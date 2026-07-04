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

// New accounts start with some demo balance so they can publish tasks immediately.
const STARTING_BALANCE = 100;

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
