"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { AddTransactionModal } from "@/components/transactions/AddTransactionModal";
import { getTransactionsWithAccounts } from "@/actions/transactions";
import type { TransactionData } from "@/actions/transactions";
import type { AccountData } from "@/actions/accounts";
import { useCurrency } from "@/contexts/CurrencyContext";

interface TransactionsData {
    transactions: TransactionData[];
    totalCount: number;
    bankAccounts: AccountData[];
}

export default function TransactionsPage() {
    const { data: session } = useSession();
    const { convertToDisplay } = useCurrency();
    const [data, setData] = useState<TransactionsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>("ALL");
    const [fromDate, setFromDate] = useState<string>("");
    const [toDate, setToDate] = useState<string>("");
    const [showModal, setShowModal] = useState(false);
    const [transactionToEdit, setTransactionToEdit] = useState<TransactionData | null>(null);
    const [isRepeat, setIsRepeat] = useState(false);

    useEffect(() => {
        if (session) {
            fetchTransactions();
        }
    }, [session]);

    const fetchTransactions = async () => {
        try {
            const result = await getTransactionsWithAccounts();
            setData({
                transactions: result.transactions,
                totalCount: result.transactions.length,
                bankAccounts: result.bankAccounts,
            });
        } catch (error) {
            console.error("Failed to fetch transactions:", error);
        } finally {
            setLoading(false);
        }
    };

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

    const getTransactionIcon = (type: string) => {
        switch (type) {
            case "INCOME":
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" x2="12" y1="5" y2="19" />
                        <polyline points="19 12 12 19 5 12" />
                    </svg>
                );
            case "EXPENSE":
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" x2="12" y1="19" y2="5" />
                        <polyline points="5 12 12 5 19 12" />
                    </svg>
                );
            case "TRANSFER":
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="8" x2="21" y1="6" y2="6" />
                        <line x1="8" x2="21" y1="12" y2="12" />
                        <line x1="8" x2="21" y1="18" y2="18" />
                        <line x1="3" x2="7" y1="6" y2="6" />
                        <line x1="3" x2="7" y1="12" y2="12" />
                        <line x1="3" x2="7" y1="18" y2="18" />
                    </svg>
                );
            case "INVESTMENT":
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 10" />
                        <line x1="1" x2="23" y1="6" y2="6" />
                        <path d="M12 2v4" />
                        <rect x="9" y="9" width="6" height="6" />
                    </svg>
                );
            default:
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-on-surface-variant" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="1" />
                    </svg>
                );
        }
    };

    const filteredTransactions = (data?.transactions || []).filter((tx) => {
        const typeMatch = filterType === "ALL" || tx.type === filterType;
        if (!typeMatch) return false;

        if (fromDate) {
            const txDate = new Date(tx.createdAt);
            const fromDateObj = new Date(fromDate);
            if (txDate < fromDateObj) return false;
        }

        if (toDate) {
            const txDate = new Date(tx.createdAt);
            const toDateObj = new Date(toDate);
            toDateObj.setHours(23, 59, 59, 999);
            if (txDate > toDateObj) return false;
        }

        return true;
    });

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
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="shimmer h-16 rounded-lg" />
                        ))}
                    </div>
                </main>
            </>
        );
    }

    if (!data) {
        return null;
    }

    return (
        <>
            {/* Header */}
            <header className="sticky top-0 z-10 bg-surface-container-low border-b border-line-subtle/10">
                <div className="px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <MobileMenuButton />
                        <div className="hidden md:block">
                            <h1 className="text-xl font-bold text-on-surface tracking-tight">
                                All Transactions
                            </h1>
                            <p className="text-xs text-on-surface-variant mt-0.5 tracking-wide">
                                View and manage all your transactions
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowModal(true)}
                            className="btn-primary hidden sm:inline-flex"
                        >
                            + Add Transaction
                        </button>
                        <div className="w-9 h-9 rounded-full bg-primary-gradient flex items-center justify-center text-white font-bold text-sm shadow-primary-glow">
                            {(session?.user?.name || session?.user?.email || "U")
                                .charAt(0)
                                .toUpperCase()}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Filter Tabs */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-on-surface uppercase tracking-wider">
                            Filter by Type
                        </h2>
                        <span className="text-xs text-on-surface-variant">
                            {filteredTransactions.length} transactions
                        </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {["ALL", "INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"].map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={
                                    filterType === type
                                        ? "type-pill-active"
                                        : "type-pill-inactive"
                                }
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Date Range Filter */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-on-surface uppercase tracking-wider mb-4">
                        Filter by Date
                    </h2>
                    <div className="flex gap-4 flex-col sm:flex-row">
                        <div className="flex-1">
                            <label className="label">From Date</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="input"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="label">To Date</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="input"
                            />
                        </div>
                        {(fromDate || toDate) && (
                            <div className="flex items-end">
                                <button
                                    onClick={() => {
                                        setFromDate("");
                                        setToDate("");
                                    }}
                                    className="btn-secondary"
                                >
                                    Clear Dates
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Transactions List */}
                <div className="bg-surface-container-low rounded-2xl overflow-hidden">
                    {filteredTransactions.length > 0 ? (
                        <div>
                            {filteredTransactions.map((transaction, index) => (
                                <div
                                    key={transaction.id}
                                    className="flex justify-between items-center px-6 py-4 bg-surface-container hover:bg-surface-container-high transition-all duration-200 cursor-pointer"
                                    style={{
                                        borderBottom:
                                            index < filteredTransactions.length - 1
                                                ? "1px solid #45484F"
                                                : "none",
                                    }}
                                >
                                    <div className="flex items-start gap-4 flex-1 min-w-0">
                                        <div className="shrink-0 mt-0.5">
                                            {getTransactionIcon(transaction.type)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-on-surface text-sm truncate">
                                                {transaction.description ||
                                                    transaction.recipientName ||
                                                    transaction.type}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                {transaction.category && (
                                                    <span className="text-xs text-on-surface-variant bg-surface-container-high px-2.5 py-1 rounded-full">
                                                        {transaction.category}
                                                    </span>
                                                )}
                                                <span className="text-xs text-on-surface-variant/60">
                                                    {new Date(transaction.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <p className={`text-base font-semibold tabular-nums ${getTransactionColor(transaction.type)}`}>
                                            {getAmountSign(transaction.type)}{convertToDisplay(Number(transaction.amount), transaction.fromAccountCurrency)}
                                        </p>
                                        {transaction.recipientName && (
                                            <p className="text-xs text-on-surface-variant/60">
                                                {transaction.recipientName}
                                            </p>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setTransactionToEdit(transaction);
                                                    setIsRepeat(false);
                                                    setShowModal(true);
                                                }}
                                                className="text-xs px-2.5 py-1 rounded-lg bg-primary/12 text-primary hover:bg-primary/20 transition-colors"
                                                title="Edit transaction"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setTransactionToEdit(transaction);
                                                    setIsRepeat(true);
                                                    setShowModal(true);
                                                }}
                                                className="text-xs px-2.5 py-1 rounded-lg bg-tertiary/12 text-tertiary hover:bg-tertiary/20 transition-colors"
                                                title="Repeat transaction"
                                            >
                                                Repeat
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-on-surface-variant/30 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" x2="8" y1="13" y2="13" />
                                <line x1="16" x2="8" y1="17" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                            </svg>
                            <p className="text-on-surface-variant/50 text-sm font-medium">
                                No transactions found
                            </p>
                            <p className="text-on-surface-variant/30 text-xs mt-1">
                                Try adjusting your filters
                            </p>
                        </div>
                    )}
                </div>
            </main>

            {showModal && (
                <AddTransactionModal
                    accounts={data?.bankAccounts || []}
                    onClose={() => {
                        setShowModal(false);
                        setTransactionToEdit(null);
                        setIsRepeat(false);
                    }}
                    onSuccess={() => {
                        setShowModal(false);
                        setTransactionToEdit(null);
                        setIsRepeat(false);
                        fetchTransactions();
                    }}
                    transactionToEdit={transactionToEdit}
                    isRepeat={isRepeat}
                />
            )}
        </>
    );
}
