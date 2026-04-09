"use client";

import { useEffect, useState } from "react";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { getReports } from "@/actions/reports";
import type { ReportsData } from "@/actions/reports";
import { useCurrency } from "@/contexts/CurrencyContext";

// ─── Icons ───────────────────────────────────────────────────────────────────

const BarChartIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="18" y1="20" y2="10" /><line x1="12" x2="12" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="14" />
  </svg>
);
const WalletIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
);
const TrendingUpIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
  </svg>
);
const CalendarIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
  </svg>
);
const ArrowUpRightIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7" /><path d="M7 7h10v10" />
  </svg>
);
const DollarIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const CreditCardIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" />
  </svg>
);
const BankIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="22" y2="11" /><line x1="10" x2="10" y1="22" y2="11" /><line x1="14" x2="14" y1="22" y2="11" /><line x1="18" x2="18" y1="22" y2="11" /><polygon points="12 2 20 7 4 7" />
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "income-expenses", label: "Income & Expenses", subtitle: "Cash flow analysis", Icon: BarChartIcon },
  { id: "account-balances", label: "Account Balances", subtitle: "Net worth snapshot", Icon: WalletIcon },
  { id: "spending-trends", label: "Spending Trends", subtitle: "Category breakdowns", Icon: TrendingUpIcon },
] as const;

const PERIODS = [
  { label: "3M", value: 3 },
  { label: "6M", value: 6 },
  { label: "12M", value: 12 },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FmtFn = (n: number) => string;

function ProgressBar({ pct, color = "indigo" }: { pct: number; color?: "indigo" | "green" | "red" }) {
  const gradient =
    color === "indigo"
      ? "linear-gradient(90deg, #6366f1, #8b5cf6)"
      : color === "green"
      ? "linear-gradient(90deg, #10b981, #34d399)"
      : "linear-gradient(90deg, #ef4444, #f87171)";
  return (
    <div style={{ height: "6px", background: "#1e2130", borderRadius: 999 }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: gradient }}
      />
    </div>
  );
}

function StatCard({
  iconBg,
  icon,
  label,
  value,
}: {
  iconBg: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{ background: "#13161e", border: "1px solid #1e2130" }}
      className="rounded-xl p-5 flex items-center gap-4 hover:brightness-110 transition-all duration-200"
    >
      <div style={{ background: iconBg }} className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#4b5563" }}>
          {label}
        </p>
        <p className="text-2xl font-bold mt-0.5" style={{ color: "#ffffff" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Tab Contents ─────────────────────────────────────────────────────────────

function SpendingTrendsTab({ data, fmt }: { data: ReportsData; fmt: FmtFn }) {
  const { spendingTrends: st } = data;
  const maxMonthly = Math.max(...st.monthlyHistory.map((m) => m.amount), 1);
  const maxCategory = Math.max(...st.topCategories.map((c) => c.amount), 1);

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          iconBg="#3b1515"
          label="Total Spent"
          value={fmt(st.totalSpent)}
          icon={<DollarIcon style={{ color: "#ef4444" }} />}
        />
        <StatCard
          iconBg="rgba(99,102,241,0.18)"
          label="Monthly Avg"
          value={fmt(st.monthlyAvg)}
          icon={<TrendingUpIcon style={{ color: "#818cf8" }} />}
        />
        <StatCard
          iconBg="#1a1d2e"
          label="Transactions"
          value={st.transactionCount.toString()}
          icon={<CreditCardIcon style={{ color: "#6366f1" }} />}
        />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly History */}
        <div style={{ background: "#13161e", border: "1px solid #1e2130" }} className="rounded-xl p-6">
          <div className="flex items-center gap-2.5 mb-6">
            <div style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }} className="w-8 h-8 rounded-lg flex items-center justify-center">
              <CalendarIcon style={{ color: "#818cf8" }} />
            </div>
            <h3 className="font-bold text-base" style={{ color: "#ffffff" }}>Monthly History</h3>
          </div>

          {st.monthlyHistory.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#4b5563" }}>No expense data in this period</p>
          ) : (
            <div className="space-y-5">
              {st.monthlyHistory.map(({ month, amount }) => (
                <div key={month}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: "#9ca3af" }}>{month}</span>
                    <span className="text-sm font-bold" style={{ color: "#ffffff" }}>{fmt(amount)}</span>
                  </div>
                  <ProgressBar pct={(amount / maxMonthly) * 100} color="indigo" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Categories */}
        <div style={{ background: "#13161e", border: "1px solid #1e2130" }} className="rounded-xl p-6">
          <div className="flex items-center gap-2.5 mb-6">
            <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }} className="w-8 h-8 rounded-lg flex items-center justify-center">
              <ArrowUpRightIcon style={{ color: "#ef4444" }} />
            </div>
            <h3 className="font-bold text-base" style={{ color: "#ffffff" }}>Top Categories</h3>
          </div>

          {st.topCategories.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#4b5563" }}>No categorised expenses yet</p>
          ) : (
            <div className="space-y-3">
              {st.topCategories.map(({ name, amount }, i) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style={{ background: "#1a1d28", color: "#6b7280" }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 relative h-7 flex items-center">
                    <div
                      className="absolute left-0 top-0 h-full rounded-md transition-all duration-700"
                      style={{ width: `${(amount / maxCategory) * 100}%`, background: "rgba(61,21,21,0.7)" }}
                    />
                    <span className="relative text-sm font-semibold px-2 truncate" style={{ color: "#e5e7eb" }}>
                      {name}
                    </span>
                  </div>
                  <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "#ef4444" }}>
                    {fmt(amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CashFlowTab({ data, fmt }: { data: ReportsData; fmt: FmtFn }) {
  const { cashFlow: cf } = data;
  const maxVal = Math.max(...cf.monthly.flatMap((m) => [m.income, m.expense]), 1);
  const netPositive = cf.net >= 0;

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          iconBg="rgba(16,185,129,0.18)"
          label="Total Income"
          value={fmt(cf.totalIncome)}
          icon={<TrendingUpIcon style={{ color: "#10b981" }} />}
        />
        <StatCard
          iconBg="#3b1515"
          label="Total Expense"
          value={fmt(cf.totalExpense)}
          icon={<DollarIcon style={{ color: "#ef4444" }} />}
        />
        <StatCard
          iconBg={netPositive ? "rgba(16,185,129,0.12)" : "#3b1515"}
          label="Net"
          value={(netPositive ? "+" : "") + fmt(cf.net)}
          icon={<BarChartIcon style={{ color: netPositive ? "#10b981" : "#ef4444" }} />}
        />
      </div>

      {/* Monthly income vs expense */}
      <div style={{ background: "#13161e", border: "1px solid #1e2130" }} className="rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }} className="w-8 h-8 rounded-lg flex items-center justify-center">
              <BarChartIcon style={{ color: "#818cf8" }} />
            </div>
            <h3 className="font-bold text-base" style={{ color: "#ffffff" }}>Monthly Cash Flow</h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#10b981" }} />
              <span style={{ color: "#9ca3af" }}>Income</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#ef4444" }} />
              <span style={{ color: "#9ca3af" }}>Expense</span>
            </span>
          </div>
        </div>

        {cf.monthly.every((m) => m.income === 0 && m.expense === 0) ? (
          <p className="text-sm text-center py-8" style={{ color: "#4b5563" }}>No transactions in this period</p>
        ) : (
          <div className="space-y-6">
            {cf.monthly.map(({ month, income, expense }) => (
              <div key={month}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: "#9ca3af" }}>{month}</span>
                  <div className="flex gap-4 text-xs tabular-nums">
                    <span style={{ color: "#10b981" }}>+{fmt(income)}</span>
                    <span style={{ color: "#ef4444" }}>-{fmt(expense)}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <ProgressBar pct={(income / maxVal) * 100} color="green" />
                  <ProgressBar pct={(expense / maxVal) * 100} color="red" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function AccountBalancesTab({ data, fmt }: { data: ReportsData; fmt: FmtFn }) {
  const { accountBalances: ab } = data;
  const maxBalance = Math.max(...ab.accounts.map((a) => a.balance), 1);

  return (
    <>
      {/* Total balance stat */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          iconBg="rgba(99,102,241,0.18)"
          label="Total Balance"
          value={fmt(ab.totalBalance)}
          icon={<WalletIcon style={{ color: "#818cf8" }} />}
        />
        <StatCard
          iconBg="#1a1d2e"
          label="Accounts"
          value={ab.accounts.length.toString()}
          icon={<BankIcon style={{ color: "#6366f1" }} />}
        />
        <StatCard
          iconBg={ab.totalBalance >= 0 ? "rgba(16,185,129,0.12)" : "#3b1515"}
          label="Net Worth"
          value={fmt(ab.totalBalance)}
          icon={<TrendingUpIcon style={{ color: ab.totalBalance >= 0 ? "#10b981" : "#ef4444" }} />}
        />
      </div>

      {/* Account breakdown */}
      <div style={{ background: "#13161e", border: "1px solid #1e2130" }} className="rounded-xl p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <div style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }} className="w-8 h-8 rounded-lg flex items-center justify-center">
            <BankIcon style={{ color: "#818cf8" }} />
          </div>
          <h3 className="font-bold text-base" style={{ color: "#ffffff" }}>Account Balances</h3>
        </div>

        {ab.accounts.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "#4b5563" }}>No accounts found</p>
        ) : (
          <div className="space-y-5">
            {ab.accounts.map((acc) => {
              const pct = (acc.balance / maxBalance) * 100;
              return (
                <div key={acc.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: "#ffffff" }}>{acc.name}</span>
                      {acc.isDefault && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "#ffffff" }}>
                      {fmt(acc.balance)}
                    </span>
                  </div>
                  <ProgressBar pct={pct} color="indigo" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { formatCurrency: fmt } = useCurrency();
  const [activeTab, setActiveTab] = useState<string>("spending-trends");
  const [activePeriod, setActivePeriod] = useState<number>(6);
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getReports(activePeriod)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activePeriod]);

  const periodLabel = PERIODS.find((p) => p.value === activePeriod)?.label ?? "6M";

  return (
    <>
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 border-b" style={{ background: "#0d0f14", borderColor: "#1e2130" }}>
        <div className="px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <MobileMenuButton />
            <div className="hidden md:block">
              <h1 className="text-xl font-bold tracking-tight" style={{ color: "#ffffff" }}>Reports</h1>
              <p className="text-xs mt-0.5 tracking-wide" style={{ color: "#6b7280" }}>
                {loading ? "Loading…" : `Showing last ${periodLabel}`}
              </p>
            </div>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-primary-glow bg-primary-gradient">
            R
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" style={{ background: "#0d0f14" }}>

        {/* ── Tab Navigation ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TABS.map(({ id, label, subtitle, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  background: active ? "#16192a" : "#13161e",
                  border: active ? "1px solid #6366f1" : "1px solid #1e2130",
                  boxShadow: active ? "inset 3px 0 0 #6366f1, 0 0 24px rgba(99,102,241,0.08)" : "none",
                }}
                className="flex items-center gap-3 p-4 rounded-xl transition-all duration-200 text-left w-full hover:brightness-110"
              >
                <div
                  style={{
                    background: active ? "rgba(99,102,241,0.18)" : "#1a1d28",
                    border: "1px solid " + (active ? "rgba(99,102,241,0.4)" : "#2a2d3d"),
                  }}
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                >
                  <Icon style={{ color: active ? "#818cf8" : "#6b7280" }} />
                </div>
                <div>
                  <p className="font-semibold text-sm leading-tight" style={{ color: active ? "#ffffff" : "#9ca3af" }}>
                    {label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>{subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Trend Analysis Header + Period picker ───────────────────── */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold" style={{ color: "#ffffff" }}>Trend Analysis</h2>
          <div className="flex items-center gap-2">
            {PERIODS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setActivePeriod(value)}
                style={
                  activePeriod === value
                    ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#ffffff", border: "1px solid transparent" }
                    : { background: "#13161e", color: "#9ca3af", border: "1px solid #1e2130" }
                }
                className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 hover:brightness-110"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ background: "#13161e", border: "1px solid #1e2130" }} className="rounded-xl p-5 h-24 shimmer" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div style={{ background: "#13161e", border: "1px solid #1e2130" }} className="rounded-xl h-64 shimmer" />
              <div style={{ background: "#13161e", border: "1px solid #1e2130" }} className="rounded-xl h-64 shimmer" />
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl p-6 text-center" style={{ background: "#13161e", border: "1px solid #3b1515" }}>
            <p style={{ color: "#ef4444" }} className="font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {activeTab === "spending-trends" && <SpendingTrendsTab data={data} fmt={fmt} />}
            {activeTab === "income-expenses" && <CashFlowTab data={data} fmt={fmt} />}
            {activeTab === "account-balances" && <AccountBalancesTab data={data} fmt={fmt} />}
          </div>
        )}

      </main>
    </>
  );
}
