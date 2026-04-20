import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTransaction } from "@/lib/transactions";

// ── GET /api/v1/transactions ──────────────────────────────────────────────────

const listSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(50),
  type:     z.enum(["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"]).optional(),
  category: z.string().optional(),
  from:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listSchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { page, limit, type, category, from, to } = parsed.data;

  const where = {
    userId: auth.userId,
    ...(type && { type }),
    ...(category && { category: { contains: category, mode: "insensitive" as const } }),
    ...((from ?? to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(`${to}T23:59:59.999Z`) }),
      },
    }),
  };

  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { fromAccount: { select: { name: true, currency: true } } },
    }),
  ]);

  return Response.json({
    data: transactions.map((t) => ({
      id:           t.id,
      type:         t.type,
      transferType: t.transferType ?? null,
      amount:       t.amount.toNumber(),
      currency:     t.fromAccount.currency,
      category:     t.category ?? null,
      description:  t.description ?? null,
      account:      t.fromAccount.name,
      recipientName: t.recipientName ?? null,
      createdAt:    t.createdAt.toISOString(),
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

// ── POST /api/v1/transactions ─────────────────────────────────────────────────

const createSchema = z.object({
  fromAccountId: z.string().min(1),
  type:          z.enum(["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"]),
  amount:        z.number().positive(),
  description:   z.string().optional(),
  category:      z.string().optional(),
  toAccountId:   z.string().optional(),
  transferType:  z.enum(["BANK", "PERSON"]).optional(),
  recipientName: z.string().optional(),
  date:          z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // Verify the fromAccount belongs to this user
  const account = await prisma.bankAccount.findFirst({
    where: { id: parsed.data.fromAccountId, userId: auth.userId },
  });
  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    const { date: rawDate, ...rest } = parsed.data;
    const transaction = await createTransaction({
      userId: auth.userId,
      ...rest,
      ...(rawDate !== undefined && { date: new Date(rawDate) }),
    });

    return Response.json({ data: { id: transaction.id } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transaction failed";
    return Response.json({ error: message }, { status: 422 });
  }
}
