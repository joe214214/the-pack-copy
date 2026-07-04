/**
 * Auth — self-contained authentication for ThePack (no Supabase Auth dependency).
 *
 * - Passwords: scrypt hash stored in User.passwordHash ("scrypt$<saltHex>$<hashHex>")
 * - Sessions:  signed token in an httpOnly cookie ("<payloadB64url>.<sigB64url>")
 *              payload = { uid, isAdmin, exp }, signed with HMAC-SHA256(AUTH_SECRET)
 *
 * This module uses Node's `crypto` and `next/headers` — it runs in the Node runtime
 * (API routes, server components). Middleware uses `auth-edge.ts` instead.
 */
import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "thepack_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  return process.env.AUTH_SECRET || "thepack_dev_secret_change_me";
}

// ─── Password hashing (scrypt) ──────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ─── Session token (HMAC-signed) ────────────────────────────────────────────

interface SessionPayload {
  uid: string;
  isAdmin: boolean;
  exp: number; // unix seconds
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function createSessionToken(uid: string, isAdmin: boolean): string {
  const payload: SessionPayload = {
    uid,
    isAdmin,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as SessionPayload;
    if (!payload.uid || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Cookie helpers ─────────────────────────────────────────────────────────

export async function setSessionCookie(uid: string, isAdmin: boolean) {
  const token = createSessionToken(uid, isAdmin);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// ─── Current user resolution ────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  isAdmin: boolean;
  balance: number;
  frozenBalance: number;
  avatarUrl: string | null;
}

/**
 * Resolve the currently logged-in user from the session cookie.
 * Returns null if not authenticated. Queries the DB for fresh data.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true,
      email: true,
      name: true,
      roles: true,
      balance: true,
      frozenBalance: true,
      avatarUrl: true,
      isBanned: true,
    },
  });
  if (!user || user.isBanned) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    isAdmin: user.roles.includes("ADMIN"),
    balance: Number(user.balance),
    frozenBalance: Number(user.frozenBalance),
    avatarUrl: user.avatarUrl,
  };
}

/** Convenience: returns the user id or throws an Unauthorized-style error. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
