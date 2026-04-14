"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AccountTypeKey = "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "INVESTMENT" | "OTHER";

export interface AccountData {
  id: string;
  name: string;
  type: string | null;
  balance: number;
  currency: string;
  isDefault: boolean;
  bank: string | null;
  lastFourDigits: string | null;
  description: string | null;
  createdAt: string;
}

function serialize(a: {
  id: string;
  name: string;
  type: string | null;
  balance: { toNumber: () => number };
  currency: string;
  isDefault: boolean;
  bank: string | null;
  lastFourDigits: string | null;
  description: string | null;
  createdAt: Date;
}): AccountData {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    balance: a.balance.toNumber(),
    currency: a.currency,
    isDefault: a.isDefault,
    bank: a.bank,
    lastFourDigits: a.lastFourDigits,
    description: a.description,
    createdAt: a.createdAt.toISOString(),
  };
}

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function getAccounts(): Promise<{
  bankAccounts: AccountData[];
  totalBalance: number;
}> {
  const session = await getSession();

  const accounts = await prisma.bankAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { isDefault: "desc" },
  });

  const bankAccounts = accounts.map(serialize);
  const totalBalance = bankAccounts.reduce((s, a) => s + a.balance, 0);

  return { bankAccounts, totalBalance };
}

export async function updateAccount(
  id: string,
  input: {
    name?: string;
    isDefault?: boolean;
    balance?: number;
    type?: string | null;
    bank?: string | null;
    lastFourDigits?: string | null;
    description?: string | null;
  }
): Promise<AccountData> {
  const session = await getSession();

  if (input.name !== undefined && !input.name.trim()) {
    throw new Error("Account name is required");
  }

  // Verify ownership
  const existing = await prisma.bankAccount.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) throw new Error("Account not found");

  // If marking as default, unset all other accounts first
  if (input.isDefault) {
    await prisma.bankAccount.updateMany({
      where: { userId: session.user.id, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.bankAccount.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      ...(input.balance !== undefined && { balance: input.balance }),
      ...(input.type !== undefined && { type: input.type as AccountTypeKey | null }),
      ...(input.bank !== undefined && { bank: input.bank }),
      ...(input.lastFourDigits !== undefined && { lastFourDigits: input.lastFourDigits }),
      ...(input.description !== undefined && { description: input.description }),
    },
  });

  return serialize(updated);
}

export async function createAccount(input: {
  name: string;
  currency?: string;
  isDefault?: boolean;
  balance?: number;
  type?: string | null;
  bank?: string | null;
  lastFourDigits?: string | null;
  description?: string | null;
}): Promise<AccountData> {
  const session = await getSession();

  if (!input.name?.trim()) throw new Error("Account name is required");

  const account = await prisma.bankAccount.create({
    data: {
      userId: session.user.id,
      name: input.name.trim(),
      currency: input.currency ?? "USD",
      isDefault: input.isDefault ?? false,
      balance: input.balance ?? 0,
      type: (input.type as AccountTypeKey | null) ?? null,
      bank: input.bank ?? null,
      lastFourDigits: input.lastFourDigits ?? null,
      description: input.description ?? null,
    },
  });

  return serialize(account);
}
