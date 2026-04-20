import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  transactions: z.array(
    z.object({
      accountId: z.string(),
      date: z.string(),
      amount: z.number().positive(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { transactions } = bodySchema.parse(body);

    if (transactions.length === 0) {
      return NextResponse.json({ duplicateKeys: [] });
    }

    const accountIds = [...new Set(transactions.map((t) => t.accountId))];

    // Build date range: earliest date - 1 day to latest date + 1 day
    const dates = transactions.map((t) => new Date(t.date).getTime());
    const minDate = new Date(Math.min(...dates) - 86_400_000);
    const maxDate = new Date(Math.max(...dates) + 86_400_000);

    const existing = await prisma.transaction.findMany({
      where: {
        userId: session.user.id,
        fromAccountId: { in: accountIds },
        createdAt: { gte: minDate, lte: maxDate },
      },
      select: {
        fromAccountId: true,
        createdAt: true,
        amount: true,
      },
    });

    // Build a set of existing keys for fast lookup
    // Key format includes each day in the ±1 day window
    const existingKeys = new Set<string>();
    for (const tx of existing) {
      const amt = tx.amount.toNumber();
      const baseDate = tx.createdAt;
      for (let offset = -1; offset <= 1; offset++) {
        const d = new Date(baseDate.getTime() + offset * 86_400_000);
        const dateStr = d.toISOString().slice(0, 10);
        existingKeys.add(`${tx.fromAccountId}_${dateStr}_${amt}`);
      }
    }

    const duplicateKeys: string[] = [];
    for (const t of transactions) {
      const dateStr = new Date(t.date).toISOString().slice(0, 10);
      const key = `${t.accountId}_${dateStr}_${t.amount}`;
      if (existingKeys.has(key)) {
        duplicateKeys.push(key);
      }
    }

    return NextResponse.json({ duplicateKeys });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Duplicate check failed" }, { status: 500 });
  }
}
