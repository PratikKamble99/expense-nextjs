import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ── Constants ─────────────────────────────────────────────────────────────────

const RATE_LIMIT = 200;       // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

// ── Key generation ────────────────────────────────────────────────────────────

/**
 * Generates a new API key. Returns the raw key (shown to user once) and its
 * hash/prefix for storage.
 */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `ll_${crypto.randomBytes(20).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

// ── Key validation + rate limiting ───────────────────────────────────────────

export type AuthResult =
  | { ok: true; userId: string; keyId: string }
  | { ok: false; status: 401 | 429; error: string };

/**
 * Validates an API key from the Authorization header and enforces rate limiting.
 * Expects:  Authorization: Bearer ll_xxxxxxx
 */
export async function validateApiKey(authHeader: string | null): Promise<AuthResult> {
  if (!authHeader?.startsWith("Bearer ll_")) {
    return { ok: false, status: 401, error: "Missing or invalid API key" };
  }

  const raw = authHeader.slice(7); // strip "Bearer "
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });

  if (!key) {
    return { ok: false, status: 401, error: "Invalid API key" };
  }

  if (key.expiresAt && key.expiresAt < new Date()) {
    return { ok: false, status: 401, error: "API key expired" };
  }

  // ── Rate limiting (sliding window) ────────────────────────────────────────
  const now = new Date();
  const windowExpired =
    !key.reqWindowStart ||
    now.getTime() - key.reqWindowStart.getTime() > RATE_WINDOW_MS;

  if (windowExpired) {
    // Start a fresh window
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { reqCount: 1, reqWindowStart: now, lastUsedAt: now },
    });
  } else if (key.reqCount >= RATE_LIMIT) {
    return {
      ok: false,
      status: 429,
      error: `Rate limit exceeded. Max ${RATE_LIMIT} requests/min.`,
    };
  } else {
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { reqCount: { increment: 1 }, lastUsedAt: now },
    });
  }

  return { ok: true, userId: key.userId, keyId: key.id };
}
