"use client";

import { useState, useEffect, useCallback } from "react";
import type { SpendingForecast } from "@/lib/spending-forecast";

interface ForecastCardProps {
  /** Pass a revision counter to trigger a refetch (increment after a transaction is added) */
  revision?: number;
  className?: string;
}

type FetchState =
  | { status: "loading" }
  | { status: "loaded"; data: SpendingForecast }
  | { status: "error"; message: string };

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);

export const ForecastCard = ({ revision = 0, className = "" }: ForecastCardProps) => {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  const fetchForecast = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/forecast");
      if (!res.ok) throw new Error("Failed to fetch forecast");
      const data = (await res.json()) as SpendingForecast;
      setState({ status: "loaded", data });
    } catch {
      setState({ status: "error", message: "Could not load forecast" });
    }
  }, []);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast, revision]);

  return (
    <div className={`card ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </div>
        <h2 className="text-sm font-bold text-on-surface tracking-tight">
          Spending Forecast
        </h2>
      </div>

      {state.status === "loading" && (
        <div className="space-y-4">
          <div className="shimmer h-9 w-36 rounded-lg" />
          <div className="shimmer h-2 w-full rounded-full" />
          <div className="shimmer h-4 w-full rounded" />
          <div className="shimmer h-4 w-3/4 rounded" />
        </div>
      )}

      {state.status === "error" && (
        <div className="flex items-center gap-2 text-sm text-error py-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          {state.message}
        </div>
      )}

      {state.status === "loaded" && (() => {
        const { data } = state;
        const spentPct = Math.min(
          Math.round((data.spentSoFar / Math.max(data.forecastedTotal, 1)) * 100),
          100
        );

        return (
          <div className="space-y-4">
            {/* Projected total */}
            <div>
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-medium mb-1">
                Projected this month
              </p>
              <p className="text-3xl font-bold text-on-surface tracking-tight tabular-nums">
                {fmt(data.forecastedTotal, data.currency)}
              </p>
            </div>

            {/* Progress bar: month elapsed vs spent-to-projected */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">
                <span>{data.monthPct}% of month</span>
                <span>{spentPct}% of projection</span>
              </div>

              {/* Month timeline bar */}
              <div className="relative h-2 bg-surface-container-high rounded-full overflow-hidden">
                {/* Spent bar */}
                <div
                  className="absolute inset-y-0 left-0 bg-primary/60 rounded-full transition-all duration-700"
                  style={{ width: `${spentPct}%` }}
                />
                {/* Month elapsed marker */}
                <div
                  className="absolute inset-y-0 w-0.5 bg-tertiary/80"
                  style={{ left: `${data.monthPct}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-on-surface-variant">
                <span>{fmt(data.spentSoFar, data.currency)} spent</span>
                <span>Day {data.daysElapsed}/{data.daysInMonth}</span>
              </div>
            </div>

            {/* Daily rate */}
            <div className="flex gap-4 pt-1">
              <div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">
                  Daily rate
                </p>
                <p className="text-sm font-semibold text-on-surface tabular-nums mt-0.5">
                  {fmt(data.dailyRate, data.currency)}/day
                </p>
              </div>
              {data.topCategory && (
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">
                    Top category
                  </p>
                  <p className="text-sm font-semibold text-on-surface mt-0.5">
                    {data.topCategory}
                  </p>
                </div>
              )}
            </div>

            {/* GPT narrative */}
            {data.narrative && (
              <div className="pt-2 border-t border-line-subtle/10">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {data.narrative}
                </p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
