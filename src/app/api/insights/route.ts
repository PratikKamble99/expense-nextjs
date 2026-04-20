import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import {
  getStoredInsights,
  generateAndStoreInsights,
} from "@/lib/spending-insights";

/**
 * GET /api/insights
 * Returns the stored insights for the current user's current month period.
 * Returns { insights: null } when no insights have been generated yet.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await getStoredInsights(session.user.id);

  return new Response(JSON.stringify(result ?? { insights: null }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /api/insights
 * Triggers on-demand insight generation for the current user.
 * Used when the user clicks "Refresh insights" in the dashboard.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  await generateAndStoreInsights(session.user.id);

  const result = await getStoredInsights(session.user.id);

  return new Response(JSON.stringify(result ?? { insights: null }), {
    headers: { "Content-Type": "application/json" },
  });
}
