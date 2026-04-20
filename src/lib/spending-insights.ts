import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InsightItem {
  emoji: string;
  title: string;
  description: string;
}

interface CategoryTotal {
  category: string;
  total: number;
}

interface MonthlyData {
  currentMonthLabel: string;
  prevMonthLabel: string;
  currentExpenses: CategoryTotal[];
  prevExpenses: CategoryTotal[];
  currentTotal: number;
  prevTotal: number;
  currentIncome: number;
  weekdaySpend: number;
  weekendSpend: number;
  currency: string;
}

// ── Data aggregation ──────────────────────────────────────────────────────────

async function aggregateMonthlyData(userId: string): Promise<MonthlyData> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const currentStart = new Date(y, m, 1);
  const currentEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const prevStart = new Date(y, m - 1, 1);
  const prevEnd = new Date(y, m, 0, 23, 59, 59, 999);

  const [currentTxns, prevTxns, preference] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, createdAt: { gte: currentStart, lte: currentEnd } },
    }),
    prisma.transaction.findMany({
      where: { userId, createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);

  const currency = preference?.currency ?? "USD";

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;

  const currentExpenseMap: Record<string, number> = {};
  let currentTotal = 0;
  let currentIncome = 0;
  let weekdaySpend = 0;
  let weekendSpend = 0;

  for (const t of currentTxns) {
    const amount = t.amount.toNumber();
    if (t.type === "EXPENSE") {
      const cat = t.category ?? "Uncategorized";
      currentExpenseMap[cat] = (currentExpenseMap[cat] ?? 0) + amount;
      currentTotal += amount;
      const day = t.createdAt.getDay();
      if (day === 0 || day === 6) weekendSpend += amount;
      else weekdaySpend += amount;
    } else if (t.type === "INCOME") {
      currentIncome += amount;
    }
  }

  const prevExpenseMap: Record<string, number> = {};
  let prevTotal = 0;
  for (const t of prevTxns) {
    if (t.type === "EXPENSE") {
      const cat = t.category ?? "Uncategorized";
      prevExpenseMap[cat] = (prevExpenseMap[cat] ?? 0) + t.amount.toNumber();
      prevTotal += t.amount.toNumber();
    }
  }

  const toSortedList = (map: Record<string, number>): CategoryTotal[] =>
    Object.entries(map)
      .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

  return {
    currentMonthLabel: `${MONTH_NAMES[m]} ${y}`,
    prevMonthLabel: `${MONTH_NAMES[prevM]} ${prevY}`,
    currentExpenses: toSortedList(currentExpenseMap),
    prevExpenses: toSortedList(prevExpenseMap),
    currentTotal: Number(currentTotal.toFixed(2)),
    prevTotal: Number(prevTotal.toFixed(2)),
    currentIncome: Number(currentIncome.toFixed(2)),
    weekdaySpend: Number(weekdaySpend.toFixed(2)),
    weekendSpend: Number(weekendSpend.toFixed(2)),
    currency,
  };
}

// ── GPT-4o insight generation ─────────────────────────────────────────────────

const INSIGHTS_SYSTEM = `You are a personal finance insights analyst. Given monthly spending data, find exactly 3 interesting, actionable insights.

Rules:
- Each insight must be genuinely interesting — not just "you spent money on food"
- Include specific numbers and percentages from the data
- Be concise: title ≤ 8 words, description ≤ 25 words
- If income is 0, flag it as a missing income warning
- If weekend spend is 2x+ weekday spend per day, flag it
- Always compare current month vs previous where data is available
- Return ONLY a valid JSON array, no markdown fences, no explanation

Response format:
[
  { "emoji": "💡", "title": "...", "description": "..." },
  { "emoji": "📊", "title": "...", "description": "..." },
  { "emoji": "⚠️", "title": "...", "description": "..." }
]`;

export async function generateInsightsForUser(userId: string): Promise<InsightItem[]> {
  const data = await aggregateMonthlyData(userId);

  const weekdayDays = 5; // avg weekdays per week × ~4.3 weeks ≈ 21-22 days, but ratio check is enough
  const weekendDays = 2;
  const weekdayRate = weekdayDays > 0 ? data.weekdaySpend / weekdayDays : 0;
  const weekendRate = weekendDays > 0 ? data.weekendSpend / weekendDays : 0;

  const prompt = `Current month (${data.currentMonthLabel}):
- Total expenses: ${data.currency} ${data.currentTotal}
- Total income recorded: ${data.currency} ${data.currentIncome}
- Weekday spend: ${data.currency} ${data.weekdaySpend} | Weekend spend: ${data.currency} ${data.weekendSpend}
- Weekend daily rate vs weekday daily rate: ${weekendRate.toFixed(2)} vs ${weekdayRate.toFixed(2)}
- Expenses by category: ${JSON.stringify(data.currentExpenses)}

Previous month (${data.prevMonthLabel}):
- Total expenses: ${data.currency} ${data.prevTotal}
- Expenses by category: ${JSON.stringify(data.prevExpenses)}

Find 3 interesting insights.`;

  const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0.3 });
  const response = await model.invoke([
    new SystemMessage(INSIGHTS_SYSTEM),
    new HumanMessage(prompt),
  ]);

  const content = typeof response.content === "string" ? response.content : "";
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("GPT did not return a valid JSON array");

  return JSON.parse(jsonMatch[0]) as InsightItem[];
}

// ── Store generated insights ──────────────────────────────────────────────────

export async function generateAndStoreInsights(userId: string): Promise<void> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const insights = await generateInsightsForUser(userId);

  await prisma.spendingInsight.upsert({
    where: { userId_period: { userId, period } },
    create: { userId, insights: insights as unknown as Prisma.InputJsonValue, period },
    update: { insights: insights as unknown as Prisma.InputJsonValue },
  });
}

// ── Fetch stored insights for a user (current period) ────────────────────────

export async function getStoredInsights(
  userId: string
): Promise<{ insights: InsightItem[]; period: string } | null> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const row = await prisma.spendingInsight.findUnique({
    where: { userId_period: { userId, period } },
  });

  if (!row) return null;

  return { insights: row.insights as unknown as InsightItem[], period };
}
