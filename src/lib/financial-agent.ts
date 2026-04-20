import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a personal financial assistant for an expense tracking app called Luminescent Ledger.
You have access to the user's real financial data through tools. Always call the relevant tool(s) before answering — never make up numbers.
Today's date is ${new Date().toISOString().split("T")[0]}.

Guidelines:
- Be concise but precise. Include exact amounts.
- Format currency as the raw number with its currency code (e.g. "₹12,500 INR").
- When listing transactions, group or summarise where possible — don't dump raw JSON.
- If the user asks a comparison question (e.g. "am I saving more?") compute the relevant metrics from the data.
- If no data is found for a query, say so clearly.`;

// ── Tool factories (userId bound via closure) ─────────────────────────────────

function makeAccountBalancesTool(userId: string) {
  return tool(
    async (_input: Record<string, never>) => {
      const accounts = await prisma.bankAccount.findMany({
        where: { userId },
        orderBy: { isDefault: "desc" },
      });
      return JSON.stringify(
        accounts.map((a) => ({
          name: a.name,
          type: a.type,
          balance: a.balance.toNumber(),
          currency: a.currency,
          bank: a.bank ?? null,
          isDefault: a.isDefault,
        }))
      );
    },
    {
      name: "get_account_balances",
      description:
        "Get all bank account names, types, balances, and currencies for the user. Call this for questions about net worth, total balance, or account details.",
      schema: z.object({}),
    }
  );
}

function makeTransactionsTool(userId: string) {
  return tool(
    async ({
      months = 6,
      allTime = false,
      startDate,
      endDate,
      type,
      category,
      minAmount,
      maxAmount,
    }: {
      months?: number;
      allTime?: boolean;
      startDate?: string;
      endDate?: string;
      type?: "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT";
      category?: string;
      minAmount?: number;
      maxAmount?: number;
    }) => {
      let dateFilter: { gte?: Date; lte?: Date } | undefined;
      if (!allTime) {
        if (startDate ?? endDate) {
          dateFilter = {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(`${endDate}T23:59:59.999Z`) }),
          };
        } else {
          const since = new Date();
          since.setMonth(since.getMonth() - months);
          dateFilter = { gte: since };
        }
      }

      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
          ...(dateFilter && { createdAt: dateFilter }),
          ...(type && { type }),
          ...(category && {
            category: { contains: category, mode: "insensitive" },
          }),
          ...(minAmount !== undefined && {
            amount: { gte: minAmount },
          }),
          ...(maxAmount !== undefined && {
            amount: { lte: maxAmount },
          }),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          fromAccount: { select: { name: true, currency: true } },
        },
      });

      return JSON.stringify(
        transactions.map((t) => ({
          date: t.createdAt.toISOString().split("T")[0],
          type: t.type,
          transferType: t.transferType ?? null,
          amount: t.amount.toNumber(),
          currency: t.fromAccount.currency,
          category: t.category ?? null,
          description: t.description ?? null,
          account: t.fromAccount.name,
          recipientName: t.recipientName ?? null,
        }))
      );
    },
    {
      name: "get_transactions",
      description:
        "Fetch transactions with optional filters. Use for questions about spending, income, UPI transfers, or specific date queries. " +
        "Set allTime: true for 'all transactions', 'full history', or 'previous records' queries — this removes the date limit. " +
        "Prefer startDate/endDate for specific date queries (e.g. 'on March 15', 'last Tuesday', 'in January'). " +
        "type can be INCOME, EXPENSE, TRANSFER, or INVESTMENT. minAmount/maxAmount filter by amount.",
      schema: z.object({
        allTime: z
          .boolean()
          .optional()
          .describe(
            "Set to true to fetch all transactions with no date limit. Use for 'all transactions', 'full history', or 'previous records' queries."
          ),
        months: z
          .number()
          .optional()
          .describe(
            "Rolling window in months (default 6). Ignored when allTime is true or when startDate/endDate is provided."
          ),
        startDate: z
          .string()
          .optional()
          .describe("Start of date range in YYYY-MM-DD format (inclusive)."),
        endDate: z
          .string()
          .optional()
          .describe(
            "End of date range in YYYY-MM-DD format (inclusive). Defaults to today if only startDate is given."
          ),
        type: z
          .enum(["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"])
          .optional()
          .describe("Filter to a specific transaction type"),
        category: z
          .string()
          .optional()
          .describe("Partial category name to filter by (case-insensitive)"),
        minAmount: z
          .number()
          .optional()
          .describe("Only include transactions at or above this amount"),
        maxAmount: z
          .number()
          .optional()
          .describe("Only include transactions at or below this amount"),
      }),
    }
  );
}

function makeCategoryTotalsTool(userId: string) {
  return tool(
    async ({
      months = 1,
      startDate,
      endDate,
    }: {
      months?: number;
      startDate?: string;
      endDate?: string;
    }) => {
      let dateFilter: { gte?: Date; lte?: Date };
      if (startDate ?? endDate) {
        dateFilter = {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(`${endDate}T23:59:59.999Z`) }),
        };
      } else {
        const since = new Date();
        since.setMonth(since.getMonth() - months);
        dateFilter = { gte: since };
      }

      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
          type: "EXPENSE",
          createdAt: dateFilter,
        },
        select: { category: true, amount: true },
      });

      const totals: Record<string, number> = {};
      for (const t of transactions) {
        const key = t.category ?? "Uncategorized";
        totals[key] = (totals[key] ?? 0) + t.amount.toNumber();
      }

      const sorted = Object.entries(totals)
        .sort(([, a], [, b]) => b - a)
        .map(([category, total]) => ({
          category,
          total: Number(total.toFixed(2)),
        }));

      return JSON.stringify(sorted);
    },
    {
      name: "get_category_totals",
      description:
        "Get expense totals grouped by category for a given period. Use for 'biggest expense category', 'how much on food', 'spending breakdown'. " +
        "Use startDate/endDate for specific periods (e.g. 'in March', 'last week').",
      schema: z.object({
        months: z
          .number()
          .optional()
          .describe(
            "Rolling window in months (default 1). Ignored when startDate or endDate is provided."
          ),
        startDate: z
          .string()
          .optional()
          .describe("Start of date range in YYYY-MM-DD format (inclusive)."),
        endDate: z
          .string()
          .optional()
          .describe("End of date range in YYYY-MM-DD format (inclusive)."),
      }),
    }
  );
}

function makeInvestmentSummaryTool(userId: string) {
  return tool(
    async (_input: Record<string, never>) => {
      const investments = await prisma.investment.findMany({
        where: { userId },
        include: { bankAccount: { select: { name: true } } },
        orderBy: { totalInvested: "desc" },
      });

      return JSON.stringify(
        investments.map((i) => ({
          name: i.name,
          type: i.type,
          totalInvested: i.totalInvested.toNumber(),
          currentValue: i.currentValue.toNumber(),
          gainLoss: Number(
            (i.currentValue.toNumber() - i.totalInvested.toNumber()).toFixed(2)
          ),
          account: i.bankAccount.name,
        }))
      );
    },
    {
      name: "get_investment_summary",
      description:
        "Get all investments with total invested, current value, and gain/loss. Use for questions about mutual funds, stocks, crypto, or total investments.",
      schema: z.object({}),
    }
  );
}

// ── Agent factory ─────────────────────────────────────────────────────────────

export function createFinancialAgent(userId: string) {
  const model = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
    streaming: true,
  });

  return createReactAgent({
    llm: model,
    tools: [
      makeAccountBalancesTool(userId),
      makeTransactionsTool(userId),
      makeCategoryTotalsTool(userId),
      makeInvestmentSummaryTool(userId),
    ],
    prompt: SYSTEM_PROMPT,
  });
}

// ── Message serialisation helpers ─────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function buildMessageHistory(messages: ChatMessage[]) {
  return messages.map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );
}
