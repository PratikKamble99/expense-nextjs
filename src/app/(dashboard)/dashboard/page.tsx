"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { AddTransactionModal } from "@/components/transactions/AddTransactionModal";
import { getDashboardSummary } from "@/actions/transactions";
import type { DashboardSummary } from "@/actions/transactions";
import { useCurrency } from "@/contexts/CurrencyContext";

export default function DashboardPage() {
    const { data: session } = useSession();
    const { formatCurrency } = useCurrency();
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        if (session) {
            fetchSummary();
        }
    }, [session]);

    const fetchSummary = async () => {
        try {
            const data = await getDashboardSummary();
            setSummary(data);
        } catch (error) {
            console.error("Failed to fetch summary:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <>
                <header className="sticky top-0 z-10 bg-surface-container-low border-b border-line-subtle/10">
                    <div className="px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
                        <div className="shimmer h-8 w-48 rounded-lg" />
                        <div className="shimmer h-5 w-32 rounded-lg" />
                    </div>
                </header>
                <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="card space-y-3">
                                <div className="shimmer h-4 w-24" />
                                <div className="shimmer h-9 w-36" />
                            </div>
                        ))}
                    </div>
                    <div className="shimmer h-5 w-28 rounded-lg mb-4" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="card space-y-3">
                                <div className="shimmer h-5 w-32" />
                                <div className="shimmer h-4 w-16" />
                                <div className="shimmer h-8 w-28" />
                            </div>
                        ))}
                    </div>
                </main>
            </>
        );
    }

    if (!summary) {
        return null;
    }

    const getTransactionColor = (type: string) => {
        switch (type) {
            case "INCOME":
                return "text-tertiary";
            case "EXPENSE":
                return "text-error";
            case "TRANSFER":
                return "text-primary";
            case "INVESTMENT":
                return "text-primary-dim";
            default:
                return "text-on-surface-variant";
        }
    };

    const getBadgeClass = (type: string) => {
        switch (type) {
            case "INCOME":
                return "badge-income";
            case "EXPENSE":
                return "badge-expense";
            case "TRANSFER":
                return "badge-transfer";
            case "INVESTMENT":
                return "badge-investment";
            default:
                return "badge bg-surface-container-high text-on-surface-variant";
        }
    };

    const getAmountSign = (type: string) => {
        switch (type) {
            case "INCOME":
                return "+";
            case "EXPENSE":
            case "TRANSFER":
            case "INVESTMENT":
                return "-";
            default:
                return "";
        }
    };

    const getStatIcon = (label: string) => {
        switch (label) {
            case "Total Balance":
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                    </svg>
                );
            case "Monthly Income":
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                    </svg>
                );
            case "Monthly Expense":
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" />
                    </svg>
                );
            case "Total Invested":
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" />
                    </svg>
                );
            default:
                return null;
        }
    };

    const stats = [
        {
            label: "Total Balance",
            value: summary.totalBalance,
            color: "text-on-surface",
            iconColor: "text-primary bg-primary/10",
        },
        {
            label: "Monthly Income",
            value: summary.monthlyIncome,
            color: "text-tertiary",
            prefix: "+",
            iconColor: "text-tertiary bg-tertiary/10",
        },
        {
            label: "Monthly Expense",
            value: summary.monthlyExpense,
            color: "text-error",
            prefix: "-",
            iconColor: "text-error bg-error/10",
        },
        {
            label: "Total Invested",
            value: summary.totalInvested,
            color: "text-primary",
            iconColor: "text-primary-dim bg-primary/10",
        },
    ];

    return (
        <>
            {/* Header — sticky so it stays visible while scrolling */}
            <header className="sticky top-0 z-10 bg-surface-container-low border-b border-line-subtle/10">
                <div className="px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <MobileMenuButton />
                        <div className="hidden md:block">
                            <h1 className="text-xl font-bold text-on-surface tracking-tight">
                                Luminescent Ledger
                            </h1>
                            <p className="text-xs text-on-surface-variant mt-0.5 tracking-wide">
                                Your financial ecosystem
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-on-surface-variant hidden sm:inline">
                            Welcome,{" "}
                            <strong className="text-on-surface font-semibold">
                                {session?.user?.name || session?.user?.email}
                            </strong>
                        </span>
                        <div className="w-9 h-9 rounded-full bg-primary-gradient flex items-center justify-center text-white font-bold text-sm shadow-primary-glow">
                            {(session?.user?.name || session?.user?.email || "U").charAt(0).toUpperCase()}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                    {stats.map((stat, index) => (
                    <div
                        key={stat.label}
                        className="card animate-fade-in group hover:bg-surface-container-high transition-all duration-300"
                        style={{ animationDelay: `${index * 80}ms` }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <p className="stat-label">{stat.label}</p>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.iconColor} transition-transform duration-300 group-hover:scale-110`}>
                                {getStatIcon(stat.label)}
                            </div>
                        </div>
                        <p className={`stat-value ${stat.color}`}>
                            {stat.prefix || ""}{formatCurrency(stat.value)}
                        </p>
                    </div>
                ))}
                </div>

                {/* Accounts Section */}
                <div className="mb-10">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-bold text-on-surface tracking-tight">
                            Accounts
                        </h2>
                        <span className="text-xs text-on-surface-variant uppercase tracking-wider font-medium">
                            {summary.bankAccounts.length} active
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {summary.bankAccounts.map((account, index) => (
                            <div
                                key={account.id}
                                className="card-interactive animate-fade-in"
                                style={{ animationDelay: `${(index + 4) * 80}ms` }}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-semibold text-on-surface">
                                        {account.name}
                                    </h3>
                                    {account.isDefault && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/12 text-primary px-2.5 py-1 rounded-lg">
                                            Default
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-on-surface-variant mb-4 uppercase tracking-wider font-medium">
                                    {account.currency}
                                </p>
                                <p className="text-2xl font-bold text-on-surface tracking-tight">
                                    {formatCurrency(Number(account.balance))}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Add Transaction CTA */}
                <button
                    onClick={() => setShowModal(true)}
                    className="btn-primary mb-10 flex items-center gap-2 group"
                    id="add-transaction-btn"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
                    </svg>
                    New Transaction
                </button>

                {/* Recent Transactions */}
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-bold text-on-surface tracking-tight">
                            Recent Activity
                        </h2>
                        <button className="text-xs text-primary font-medium hover:text-primary-dim transition-colors uppercase tracking-wider">
                            View All
                        </button>
                    </div>
                    <div className="bg-surface-container-low rounded-2xl overflow-hidden">
                        {summary.recentTransactions.length > 0 ? (
                            <div className="divide-y-0">
                                {summary.recentTransactions.map((transaction, index) => (
                                    <div
                                        key={transaction.id}
                                        className="flex justify-between items-center px-6 py-4 bg-surface-container hover:bg-surface-container-high transition-all duration-200 cursor-pointer animate-fade-in"
                                        style={{
                                            animationDelay: `${(index + 7) * 60}ms`,
                                            marginBottom: index < summary.recentTransactions.length - 1 ? '2px' : '0',
                                        }}
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className={getBadgeClass(transaction.type)}>
                                                {transaction.type === "TRANSFER"
                                                    ? `${transaction.type}`
                                                    : transaction.type}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-on-surface text-sm truncate">
                                                    {transaction.description ||
                                                        transaction.recipientName ||
                                                        transaction.type}
                                                </p>
                                                {transaction.category && (
                                                    <p className="text-xs text-on-surface-variant mt-0.5">
                                                        {transaction.category}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <p
                                            className={`text-base font-semibold tabular-nums ${getTransactionColor(transaction.type)}`}
                                        >
                                            {getAmountSign(transaction.type)}{formatCurrency(Number(transaction.amount))}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-on-surface-variant/30 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" />
                                </svg>
                                <p className="text-on-surface-variant/50 text-sm font-medium">
                                    No transactions yet
                                </p>
                                <p className="text-on-surface-variant/30 text-xs mt-1">
                                    Add your first transaction to get started
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Add Transaction Modal */}
                {showModal && (
                    <AddTransactionModal
                        accounts={summary.bankAccounts}
                        onClose={() => setShowModal(false)}
                        onSuccess={() => {
                            setShowModal(false);
                            fetchSummary();
                        }}
                    />
                )}
            </main>
        </>
    );
}
