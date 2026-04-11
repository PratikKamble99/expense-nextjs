import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createTransaction, getUserSummary } from "@/lib/transactions";

const createTransactionSchema = z.object({
  fromAccountId: z.string(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"]),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().optional(),
  category: z.string().optional(),
  toAccountId: z.string().optional(),
  transferType: z.enum(["BANK", "PERSON"]).optional(),
  recipientName: z.string().optional(),
  investmentName: z.string().optional(),
  investmentType: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await getUserSummary(session.user.id);

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Validate input
    const validatedData = createTransactionSchema.parse(body);

    // Create transaction
    const transaction = await createTransaction({
      userId: session.user.id,
      ...validatedData,
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
