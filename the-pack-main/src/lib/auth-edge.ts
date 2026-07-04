/**
 * Auth (edge runtime) — token verification for Next.js middleware.
 *
 * Middleware runs on the Edge runtime where Node's `crypto` is unavailable,
 * so we verify the HMAC-SHA256 session signature with the Web Crypto API.
 * Token format and secret are identical to `auth.ts` (Node side).
 */

export const SESSION_COOKIE = "thepack_session";

interface SessionPayload {
  uid: string;
  isAdmin: boolean;
  exp: number;
}

function getSecret(): string {
  return process.env.AUTH_SECRET || "thepack_dev_secret_change_me";
}

function base64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buf;
}

function strToBuffer(s: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

export async function verifySessionTokenEdge(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBuffer(sig),
      strToBuffer(payloadB64)
    );
    if (!valid) return null;

    const json = new TextDecoder().decode(base64urlToBuffer(payloadB64));
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload.uid || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
