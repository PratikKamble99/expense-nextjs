import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getSpendingForecast } from "@/lib/spending-forecast";

/**
 * GET /api/forecast
 * Returns a real-time spending forecast for the current user's current month.
 * Recalculates on every request — intentionally not cached.
 * Dashboard refetches this after each new transaction.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const forecast = await getSpendingForecast(session.user.id);
    return new Response(JSON.stringify(forecast), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate forecast";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
