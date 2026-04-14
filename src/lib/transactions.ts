import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "./prisma";
import { TransactionType, TransferType, InvestmentType } from "@prisma/client";

interface CreateTransactionInput {
  userId: string;
  fromAccountId: string;
  type: TransactionType;
  amount: number;
  description?: string;
  category?: string;
  toAccountId?: string;
  transferType?: TransferType;
  recipientName?: string;
  investmentId?: string;
  investmentName?: string;
  investmentType?: string;
  date?: Date;
}

async function createIncome(input: CreateTransactionInput) {
  const { userId, fromAccountId, amount, description, category, date } = input;

  return prisma.$transaction(async (tx) => {
    // Update account balance
    await tx.bankAccount.update({
      where: { id: fromAccountId },
      data: { balance: { increment: new Decimal(amount) } },
    });

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
        userId,
        fromAccountId,
        type: "INCOME",
        amount: new Decimal(amount),
        description,
        category,
        ...(date && { createdAt: date }),
      },
    });

    return transaction;
  });
}

async function createExpense(input: CreateTransactionInput) {
  const { userId, fromAccountId, amount, description, category, date } = input;

  return prisma.$transaction(async (tx) => {
    // Check sufficient balance
    const account = await tx.bankAccount.findUniqueOrThrow({
      where: { id: fromAccountId },
    });

    if (account.balance.lessThan(new Decimal(amount))) {
      throw new Error("Insufficient funds");
    }

    // Update account balance
    await tx.bankAccount.update({
      where: { id: fromAccountId },
      data: { balance: { decrement: new Decimal(amount) } },
    });

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
        userId,
        fromAccountId,
        type: "EXPENSE",
        amount: new Decimal(amount),
        description,
        category,
        ...(date && { createdAt: date }),
      },
    });

    return transaction;
  });
}

async function createBankTransfer(input: CreateTransactionInput) {
  const { userId, fromAccountId, toAccountId, amount, description, date } = input;

  if (!toAccountId) {
    throw new Error("toAccountId is required for bank transfer");
  }

  return prisma.$transaction(async (tx) => {
    // Check sufficient balance
    const fromAccount = await tx.bankAccount.findUniqueOrThrow({
      where: { id: fromAccountId },
    });

    if (fromAccount.balance.lessThan(new Decimal(amount))) {
      throw new Error("Insufficient funds");
    }

    // Decrement from account
    await tx.bankAccount.update({
      where: { id: fromAccountId },
      data: { balance: { decrement: new Decimal(amount) } },
    });

    // Increment to account
    await tx.bankAccount.update({
      where: { id: toAccountId },
      data: { balance: { increment: new Decimal(amount) } },
    });

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
        userId,
        fromAccountId,
        toAccountId,
        type: "TRANSFER",
        transferType: "BANK",
        amount: new Decimal(amount),
        description,
        ...(date && { createdAt: date }),
      },
    });

    return transaction;
  });
}

async function createPersonTransfer(input: CreateTransactionInput) {
  const { userId, fromAccountId, amount, description, category, recipientName, date } =
    input;

  return prisma.$transaction(async (tx) => {
    // Check sufficient balance
    const account = await tx.bankAccount.findUniqueOrThrow({
      where: { id: fromAccountId },
    });

    if (account.balance.lessThan(new Decimal(amount))) {
      throw new Error("Insufficient funds");
    }

    // Decrement account
    await tx.bankAccount.update({
      where: { id: fromAccountId },
      data: { balance: { decrement: new Decimal(amount) } },
    });

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
        userId,
        fromAccountId,
        type: "TRANSFER",
        transferType: "PERSON",
        amount: new Decimal(amount),
        description,
        category,
        recipientName,
        ...(date && { createdAt: date }),
      },
    });

    return transaction;
  });
}

async function createInvestment(input: CreateTransactionInput) {
  const {
    userId,
    fromAccountId,
    amount,
    description,
    investmentName,
    investmentType,
    date,
  } = input;

  if (!investmentName || !investmentType) {
    throw new Error("investmentName and investmentType are required");
  }

  return prisma.$transaction(async (tx) => {
    // Check sufficient balance
    const account = await tx.bankAccount.findUniqueOrThrow({
      where: { id: fromAccountId },
    });

    if (account.balance.lessThan(new Decimal(amount))) {
      throw new Error("Insufficient funds");
    }

    // Decrement account
    await tx.bankAccount.update({
      where: { id: fromAccountId },
      data: { balance: { decrement: new Decimal(amount) } },
    });

    // Find or create investment
    let investment = await tx.investment.findFirst({
      where: {
        userId,
        bankAccountId: fromAccountId,
        name: investmentName,
      },
    });

    if (investment) {
      // Update existing investment
      investment = await tx.investment.update({
        where: { id: investment.id },
        data: {
          totalInvested: { increment: new Decimal(amount) },
        },
      });
    } else {
      // Create new investment
      investment = await tx.investment.create({
        data: {
          userId,
          bankAccountId: fromAccountId,
          name: investmentName,
          type: investmentType as InvestmentType,
          totalInvested: new Decimal(amount),
          currentValue: new Decimal(amount),
        },
      });
    }

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
        userId,
        fromAccountId,
        type: "INVESTMENT",
        amount: new Decimal(amount),
        description,
        investmentId: investment.id,
        ...(date && { createdAt: date }),
      },
    });

    return transaction;
  });
}

export async function createTransaction(input: CreateTransactionInput) {
  switch (input.type) {
    case "INCOME":
      return createIncome(input);
    case "EXPENSE":
      return createExpense(input);
    case "TRANSFER":
      if (input.transferType === "BANK") {
        return createBankTransfer(input);
      } else if (input.transferType === "PERSON") {
        return createPersonTransfer(input);
      }
      throw new Error("Invalid transferType for TRANSFER transaction");
    case "INVESTMENT":
      return createInvestment(input);
    default:
      throw new Error("Invalid transaction type");
  }
}

export async function getUserSummary(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [bankAccounts, investments, transactions] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { userId },
      orderBy: { isDefault: "desc" },
    }),
    prisma.investment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const monthlyTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      createdAt: { gte: monthStart },
    },
  });

  // Calculate totals
  const totalBalance = bankAccounts.reduce(
    (sum, acc) => sum + acc.balance.toNumber(),
    0
  );

  const totalInvested = investments.reduce(
    (sum, inv) => sum + inv.totalInvested.toNumber(),
    0
  );

  const monthlyExpense = monthlyTransactions
    .filter(
      (t) =>
        t.type === "EXPENSE" ||
        (t.type === "TRANSFER" && t.transferType === "PERSON")
    )
    .reduce((sum, t) => sum + t.amount.toNumber(), 0);

  const monthlyIncome = monthlyTransactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + t.amount.toNumber(), 0);

  return {
    totalBalance,
    totalInvested,
    monthlyExpense,
    monthlyIncome,
    bankAccounts,
    investments,
    recentTransactions: transactions,
  };
}
