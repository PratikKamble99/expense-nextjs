"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ReportsData {
  period: number;
  spendingTrends: {
    totalSpent: number;
    monthlyAvg: number;
    transactionCount: number;
    monthlyHistory: { month: string; amount: number }[];
    topCategories: { name: string; amount: number }[];
  };
  cashFlow: {
    totalIncome: number;
    totalExpense: number;
    net: number;
    monthly: { month: string; income: number; expense: number }[];
  };
  accountBalances: {
    totalBalance: number;
    accounts: {
      id: string;
      name: string;
      balance: number;
      currency: string;
      isDefault: boolean;
    }[];
  };
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export async function getReports(period: number): Promise<ReportsData> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");

  const p = Math.min(12, Math.max(1, period));
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (p - 1), 1);

  // All months in window (zero-fill guard)
  const allMonths = Array.from({ length: p }, (_, i) => {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    return { key: monthKey(d), label: monthLabel(d) };
  });

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

  const isExpense = (t: (typeof transactions)[number]) =>
    t.type === "EXPENSE" || (t.type === "TRANSFER" && t.transferType === "PERSON");

  const isIncome = (t: (typeof transactions)[number]) => t.type === "INCOME";

  // ── Spending Trends ──────────────────────────────────────────────────
  const expenseTxs = transactions.filter(isExpense);
  const totalSpent = expenseTxs.reduce((s, t) => s + t.amount.toNumber(), 0);
  const monthlyAvg = totalSpent / p;
  const transactionCount = transactions.length;

  const expByMonth = new Map<string, number>();
  for (const t of expenseTxs) {
    const k = monthKey(new Date(t.createdAt));
    expByMonth.set(k, (expByMonth.get(k) ?? 0) + t.amount.toNumber());
  }

  const catMap = new Map<string, number>();
  for (const t of expenseTxs) {
    const cat = t.category?.trim() || "Uncategorized";
    catMap.set(cat, (catMap.get(cat) ?? 0) + t.amount.toNumber());
  }

  // ── Cash Flow ────────────────────────────────────────────────────────
  const incByMonth = new Map<string, number>();
  const expByMonthCF = new Map<string, number>();

  for (const t of transactions) {
    const k = monthKey(new Date(t.createdAt));
    if (isIncome(t)) {
      incByMonth.set(k, (incByMonth.get(k) ?? 0) + t.amount.toNumber());
    } else if (isExpense(t)) {
      expByMonthCF.set(k, (expByMonthCF.get(k) ?? 0) + t.amount.toNumber());
    }
  }

  const totalIncome = transactions.filter(isIncome).reduce((s, t) => s + t.amount.toNumber(), 0);

  // ── Account Balances ─────────────────────────────────────────────────
  const totalBalance = bankAccounts.reduce((s, a) => s + a.balance.toNumber(), 0);

  return {
    period: p,
    spendingTrends: {
      totalSpent,
      monthlyAvg,
      transactionCount,
      monthlyHistory: allMonths.map(({ key, label }) => ({
        month: label,
        amount: expByMonth.get(key) ?? 0,
      })),
      topCategories: [...catMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, amount]) => ({ name, amount })),
    },
    cashFlow: {
      totalIncome,
      totalExpense: totalSpent,
      net: totalIncome - totalSpent,
      monthly: allMonths.map(({ key, label }) => ({
        month: label,
        income: incByMonth.get(key) ?? 0,
        expense: expByMonthCF.get(key) ?? 0,
      })),
    },
    accountBalances: {
      totalBalance,
      accounts: bankAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: a.balance.toNumber(),
        currency: a.currency,
        isDefault: a.isDefault,
      })),
    },
  };
}
