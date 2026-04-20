import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectTransfers } from "@/lib/transfer-detector";
import type { RawTransaction } from "@/lib/transfer-detector";

export interface DbCandidate {
  /** tempId of the raw transaction in this batch */
  tempId: string;
  /** ID of the matching DB transaction (already imported) */
  existingTxId: string;
  /** Type of the existing DB transaction */
  existingTxType: "INCOME" | "EXPENSE";
  /** Account the existing transaction lives in */
  existingAccountId: string;
  existingAccountName: string;
  amount: number;
  date: string;
  description: string;
  confidence: number;
}

const INTERBANK_RE = /\b(IMPS|NEFT|RTGS|MMID|MMT|UPI)\b/i;

const rawTransactionSchema = z.object({
  tempId: z.string(),
  sourceAccountId: z.string(),
  date: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  type: z.enum(["DEBIT", "CREDIT"]),
  referenceNumber: z.string().optional(),
});

const bodySchema = z.object({
  transactions: z.array(rawTransactionSchema),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { transactions: rawTxs } = bodySchema.parse(body);

    const txs: RawTransaction[] = rawTxs.map((t) => ({
      ...t,
      date: new Date(t.date),
    }));

    const result = detectTransfers(txs);

    // ── DB cross-match for unmatched IMPS / NEFT / RTGS / UPI transactions ──────
    // When accounts are imported in separate sessions, the in-batch detector finds
    // no pair. This step queries the DB for the other leg already stored there.

    const dbCandidates: DbCandidate[] = [];

    for (const cleanTx of result.cleanTransactions) {
      if (!INTERBANK_RE.test(cleanTx.description)) continue;

      const pct2 = cleanTx.amount * 0.02;
      const minAmt = new Decimal(cleanTx.amount - pct2);
      const maxAmt = new Decimal(cleanTx.amount + pct2);
      const minDate = new Date(cleanTx.date.getTime() - 3 * 86_400_000);
      const maxDate = new Date(cleanTx.date.getTime() + 3 * 86_400_000);
      // Debit in this batch → look for INCOME in DB (other leg was a credit)
      // Credit in this batch → look for EXPENSE in DB (other leg was a debit)
      const expectedType = cleanTx.type === "DEBIT" ? "INCOME" : "EXPENSE";

      const matches = await prisma.transaction.findMany({
        where: {
          userId: session.user.id,
          fromAccountId: { not: cleanTx.sourceAccountId },
          amount: { gte: minAmt, lte: maxAmt },
          createdAt: { gte: minDate, lte: maxDate },
          type: expectedType,
          OR: [
            { rawNarration: { contains: "IMPS", mode: "insensitive" } },
            { rawNarration: { contains: "NEFT", mode: "insensitive" } },
            { rawNarration: { contains: "RTGS", mode: "insensitive" } },
            { rawNarration: { contains: "UPI", mode: "insensitive" } },
            { rawNarration: { contains: "MMT", mode: "insensitive" } },
          ],
        },
        include: { fromAccount: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      });

      if (matches.length > 0) {
        const match = matches[0];
        dbCandidates.push({
          tempId: cleanTx.tempId,
          existingTxId: match.id,
          existingTxType: match.type as "INCOME" | "EXPENSE",
          existingAccountId: match.fromAccountId,
          existingAccountName: match.fromAccount.name,
          amount: cleanTx.amount,
          date: cleanTx.date.toISOString(),
          description: cleanTx.description,
          confidence: 0.85,
        });
      }
    }

    const record = await prisma.statementImport.create({
      data: {
        userId: session.user.id,
        status: "pending",
        rawData: result as unknown as object,
      },
    });

    return NextResponse.json({ importId: record.id, result, dbCandidates });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Detection failed" }, { status: 500 });
  }
}
