import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WebhookEvent = "transaction.created" | "transaction.deleted";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

// ── Retry schedule (delays in ms) ─────────────────────────────────────────────
// Attempt 1: immediate, 2: +1min, 3: +5min, 4: +30min, 5: +2hr → then give up

const RETRY_DELAYS_MS = [0, 60_000, 300_000, 1_800_000, 7_200_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

// ── HMAC signing ─────────────────────────────────────────────────────────────

function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ── Single delivery attempt ───────────────────────────────────────────────────

async function attemptDelivery(
  url: string,
  secret: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sig = signPayload(secret, body);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Luminescent-Signature": `sha256=${sig}`,
        "X-Luminescent-Event": JSON.parse(body).event as string,
        "User-Agent": "LuminescentLedger-Webhook/1.0",
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });

    if (res.ok) return { success: true };
    return { success: false, error: `HTTP ${res.status} ${res.statusText}` };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Deliver a webhook event to all matching endpoints ─────────────────────────

/**
 * Fire-and-forget. Creates WebhookDelivery records and attempts first delivery.
 * Call without await from transaction creation paths.
 */
export async function deliverWebhookEvent(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId, active: true, events: { has: event } },
  });

  if (endpoints.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);

  await Promise.allSettled(
    endpoints.map(async (ep) => {
      const result = await attemptDelivery(ep.url, ep.secret, body);

      await prisma.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          event,
          payload: payload as object,
          status: result.success ? "success" : "failed",
          attempts: 1,
          lastError: result.error ?? null,
          nextRetryAt: result.success
            ? null
            : new Date(Date.now() + RETRY_DELAYS_MS[1]),
        },
      });
    })
  );
}

// ── Retry processor (called by cron) ─────────────────────────────────────────

/**
 * Processes all failed WebhookDelivery rows that are due for retry.
 * Returns counts of succeeded/failed/abandoned.
 */
export async function processWebhookRetries(): Promise<{
  retried: number;
  succeeded: number;
  abandoned: number;
}> {
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ["failed", "retrying"] },
      nextRetryAt: { lte: new Date() },
    },
    include: { endpoint: true },
  });

  let succeeded = 0;
  let abandoned = 0;

  await Promise.allSettled(
    due.map(async (delivery) => {
      const body = JSON.stringify(delivery.payload);
      const result = await attemptDelivery(
        delivery.endpoint.url,
        delivery.endpoint.secret,
        body
      );

      const attempts = delivery.attempts + 1;

      if (result.success) {
        succeeded++;
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "success", attempts, lastError: null, nextRetryAt: null },
        });
      } else if (attempts >= MAX_ATTEMPTS) {
        abandoned++;
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "failed", attempts, lastError: result.error ?? null, nextRetryAt: null },
        });
      } else {
        const nextDelay = RETRY_DELAYS_MS[attempts] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "retrying",
            attempts,
            lastError: result.error ?? null,
            nextRetryAt: new Date(Date.now() + nextDelay),
          },
        });
      }
    })
  );

  return { retried: due.length, succeeded, abandoned };
}
