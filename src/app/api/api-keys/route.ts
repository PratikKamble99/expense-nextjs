import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-auth";

// ── GET /api/api-keys — list keys (session-auth) ──────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, prefix: true,
      createdAt: true, lastUsedAt: true, expiresAt: true,
    },
  });

  return Response.json({ data: keys });
}

// ── POST /api/api-keys — create a new key ─────────────────────────────────────

const createSchema = z.object({
  name:      z.string().min(1).max(64),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // Limit to 10 keys per user
  const count = await prisma.apiKey.count({ where: { userId: session.user.id } });
  if (count >= 10) {
    return Response.json({ error: "Maximum 10 API keys per account" }, { status: 422 });
  }

  const { raw, hash, prefix } = generateApiKey();

  const key = await prisma.apiKey.create({
    data: {
      userId:   session.user.id,
      name:     parsed.data.name,
      keyHash:  hash,
      prefix,
      ...(parsed.data.expiresAt && { expiresAt: new Date(parsed.data.expiresAt) }),
    },
    select: { id: true, name: true, prefix: true, createdAt: true, expiresAt: true },
  });

  // Return raw key once — it cannot be retrieved again
  return Response.json({ data: { ...key, key: raw } }, { status: 201 });
}

// ── DELETE /api/api-keys?id=xxx — revoke a key ────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const deleted = await prisma.apiKey.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (deleted.count === 0) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true });
}
