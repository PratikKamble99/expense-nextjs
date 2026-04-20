"use client";

import { useState, useEffect, useCallback } from "react";
import type { InsightItem } from "@/lib/spending-insights";

interface InsightCardProps {
  className?: string;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "loaded"; insights: InsightItem[]; period: string }
  | { status: "generating" }
  | { status: "error"; message: string };

export const InsightCard = ({ className = "" }: InsightCardProps) => {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  const fetchInsights = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/insights");
      if (!res.ok) throw new Error("Failed to fetch insights");
      const data = (await res.json()) as { insights: InsightItem[] | null; period?: string };
      if (!data.insights) {
        setState({ status: "empty" });
      } else {
        setState({ status: "loaded", insights: data.insights, period: data.period ?? "" });
      }
    } catch {
      setState({ status: "error", message: "Could not load insights" });
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const generateInsights = async () => {
    setState({ status: "generating" });
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      if (!res.ok) throw new Error("Generation failed");
      const data = (await res.json()) as { insights: InsightItem[] | null; period?: string };
      if (!data.insights) {
        setState({ status: "empty" });
      } else {
        setState({ status: "loaded", insights: data.insights, period: data.period ?? "" });
      }
    } catch {
      setState({ status: "error", message: "Failed to generate insights" });
    }
  };

  const isLoading = state.status === "loading" || state.status === "generating";

  return (
    <div className={`card ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-on-surface tracking-tight">
              AI Spending Insights
            </h2>
            {state.status === "loaded" && (
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mt-0.5">
                {state.period}
              </p>
            )}
          </div>
        </div>

        {/* Refresh button — only when insights exist */}
        {(state.status === "loaded" || state.status === "empty" || state.status === "error") && (
          <button
            onClick={generateInsights}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-dim transition-colors font-medium disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
            </svg>
            {isLoading ? "Generating…" : "Refresh"}
          </button>
        )}
      </div>

      {/* Body */}
      {state.status === "loading" && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="shimmer w-8 h-8 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="shimmer h-4 w-40 rounded" />
                <div className="shimmer h-3 w-56 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {state.status === "generating" && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <p className="text-sm text-on-surface-variant">
            Analysing your spending patterns…
          </p>
        </div>
      )}

      {state.status === "empty" && (
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xl">
            ✨
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface">No insights yet</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Insights generate automatically on the 1st of each month, or click Refresh to generate now.
            </p>
          </div>
          <button
            onClick={generateInsights}
            className="btn-primary text-xs py-2 px-4 mt-1"
          >
            Generate Now
          </button>
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

      {state.status === "loaded" && (
        <div className="space-y-3">
          {state.insights.map((insight, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-high/50 hover:bg-surface-container-high transition-colors"
            >
              <span className="text-xl leading-none flex-shrink-0 mt-0.5">{insight.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface leading-snug">
                  {insight.title}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                  {insight.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
