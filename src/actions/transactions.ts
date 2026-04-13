"use server";

import { headers } from "next/headers";
import { Decimal } from "@prisma/client/runtime/library";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TransactionType, TransferType } from "@prisma/client";

// ── Serializable types ────────────────────────────────────────────────────────

export interface TransactionData {
  id: string;
  type: TransactionType;
  transferType: TransferType | null;
  amount: number;
  /** Currency the amount is stored in — same as the fromAccount's currency. */
  fromAccountCurrency: string;
  description: string | null;
  category: string | null;
  recipientName: string | null;
  fromAccountId: string;
  toAccountId: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  totalInvested: number;
  bankAccounts: {
    id: string;
    name: string;
    balance: number;
    currency: string;
    isDefault: boolean;
    createdAt: string;
  }[];
  recentTransactions: TransactionData[];
  /** All transactions in the current month — used for client-side income/expense sums. */
  monthlyTransactions: TransactionData[];
}

export interface TransactionInput {
  fromAccountId: string;
  type: TransactionType;
  amount: number;
  description?: string;
  category?: string;
  toAccountId?: string;
  transferType?: TransferType;
  recipientName?: string;
  investmentName?: string;
  investmentType?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type TxWithAccount = {
  id: string;
  type: TransactionType;
  transferType: TransferType | null;
  amount: { toNumber: () => number };
  description: string | null;
  category: string | null;
  recipientName: string | null;
  fromAccountId: string;
  toAccountId: string | null;
  createdAt: Date;
  fromAccount: { currency: string };
};

function serializeTx(t: TxWithAccount): TransactionData {
  return {
    id: t.id,
    type: t.type,
    transferType: t.transferType,
    amount: t.amount.toNumber(),
    fromAccountCurrency: t.fromAccount.currency,
    description: t.description,
    category: t.category,
    recipientName: t.recipientName,
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    createdAt: t.createdAt.toISOString(),
  };
}

const TX_INCLUDE = { fromAccount: { select: { currency: true } } } as const;

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

// ── Read actions ──────────────────────────────────────────────────────────────

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const session = await getSession();
  const userId = session.user.id;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [bankAccounts, investments, recentTxs, monthlyTxs] = await Promise.all([
    prisma.bankAccount.findMany({ where: { userId }, orderBy: { isDefault: "desc" } }),
    prisma.investment.findMany({ where: { userId } }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: TX_INCLUDE,
    }),
    prisma.transaction.findMany({
      where: { userId, createdAt: { gte: monthStart } },
      include: TX_INCLUDE,
    }),
  ]);

  const totalInvested = investments.reduce((s, i) => s + i.totalInvested.toNumber(), 0);

  return {
    totalInvested,
    bankAccounts: bankAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: a.balance.toNumber(),
      currency: a.currency,
      isDefault: a.isDefault,
      createdAt: a.createdAt.toISOString(),
    })),
    recentTransactions: recentTxs.map(serializeTx),
    monthlyTransactions: monthlyTxs.map(serializeTx),
  };
}

export async function getTransactionsWithAccounts(): Promise<{
  transactions: TransactionData[];
  bankAccounts: { id: string; name: string; balance: number; currency: string; isDefault: boolean; createdAt: string }[];
}> {
  const session = await getSession();
  const userId = session.user.id;

  const [txs, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: TX_INCLUDE,
    }),
    prisma.bankAccount.findMany({ where: { userId }, orderBy: { isDefault: "desc" } }),
  ]);

  return {
    transactions: txs.map(serializeTx),
    bankAccounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: a.balance.toNumber(),
      currency: a.currency,
      isDefault: a.isDefault,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

// ── Mutation actions ──────────────────────────────────────────────────────────

export async function createTransaction(input: TransactionInput): Promise<TransactionData> {
  const session = await getSession();
  const { createTransaction: create } = await import("@/lib/transactions");
  const tx = await create({ userId: session.user.id, ...input });
  // Fetch account currency for serialization
  const fromAccount = await prisma.bankAccount.findUniqueOrThrow({
    where: { id: input.fromAccountId },
    select: { currency: true },
  });
  return serializeTx({ ...tx, fromAccount });
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<TransactionData> {
  const session = await getSession();

  const updated = await prisma.$transaction(async (tx) => {
    const original = await tx.transaction.findUniqueOrThrow({
      where: { id, userId: session.user.id },
    });

    const origAmt = original.amount;

    // ── Reverse original balance effects ──────────────────────
    if (original.type === "INCOME") {
      await tx.bankAccount.update({
        where: { id: original.fromAccountId },
        data: { balance: { decrement: origAmt } },
      });
    } else if (
      original.type === "EXPENSE" ||
      (original.type === "TRANSFER" && original.transferType === "PERSON") ||
      original.type === "INVESTMENT"
    ) {
      await tx.bankAccount.update({
        where: { id: original.fromAccountId },
        data: { balance: { increment: origAmt } },
      });
    } else if (original.type === "TRANSFER" && original.transferType === "BANK") {
      await tx.bankAccount.update({
        where: { id: original.fromAccountId },
        data: { balance: { increment: origAmt } },
      });
      if (original.toAccountId) {
        await tx.bankAccount.update({
          where: { id: original.toAccountId },
          data: { balance: { decrement: origAmt } },
        });
      }
    }

    // ── Apply new balance effects ─────────────────────────────
    const newAmt = new Decimal(input.amount);

    if (input.type === "INCOME") {
      await tx.bankAccount.update({
        where: { id: input.fromAccountId },
        data: { balance: { increment: newAmt } },
      });
    } else if (input.type === "EXPENSE") {
      const acct = await tx.bankAccount.findUniqueOrThrow({ where: { id: input.fromAccountId } });
      if (acct.balance.lessThan(newAmt)) throw new Error("Insufficient funds");
      await tx.bankAccount.update({
        where: { id: input.fromAccountId },
        data: { balance: { decrement: newAmt } },
      });
    } else if (input.type === "TRANSFER") {
      const acct = await tx.bankAccount.findUniqueOrThrow({ where: { id: input.fromAccountId } });
      if (acct.balance.lessThan(newAmt)) throw new Error("Insufficient funds");
      await tx.bankAccount.update({
        where: { id: input.fromAccountId },
        data: { balance: { decrement: newAmt } },
      });
      if (input.transferType === "BANK" && input.toAccountId) {
        await tx.bankAccount.update({
          where: { id: input.toAccountId },
          data: { balance: { increment: newAmt } },
        });
      }
    } else if (input.type === "INVESTMENT") {
      const acct = await tx.bankAccount.findUniqueOrThrow({ where: { id: input.fromAccountId } });
      if (acct.balance.lessThan(newAmt)) throw new Error("Insufficient funds");
      await tx.bankAccount.update({
        where: { id: input.fromAccountId },
        data: { balance: { decrement: newAmt } },
      });
    }

    return tx.transaction.update({
      where: { id },
      data: {
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId ?? null,
        type: input.type,
        transferType: input.transferType ?? null,
        amount: newAmt,
        description: input.description ?? null,
        category: input.category ?? null,
        recipientName: input.recipientName ?? null,
      },
      include: TX_INCLUDE,
    });
  });

  return serializeTx(updated);
}
