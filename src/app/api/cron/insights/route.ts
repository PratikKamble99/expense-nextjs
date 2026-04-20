import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAndStoreInsights } from "@/lib/spending-insights";

/**
 * GET /api/cron/insights
 * Protected by CRON_SECRET (set in Vercel env vars).
 * Vercel cron calls this on the 1st of each month at 09:00 UTC.
 * Generates insights for every user and stores them in spending_insight table.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const users = await prisma.user.findMany({ select: { id: true } });

  const results = await Promise.allSettled(
    users.map((u) => generateAndStoreInsights(u.id))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return new Response(JSON.stringify({ total: users.length, succeeded, failed }), {
    headers: { "Content-Type": "application/json" },
  });
}
