import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// ── GET /api/v1/summary ───────────────────────────────────────────────────────
// Optional ?month=YYYY-MM  (defaults to current month)

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const now = new Date();
  const targetMonth = parsed.data.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, month] = targetMonth.split("-").map(Number) as [number, number];

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = new Date(year, month, 0, 23, 59, 59, 999);

  const [accounts, transactions, investments] = await Promise.all([
    prisma.bankAccount.findMany({ where: { userId: auth.userId } }),
    prisma.transaction.findMany({
      where: { userId: auth.userId, createdAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.investment.findMany({ where: { userId: auth.userId } }),
  ]);

  const totalBalance   = accounts.reduce((s, a) => s + a.balance.toNumber(), 0);
  const totalInvested  = investments.reduce((s, i) => s + i.totalInvested.toNumber(), 0);
  const totalIncome    = transactions.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount.toNumber(), 0);
  const totalExpenses  = transactions.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount.toNumber(), 0);
  const totalTransfers = transactions.filter((t) => t.type === "TRANSFER").reduce((s, t) => s + t.amount.toNumber(), 0);

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== "EXPENSE") continue;
    const cat = t.category ?? "Uncategorized";
    categoryMap[cat] = (categoryMap[cat] ?? 0) + t.amount.toNumber();
  }
  const topCategories = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }));

  return Response.json({
    data: {
      period:         targetMonth,
      totalBalance:   Number(totalBalance.toFixed(2)),
      totalInvested:  Number(totalInvested.toFixed(2)),
      income:         Number(totalIncome.toFixed(2)),
      expenses:       Number(totalExpenses.toFixed(2)),
      transfers:      Number(totalTransfers.toFixed(2)),
      savings:        Number((totalIncome - totalExpenses).toFixed(2)),
      transactionCount: transactions.length,
      topExpenseCategories: topCategories,
    },
  });
}
