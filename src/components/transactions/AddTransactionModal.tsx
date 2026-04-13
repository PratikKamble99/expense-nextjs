"use client";

import { useState } from "react";
import { createTransaction, updateTransaction } from "@/actions/transactions";
import { createAccount as createAccountAction } from "@/actions/accounts";
import type { TransactionData } from "@/actions/transactions";
import type { AccountData } from "@/actions/accounts";
import { useCurrency, SYMBOLS } from "@/contexts/CurrencyContext";

interface AddTransactionModalProps {
    accounts: AccountData[];
    onClose: () => void;
    onSuccess: () => void;
    transactionToEdit?: TransactionData | null;
    isRepeat?: boolean;
}

interface NewAccount {
    name: string;
    currency: string;
    isDefault: boolean;
}

const INCOME_CATEGORIES = ["Salary", "Freelance", "Dividend", "Gift", "Other"];

const EXPENSE_CATEGORIES = [
    "Food",
    "Transport",
    "Entertainment",
    "Housing",
    "Healthcare",
    "Shopping",
    "Other",
];

const INVESTMENT_TYPES = [
    "STOCKS",
    "CRYPTO",
    "BONDS",
    "REAL_ESTATE",
    "MUTUAL_FUND",
    "OTHER",
];

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT";
type TransferType = "BANK" | "PERSON";

const TYPE_ICONS: Record<string, React.ReactNode> = {
    INCOME: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
        </svg>
    ),
    EXPENSE: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" />
        </svg>
    ),
    TRANSFER: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8L22 12L18 16" /><path d="M2 12H22" />
        </svg>
    ),
    INVESTMENT: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" />
        </svg>
    ),
};

export function AddTransactionModal({
    accounts: initialAccounts,
    onClose,
    onSuccess,
    transactionToEdit,
    isRepeat,
}: AddTransactionModalProps) {
    const isEditing = transactionToEdit && !isRepeat;
    const { currency, convertToDisplay } = useCurrency();
    const [accounts, setAccounts] = useState(initialAccounts);
    const [type, setType] = useState<TransactionType | null>(
        (transactionToEdit?.type as TransactionType) || null,
    );
    const [transferType, setTransferType] = useState<TransferType>("BANK");
    const [fromAccountId, setFromAccountId] = useState(
        transactionToEdit?.fromAccountId || initialAccounts[0]?.id || "",
    );
    const [toAccountId, setToAccountId] = useState(
        transactionToEdit?.toAccountId || "",
    );
    const [amount, setAmount] = useState(() => {
        if (!transactionToEdit) return "";
        // Amount is stored in the account's own currency — display as-is
        return String(transactionToEdit.amount);
    });
    const [description, setDescription] = useState(
        transactionToEdit?.description || "",
    );
    const [category, setCategory] = useState(transactionToEdit?.category || "");
    const [recipientName, setRecipientName] = useState(
        transactionToEdit?.recipientName || "",
    );
    const [investmentName, setInvestmentName] = useState("");
    const [investmentType, setInvestmentType] = useState("STOCKS");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Create Account state
    const [showCreateAccount, setShowCreateAccount] = useState(false);
    const [newAccount, setNewAccount] = useState<NewAccount>({
        name: "",
        currency: currency,
        isDefault: false,
    });
    const [creatingAccount, setCreatingAccount] = useState(false);

    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAccount.name.trim()) {
            setError("Account name is required");
            return;
        }

        setError("");
        setCreatingAccount(true);

        try {
            const created = await createAccountAction(newAccount);
            setAccounts([...accounts, created]);
            setFromAccountId(created.id);
            setShowCreateAccount(false);
            setNewAccount({ name: "", currency, isDefault: false });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create account");
        } finally {
            setCreatingAccount(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            if (!type) throw new Error("Please select a transaction type");

            const payload = {
                fromAccountId,
                type,
                amount: parseFloat(amount), // stored in the account's own currency
                description: description || undefined,
                ...(type === "TRANSFER" && {
                    transferType,
                    ...(transferType === "BANK"
                        ? { toAccountId }
                        : { recipientName: recipientName || undefined, category: category || undefined }),
                }),
                ...((type === "INCOME" || type === "EXPENSE") && {
                    category: category || undefined,
                }),
                ...(type === "INVESTMENT" && { investmentName, investmentType }),
            };

            if (isEditing) {
                await updateTransaction(transactionToEdit.id, payload);
            } else {
                await createTransaction(payload);
            }

            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to ${isEditing ? "update" : "create"} transaction`);
        } finally {
            setLoading(false);
        }
    };

    // ── Create Account Sub-Modal ────────────────────────────
    if (showCreateAccount) {
        return (
            <div className="glass-overlay" onClick={() => setShowCreateAccount(false)}>
                <div
                    className="glass-modal max-w-md w-full"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="bg-surface-container-low p-6 rounded-t-2xl flex justify-between items-center">
                        <h2 className="text-lg font-bold text-on-surface tracking-tight">
                            Create Bank Account
                        </h2>
                        <button
                            onClick={() => setShowCreateAccount(false)}
                            className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-200"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
                            </svg>
                        </button>
                    </div>

                    {/* Form */}
                    <form
                        onSubmit={handleCreateAccount}
                        className="p-6 space-y-5"
                    >
                        {error && (
                            <div className="p-4 bg-error/10 rounded-xl animate-fade-in">
                                <p className="text-error text-sm font-medium">
                                    {error}
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="label">Account Name</label>
                            <input
                                type="text"
                                value={newAccount.name}
                                onChange={(e) =>
                                    setNewAccount({
                                        ...newAccount,
                                        name: e.target.value,
                                    })
                                }
                                placeholder="e.g., Checking, Savings"
                                className="input"
                                required
                            />
                        </div>

                        <div>
                            <label className="label">Currency</label>
                            <select
                                value={newAccount.currency}
                                onChange={(e) =>
                                    setNewAccount({
                                        ...newAccount,
                                        currency: e.target.value,
                                    })
                                }
                                className="input"
                            >
                                <option value="USD">USD — US Dollar</option>
                                <option value="EUR">EUR — Euro</option>
                                <option value="GBP">GBP — British Pound</option>
                                <option value="INR">INR — Indian Rupee</option>
                                <option value="JPY">JPY — Japanese Yen</option>
                                <option value="CAD">CAD — Canadian Dollar</option>
                                <option value="AUD">AUD — Australian Dollar</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    id="isDefault"
                                    checked={newAccount.isDefault}
                                    onChange={(e) =>
                                        setNewAccount({
                                            ...newAccount,
                                            isDefault: e.target.checked,
                                        })
                                    }
                                    className="w-4 h-4 rounded bg-surface-container-highest border-line-subtle/30 text-primary focus:ring-primary/30 focus:ring-offset-0"
                                />
                            </div>
                            <label
                                htmlFor="isDefault"
                                className="text-sm text-on-surface-variant cursor-pointer"
                            >
                                Set as default account
                            </label>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCreateAccount(false)}
                                className="flex-1 btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex-1 btn-primary"
                                disabled={creatingAccount}
                            >
                                {creatingAccount
                                    ? "Creating..."
                                    : "Create Account"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // ── Main Transaction Modal ──────────────────────────────
    return (
        <div className="glass-overlay" onClick={onClose}>
            <div
                className="glass-modal max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-surface-container-low/95 backdrop-blur-lg p-6 rounded-t-2xl flex justify-between items-center z-10">
                    <div>
                        <h2 className="text-lg font-bold text-on-surface tracking-tight">
                            {isEditing ? "Edit Transaction" : "Add Transaction"}
                        </h2>
                        {type && (
                            <p className="text-xs text-on-surface-variant mt-0.5">
                                {type.charAt(0) + type.slice(1).toLowerCase()} transaction
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-200"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                        <div className="p-4 bg-error/10 rounded-xl animate-fade-in">
                            <p className="text-error text-sm font-medium">
                                {error}
                            </p>
                        </div>
                    )}

                    {/* Type Selection */}
                    {!type ? (
                        <div className="animate-fade-in">
                            <label className="label">Select Transaction Type</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {(
                                    [
                                        "INCOME",
                                        "EXPENSE",
                                        "TRANSFER",
                                        "INVESTMENT",
                                    ] as TransactionType[]
                                ).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => {
                                            setType(t);
                                            if (t !== "TRANSFER") {
                                                setTransferType("BANK");
                                            }
                                        }}
                                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all duration-200 group"
                                    >
                                        <span className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all duration-200">
                                            {TYPE_ICONS[t]}
                                        </span>
                                        <span className="text-xs font-semibold uppercase tracking-wider">
                                            {t}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setType(null)}
                            className="flex items-center gap-2 text-sm text-primary hover:text-primary-dim font-medium transition-colors group"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Change Type
                        </button>
                    )}

                    {type && (
                        <div className="space-y-5 animate-fade-in">
                            {/* Transfer Type Selection */}
                            {type === "TRANSFER" && (
                                <div>
                                    <label className="label">
                                        Transfer Type
                                    </label>
                                    <div className="flex gap-3">
                                        {(["BANK", "PERSON"] as TransferType[]).map((tt) => (
                                            <button
                                                key={tt}
                                                type="button"
                                                onClick={() =>
                                                    setTransferType(tt)
                                                }
                                                className={
                                                    transferType === tt
                                                        ? "type-pill-active"
                                                        : "type-pill-inactive"
                                                }
                                            >
                                                {tt === "BANK"
                                                    ? "Bank Account"
                                                    : "Person"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* From Account */}
                            <div>
                                <label className="label">From Account</label>
                                <div className="flex gap-2">
                                    <select
                                        value={fromAccountId}
                                        onChange={(e) =>
                                            setFromAccountId(e.target.value)
                                        }
                                        className="input flex-1"
                                        required
                                    >
                                        {accounts.map((acc) => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.name} ({convertToDisplay(Number(acc.balance), acc.currency)})
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowCreateAccount(true)
                                        }
                                        className="btn-outline px-3"
                                        title="Create new bank account"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* To Account (for Bank Transfer) */}
                            {type === "TRANSFER" && transferType === "BANK" && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="label mb-0">
                                            To Account
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowCreateAccount(true)
                                            }
                                            className="text-xs text-primary hover:text-primary-dim font-medium transition-colors"
                                        >
                                            + Create Account
                                        </button>
                                    </div>
                                    <select
                                        value={toAccountId}
                                        onChange={(e) =>
                                            setToAccountId(e.target.value)
                                        }
                                        className="input"
                                        required
                                    >
                                        <option value="">Select account</option>
                                        {accounts
                                            .filter(
                                                (acc) =>
                                                    acc.id !== fromAccountId,
                                            )
                                            .map((acc) => (
                                                <option
                                                    key={acc.id}
                                                    value={acc.id}
                                                >
                                                    {acc.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            )}

                            {/* Recipient Name (for Person Transfer) */}
                            {type === "TRANSFER" &&
                                transferType === "PERSON" && (
                                    <div>
                                        <label className="label">
                                            Recipient Name
                                        </label>
                                        <input
                                            type="text"
                                            value={recipientName}
                                            onChange={(e) =>
                                                setRecipientName(e.target.value)
                                            }
                                            placeholder="John Doe"
                                            className="input"
                                        />
                                    </div>
                                )}

                            {/* Amount */}
                            <div>
                                <label className="label">Amount</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-medium">
                                        {SYMBOLS[accounts.find(a => a.id === fromAccountId)?.currency ?? ""] ?? accounts.find(a => a.id === fromAccountId)?.currency ?? "$"}
                                    </span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="input pl-8 text-lg font-semibold tabular-nums"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="label">Description</label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    placeholder="What's this for?"
                                    className="input"
                                />
                            </div>

                            {/* Category Pills */}
                            {(type === "INCOME" ||
                                type === "EXPENSE" ||
                                (type === "TRANSFER" &&
                                    transferType === "PERSON")) && (
                                <div>
                                    <label className="label">Category</label>
                                    <div className="flex flex-wrap gap-2">
                                        {(type === "INCOME"
                                            ? INCOME_CATEGORIES
                                            : EXPENSE_CATEGORIES
                                        ).map((cat) => (
                                            <button
                                                key={cat}
                                                type="button"
                                                onClick={() => setCategory(cat)}
                                                className={
                                                    category === cat
                                                        ? "category-pill-active"
                                                        : "category-pill-inactive"
                                                }
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Investment Details */}
                            {type === "INVESTMENT" && (
                                <>
                                    <div>
                                        <label className="label">
                                            Investment Name
                                        </label>
                                        <input
                                            type="text"
                                            value={investmentName}
                                            onChange={(e) =>
                                                setInvestmentName(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="e.g., Apple Stock"
                                            className="input"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="label">
                                            Investment Type
                                        </label>
                                        <select
                                            value={investmentType}
                                            onChange={(e) =>
                                                setInvestmentType(
                                                    e.target.value,
                                                )
                                            }
                                            className="input"
                                            required
                                        >
                                            {INVESTMENT_TYPES.map((type) => (
                                                <option key={type} value={type}>
                                                    {type.replace(/_/g, " ")}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}

                            {/* Submit */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 btn-primary"
                                    disabled={loading}
                                >
                                    {loading
                                        ? isEditing
                                            ? "Updating..."
                                            : "Creating..."
                                        : isEditing
                                            ? "Update Transaction"
                                            : "Create Transaction"}
                                </button>
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
