import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_EVENTS = ["transaction.created", "transaction.deleted"] as const;

// ── GET /api/webhooks — list endpoints ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, url: true, events: true, active: true, createdAt: true,
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, event: true, status: true, attempts: true, createdAt: true },
      },
    },
  });

  return Response.json({ data: endpoints });
}

// ── POST /api/webhooks — register an endpoint ─────────────────────────────────

const createSchema = z.object({
  url:    z.string().url(),
  events: z.array(z.enum(VALID_EVENTS)).min(1),
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

  // Limit to 5 webhook endpoints per user
  const count = await prisma.webhookEndpoint.count({ where: { userId: session.user.id } });
  if (count >= 5) {
    return Response.json({ error: "Maximum 5 webhook endpoints per account" }, { status: 422 });
  }

  const secret = crypto.randomBytes(24).toString("hex");

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      userId: session.user.id,
      url:    parsed.data.url,
      events: parsed.data.events,
      secret,
    },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });

  // Return signing secret once — it cannot be retrieved again
  return Response.json({ data: { ...endpoint, secret } }, { status: 201 });
}

// ── DELETE /api/webhooks?id=xxx — remove an endpoint ─────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const deleted = await prisma.webhookEndpoint.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (deleted.count === 0) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true });
}

// ── PATCH /api/webhooks?id=xxx — toggle active ────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = z.object({ active: z.boolean() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "active must be boolean" }, { status: 400 });

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.webhookEndpoint.update({
    where: { id },
    data: { active: parsed.data.active },
    select: { id: true, active: true },
  });

  return Response.json({ data: updated });
}
