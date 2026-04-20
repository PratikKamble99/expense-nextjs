import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const transferPairSchema = z.object({
  debitTempId: z.string(),
  creditTempId: z.string(),
  amount: z.number().positive(),
  confidence: z.number(),
  needsReview: z.boolean().optional(),
  reasons: z.array(z.string()),
  fromAccountId: z.string(),
  toAccountId: z.string(),
});

const rawTransactionSchema = z.object({
  tempId: z.string(),
  sourceAccountId: z.string(),
  date: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  type: z.enum(["DEBIT", "CREDIT"]),
  referenceNumber: z.string().optional(),
});

const dbCandidateLinkSchema = z.object({
  tempId: z.string(),       // raw transaction from this batch (will be skipped)
  existingTxId: z.string(), // DB transaction to convert to TRANSFER
});

const bodySchema = z.object({
  importId: z.string(),
  confirmedPairs: z.array(transferPairSchema),
  dismissedPairIds: z.array(z.string()),
  transactions: z.array(rawTransactionSchema),
  dbCandidateLinks: z.array(dbCandidateLinkSchema).optional(),
});

// Row shape accepted by prisma.transaction.createMany
type TxRow = {
  userId: string;
  fromAccountId: string;
  toAccountId?: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT";
  transferType?: "BANK" | "PERSON";
  amount: Decimal;
  description?: string;
  category?: string;
  importId: string;
  rawNarration?: string;
  createdAt?: Date;
};

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { importId, confirmedPairs, dismissedPairIds, transactions, dbCandidateLinks = [] } =
      bodySchema.parse(body);

    // Verify the import belongs to this user
    const importRecord = await prisma.statementImport.findUnique({
      where: { id: importId },
    });
    if (!importRecord || importRecord.userId !== session.user.id) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    const txByTempId = new Map(transactions.map((t) => [t.tempId, t]));

    const pairedTempIds = new Set<string>();
    for (const pair of confirmedPairs) {
      pairedTempIds.add(pair.debitTempId);
      pairedTempIds.add(pair.creditTempId);
    }
    // tempIds covered by a DB candidate link are also paired (skipped from clean import)
    const dbLinkedTempIds = new Set(dbCandidateLinks.map((l) => l.tempId));
    const dismissedSet = new Set(dismissedPairIds);

    let imported = 0;
    let transfersCreated = 0;
    let skipped = 0;

    // ── Build transaction rows + per-account balance deltas in memory ──────────
    // This avoids sequential DB round-trips inside an interactive transaction.

    const txRows: TxRow[] = [];
    const balanceDeltas = new Map<string, Decimal>(); // accountId → net change

    const applyDelta = (accountId: string, delta: Decimal) => {
      balanceDeltas.set(
        accountId,
        (balanceDeltas.get(accountId) ?? new Decimal(0)).add(delta),
      );
    };

    // Transfer pairs
    for (const pair of confirmedPairs) {
      const debitTx = txByTempId.get(pair.debitTempId);
      const creditAmount = new Decimal(pair.amount);
      const debitAmount = debitTx ? new Decimal(debitTx.amount) : creditAmount;
      const rawNarration = debitTx?.description ?? "";

      applyDelta(pair.fromAccountId, debitAmount.negated());
      applyDelta(pair.toAccountId, creditAmount);

      txRows.push({
        userId: session.user.id,
        fromAccountId: pair.fromAccountId,
        toAccountId: pair.toAccountId,
        type: "TRANSFER",
        transferType: "BANK",
        amount: creditAmount,
        description: "Bank transfer",
        importId,
        rawNarration,
        ...(debitTx?.date ? { createdAt: new Date(debitTx.date) } : {}),
      });
      transfersCreated++;

      // Bank fee when debit > credit
      if (debitAmount.greaterThan(creditAmount)) {
        const fee = debitAmount.minus(creditAmount);
        applyDelta(pair.fromAccountId, fee.negated());
        txRows.push({
          userId: session.user.id,
          fromAccountId: pair.fromAccountId,
          type: "EXPENSE",
          amount: fee,
          description: "Transfer fee",
          category: "Bank Charges",
          importId,
          ...(debitTx?.date ? { createdAt: new Date(debitTx.date) } : {}),
        });
        imported++;
      }
    }

    // ── DB cross-import transfers (existing EXPENSE/INCOME → TRANSFER) ──────────
    // Load all existing transactions up front so the final $transaction is atomic.

    const txIdsToDelete: string[] = [];

    for (const link of dbCandidateLinks) {
      const existingTx = await prisma.transaction.findUnique({
        where: { id: link.existingTxId, userId: session.user.id },
      });
      if (!existingTx) continue;

      const rawTx = txByTempId.get(link.tempId);
      if (!rawTx) continue;

      // Determine direction
      // EXPENSE in DB = debit side  (from=existingTx.fromAccountId, to=rawTx.sourceAccountId)
      // INCOME in DB  = credit side (from=rawTx.sourceAccountId,    to=existingTx.fromAccountId)
      let fromAccountId: string;
      let toAccountId: string;
      const transferAmount = new Decimal(existingTx.amount);

      if (existingTx.type === "EXPENSE") {
        fromAccountId = existingTx.fromAccountId;
        toAccountId = rawTx.sourceAccountId;
        // The EXPENSE already debited fromAccount. TRANSFER also debits fromAccount → net 0.
        // Only new effect: credit toAccount.
        applyDelta(toAccountId, transferAmount);
      } else {
        // INCOME: existing INCOME credited toAccount. TRANSFER also credits toAccount → net 0.
        // Only new effect: debit fromAccount (rawTx.sourceAccountId).
        fromAccountId = rawTx.sourceAccountId;
        toAccountId = existingTx.fromAccountId;
        applyDelta(fromAccountId, transferAmount.negated());
      }

      txIdsToDelete.push(existingTx.id);
      txRows.push({
        userId: session.user.id,
        fromAccountId,
        toAccountId,
        type: "TRANSFER",
        transferType: "BANK",
        amount: transferAmount,
        description: "Bank transfer",
        importId,
        rawNarration: rawTx.description,
        createdAt: new Date(rawTx.date),
      });
      transfersCreated++;
    }

    // Clean (non-transfer) transactions
    for (const raw of transactions) {
      if (pairedTempIds.has(raw.tempId)) continue;
      if (dbLinkedTempIds.has(raw.tempId)) continue;
      if (dismissedSet.has(raw.tempId)) {
        skipped++;
        continue;
      }

      const amt = new Decimal(raw.amount);
      const date = new Date(raw.date);

      if (raw.type === "CREDIT") {
        applyDelta(raw.sourceAccountId, amt);
        txRows.push({
          userId: session.user.id,
          fromAccountId: raw.sourceAccountId,
          type: "INCOME",
          amount: amt,
          description: raw.description,
          importId,
          rawNarration: raw.description,
          createdAt: date,
        });
      } else {
        applyDelta(raw.sourceAccountId, amt.negated());
        txRows.push({
          userId: session.user.id,
          fromAccountId: raw.sourceAccountId,
          type: "EXPENSE",
          amount: amt,
          description: raw.description,
          importId,
          rawNarration: raw.description,
          createdAt: date,
        });
      }
      imported++;
    }

    // ── Execute atomically: createMany + one update per account + status ───────
    // Array-form $transaction sends everything in a single BEGIN/COMMIT with no
    // Node.js round-trips between statements, so it never hits Prisma's timeout.

    const balanceOps = Array.from(balanceDeltas.entries()).map(
      ([accountId, delta]) =>
        delta.greaterThanOrEqualTo(0)
          ? prisma.bankAccount.update({
              where: { id: accountId },
              data: { balance: { increment: delta } },
            })
          : prisma.bankAccount.update({
              where: { id: accountId },
              data: { balance: { decrement: delta.abs() } },
            }),
    );

    const deleteOps = txIdsToDelete.length > 0
      ? [prisma.transaction.deleteMany({ where: { id: { in: txIdsToDelete } } })]
      : [];

    await prisma.$transaction([
      ...deleteOps,
      prisma.transaction.createMany({ data: txRows }),
      ...balanceOps,
      prisma.statementImport.update({
        where: { id: importId },
        data: { status: "imported" },
      }),
    ]);

    return NextResponse.json({ imported, transfersCreated, skipped });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
