"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { CreateAccountForm } from "@/components/CreateAccountForm";
import { EditAccountForm } from "@/components/EditAccountForm";
import { getAccounts } from "@/actions/accounts";
import type { AccountData } from "@/actions/accounts";
import { useCurrency } from "@/contexts/CurrencyContext";

interface AccountsData {
    bankAccounts: AccountData[];
    totalBalance: number;
}

export default function AccountsPage() {
    const { data: session } = useSession();
    const { convertToDisplay, rates, currency } = useCurrency();
    const [data, setData] = useState<AccountsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [accountToEdit, setAccountToEdit] = useState<AccountData | null>(null);

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
                            {convertToDisplay(
                                (data.bankAccounts ?? []).reduce((sum, a) => {
                                    const fromRate = rates[a.currency] ?? 1;
                                    const toRate = rates[currency] ?? 1;
                                    return sum + a.balance * (toRate / fromRate);
                                }, 0),
                                currency
                            )}
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
                                    className="card group relative"
                                    style={{
                                        animationDelay: `${index * 80}ms`,
                                    }}
                                >
                                    {/* Edit button */}
                                    <button
                                        onClick={() => setAccountToEdit(account)}
                                        className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-200 opacity-0 group-hover:opacity-100"
                                        aria-label="Edit account"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                    </button>

                                    <div className="flex justify-between items-start mb-4 pr-10">
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
                                        {convertToDisplay(Number(account.balance), account.currency)}
                                    </p>
                                    <div className="mt-4 flex items-center gap-2">
                                        {account.bank && (
                                            <span className="text-xs text-on-surface-variant font-medium truncate">
                                                {account.bank}
                                            </span>
                                        )}
                                        {account.bank && account.lastFourDigits && (
                                            <span className="text-on-surface-variant/30 text-xs">·</span>
                                        )}
                                        {account.lastFourDigits && (
                                            <span className="text-xs text-on-surface-variant/60 font-mono tracking-wider">
                                                ···· {account.lastFourDigits}
                                            </span>
                                        )}
                                        {!account.bank && !account.lastFourDigits && (
                                            <span className="text-xs text-on-surface-variant/40 uppercase tracking-wider">
                                                {account.type ?? "Account"}
                                            </span>
                                        )}
                                    </div>
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

            {accountToEdit && (
                <EditAccountForm
                    account={accountToEdit}
                    onClose={() => setAccountToEdit(null)}
                    onSuccess={() => {
                        setAccountToEdit(null);
                        fetchAccounts();
                    }}
                />
            )}
        </>
    );
}
