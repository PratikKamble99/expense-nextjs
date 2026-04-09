"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { CreateAccountForm } from "@/components/CreateAccountForm";
import { getAccounts } from "@/actions/accounts";
import type { AccountData } from "@/actions/accounts";
import { useCurrency } from "@/contexts/CurrencyContext";

interface AccountsData {
    bankAccounts: AccountData[];
    totalBalance: number;
}

export default function AccountsPage() {
    const { data: session } = useSession();
    const { formatCurrency } = useCurrency();
    const [data, setData] = useState<AccountsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);

    useEffect(() => {
        if (session) {
            fetchAccounts();
        }
    }, [session]);

    const fetchAccounts = async () => {
        try {
            const accountsData = await getAccounts();
            setData(accountsData);
        } catch (error) {
            console.error("Failed to fetch accounts:", error);
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                                Bank Accounts
                            </h1>
                            <p className="text-xs text-on-surface-variant mt-0.5 tracking-wide">
                                Manage your bank accounts
                            </p>
                        </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-primary-gradient flex items-center justify-center text-white font-bold text-sm shadow-primary-glow">
                        {(session?.user?.name || session?.user?.email || "U")
                            .charAt(0)
                            .toUpperCase()}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Total Balance */}
                <div className="mb-10">
                    <div className="card">
                        <p className="stat-label mb-2">Total Balance</p>
                        <p className="text-4xl font-bold text-on-surface tracking-tight">
                            {formatCurrency(data.totalBalance ?? 0)}
                        </p>
                    </div>
                </div>

                {/* Accounts Grid */}
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-bold text-on-surface tracking-tight">
                            Your Accounts
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-on-surface-variant uppercase tracking-wider font-medium">
                                {data.bankAccounts?.length} accounts
                            </span>
                            <button
                                onClick={() => setShowCreateForm(true)}
                                className="btn-primary text-sm"
                            >
                                + Add Account
                            </button>
                        </div>
                    </div>
                    {data.bankAccounts?.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {data.bankAccounts?.map((account, index) => (
                                <div
                                    key={account.id}
                                    className="card-interactive group"
                                    style={{
                                        animationDelay: `${index * 80}ms`,
                                    }}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-semibold text-on-surface text-lg">
                                                {account.name}
                                            </h3>
                                            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-medium mt-1">
                                                {account.currency}
                                            </p>
                                        </div>
                                        {account.isDefault && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/12 text-primary px-2.5 py-1 rounded-lg">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-3xl font-bold text-on-surface tracking-tight">
                                        {formatCurrency(Number(account.balance))}
                                    </p>
                                    <p className="text-xs text-on-surface-variant mt-4 uppercase tracking-wider">
                                        Account ID: {account.id.slice(0, 8)}
                                        ...
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 card">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-12 h-12 text-on-surface-variant/30 mb-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <rect
                                    width="20"
                                    height="14"
                                    x="2"
                                    y="5"
                                    rx="2"
                                />
                                <line x1="2" x2="22" y1="10" y2="10" />
                            </svg>
                            <p className="text-on-surface-variant/50 text-sm font-medium">
                                No accounts yet
                            </p>
                            <p className="text-on-surface-variant/30 text-xs mt-1">
                                Add your first account to get started
                            </p>
                        </div>
                    )}
                </div>
            </main>

            {showCreateForm && (
                <CreateAccountForm
                    onClose={() => setShowCreateForm(false)}
                    onSuccess={() => {
                        setShowCreateForm(false);
                        fetchAccounts();
                    }}
                />
            )}
        </>
    );
}
