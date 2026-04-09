"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface AccountData {
  id: string;
  name: string;
  balance: number;
  currency: string;
  isDefault: boolean;
  createdAt: string;
}

function serialize(a: {
  id: string;
  name: string;
  balance: { toNumber: () => number };
  currency: string;
  isDefault: boolean;
  createdAt: Date;
}): AccountData {
  return {
    id: a.id,
    name: a.name,
    balance: a.balance.toNumber(),
    currency: a.currency,
    isDefault: a.isDefault,
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

export async function createAccount(input: {
  name: string;
  currency?: string;
  isDefault?: boolean;
  balance?: number;
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
    },
  });

  return serialize(account);
}
