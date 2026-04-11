import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createAccountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  currency: z.string().optional().default("USD"),
  isDefault: z.boolean().optional().default(false),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await prisma.bankAccount.findMany({
      where: { userId: session.user.id },
      orderBy: { isDefault: "desc" },
    });

    const totalBalance = accounts.reduce(
      (sum, account) => sum + Number(account.balance),
      0
    );

    return NextResponse.json({
      bankAccounts: accounts,
      totalBalance,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
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
    const validatedData = createAccountSchema.parse(body);

    // Create account
    const account = await prisma.bankAccount.create({
      data: {
        userId: session.user.id,
        ...validatedData,
      },
    });

    return NextResponse.json(account, { status: 201 });
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
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
