import { NextRequest } from "next/server";
import { processWebhookRetries } from "@/lib/webhooks";

/**
 * GET /api/webhooks/deliver
 * Processes all overdue webhook retries.
 * Protected by CRON_SECRET — called by Vercel cron every 5 minutes.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processWebhookRetries();
  return Response.json(result);
}
