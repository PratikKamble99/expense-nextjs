import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// ── GET /api/v1/accounts ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const accounts = await prisma.bankAccount.findMany({
    where: { userId: auth.userId },
    orderBy: { isDefault: "desc" },
  });

  return Response.json({
    data: accounts.map((a) => ({
      id:            a.id,
      name:          a.name,
      type:          a.type ?? null,
      balance:       a.balance.toNumber(),
      currency:      a.currency,
      bank:          a.bank ?? null,
      isDefault:     a.isDefault,
      lastFourDigits: a.lastFourDigits ?? null,
      createdAt:     a.createdAt.toISOString(),
    })),
  });
}
