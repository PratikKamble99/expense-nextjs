import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = Math.min(12, Math.max(1, parseInt(searchParams.get("period") ?? "6", 10)));

    // Start of the earliest month in the window
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (period - 1), 1);

    // Build ordered list of calendar months for zero-filling
    const allMonths = Array.from({ length: period }, (_, i) => {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      return { key: monthKey(d), label: monthLabel(d) };
    });

    // Single round-trip: transactions + accounts
    const [transactions, bankAccounts] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: session.user.id, createdAt: { gte: startDate } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.bankAccount.findMany({
        where: { userId: session.user.id },
        orderBy: { isDefault: "desc" },
      }),
    ]);

    // ── Helpers ────────────────────────────────────────────────────────
    const isExpense = (t: (typeof transactions)[number]) =>
      t.type === "EXPENSE" || (t.type === "TRANSFER" && t.transferType === "PERSON");

    const isIncome = (t: (typeof transactions)[number]) => t.type === "INCOME";

    // ── Spending Trends ────────────────────────────────────────────────
    const expenseTxs = transactions.filter(isExpense);
    const totalSpent = expenseTxs.reduce((s, t) => s + Number(t.amount), 0);
    const transactionCount = transactions.length;
    const monthlyAvg = totalSpent / period;

    // Monthly expense totals (zero-filled)
    const expByMonth = new Map<string, number>();
    for (const t of expenseTxs) {
      const k = monthKey(new Date(t.createdAt));
      expByMonth.set(k, (expByMonth.get(k) ?? 0) + Number(t.amount));
    }
    const monthlyHistory = allMonths.map(({ key, label }) => ({
      month: label,
      amount: expByMonth.get(key) ?? 0,
    }));

    // Top categories (expenses only, 6 max)
    const catMap = new Map<string, number>();
    for (const t of expenseTxs) {
      const cat = t.category?.trim() || "Uncategorized";
      catMap.set(cat, (catMap.get(cat) ?? 0) + Number(t.amount));
    }
    const topCategories = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, amount]) => ({ name, amount }));

    // ── Cash Flow (Income & Expenses tab) ──────────────────────────────
    const incomeByMonth = new Map<string, number>();
    const expenseByMonthCF = new Map<string, number>();

    for (const t of transactions) {
      const k = monthKey(new Date(t.createdAt));
      if (isIncome(t)) {
        incomeByMonth.set(k, (incomeByMonth.get(k) ?? 0) + Number(t.amount));
      } else if (isExpense(t)) {
        expenseByMonthCF.set(k, (expenseByMonthCF.get(k) ?? 0) + Number(t.amount));
      }
    }

    const totalIncome = transactions.filter(isIncome).reduce((s, t) => s + Number(t.amount), 0);

    const cashFlowMonthly = allMonths.map(({ key, label }) => ({
      month: label,
      income: incomeByMonth.get(key) ?? 0,
      expense: expenseByMonthCF.get(key) ?? 0,
    }));

    // ── Account Balances tab ───────────────────────────────────────────
    const totalBalance = bankAccounts.reduce((s, a) => s + Number(a.balance), 0);

    return NextResponse.json({
      period,
      spendingTrends: {
        totalSpent,
        monthlyAvg,
        transactionCount,
        monthlyHistory,
        topCategories,
      },
      cashFlow: {
        totalIncome,
        totalExpense: totalSpent,
        net: totalIncome - totalSpent,
        monthly: cashFlowMonthly,
      },
      accountBalances: {
        totalBalance,
        accounts: bankAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: Number(a.balance),
          currency: a.currency,
          isDefault: a.isDefault,
        })),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
