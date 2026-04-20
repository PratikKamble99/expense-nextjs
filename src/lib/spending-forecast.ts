import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpendingForecast {
  daysElapsed: number;
  daysInMonth: number;
  spentSoFar: number;
  dailyRate: number;
  forecastedTotal: number;
  /** % of month elapsed (0-100) */
  monthPct: number;
  narrative: string;
  currency: string;
  topCategory: string | null;
}

// ── GPT-4o-mini narrative ─────────────────────────────────────────────────────

const FORECAST_SYSTEM = `You are a financial forecast assistant. Given spending data for the current month, write exactly 1-2 sentences explaining the projection in a helpful, conversational tone. Include specific numbers. No markdown, no bullet points — plain prose only.`;

// ── Main forecast function ────────────────────────────────────────────────────

export async function getSpendingForecast(userId: string): Promise<SpendingForecast> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const monthStart = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysElapsed = Math.max(now.getDate(), 1);

  const [transactions, preference] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, type: "EXPENSE", createdAt: { gte: monthStart } },
      select: { amount: true, category: true },
    }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);

  const currency = preference?.currency ?? "USD";

  // Compute totals and top category
  const catMap: Record<string, number> = {};
  let spentSoFar = 0;
  for (const t of transactions) {
    const amount = t.amount.toNumber();
    spentSoFar += amount;
    const cat = t.category ?? "Uncategorized";
    catMap[cat] = (catMap[cat] ?? 0) + amount;
  }

  const topCategory =
    Object.entries(catMap).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  const dailyRate = spentSoFar / daysElapsed;
  const daysRemaining = daysInMonth - daysElapsed;
  const forecastedTotal = spentSoFar + dailyRate * daysRemaining;
  const monthPct = Math.round((daysElapsed / daysInMonth) * 100);

  const monthName = now.toLocaleString("default", { month: "long" });

  const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 });
  const response = await model.invoke([
    new SystemMessage(FORECAST_SYSTEM),
    new HumanMessage(
      `Month: ${monthName} ${y}
Days elapsed: ${daysElapsed} of ${daysInMonth} (${monthPct}% through the month)
Spent so far: ${currency} ${spentSoFar.toFixed(2)}
Daily spend rate: ${currency} ${dailyRate.toFixed(2)}/day
Projected end-of-month total: ${currency} ${forecastedTotal.toFixed(2)}
Top spending category so far: ${topCategory ?? "none"}

Write 1-2 sentences explaining this forecast.`
    ),
  ]);

  const narrative =
    typeof response.content === "string" ? response.content.trim() : "";

  return {
    daysElapsed,
    daysInMonth,
    spentSoFar: Number(spentSoFar.toFixed(2)),
    dailyRate: Number(dailyRate.toFixed(2)),
    forecastedTotal: Number(forecastedTotal.toFixed(2)),
    monthPct,
    narrative,
    currency,
    topCategory,
  };
}
