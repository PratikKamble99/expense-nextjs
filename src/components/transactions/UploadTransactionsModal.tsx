"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { bulkCreateTransactions } from "@/actions/transactions";
import type { TransactionInput } from "@/actions/transactions";
import type { AccountData } from "@/actions/accounts";
import type { RawTransaction, TransferPair, DetectionResult } from "@/lib/transfer-detector";
import type { DbCandidate } from "@/app/api/statements/detect/route";

interface ParsedTransactionAI {
    date: string;
    description: string;
    amount: number;
    type: "DEBIT" | "CREDIT";
    referenceNumber?: string;
}

interface UploadTransactionsModalProps {
    accounts: AccountData[];
    onClose: () => void;
    onSuccess: () => void;
}

interface ParsedRow {
    rowIndex: number;
    input: TransactionInput | null;
    errors: string[];
    raw: Record<string, string>;
}

// A file slot in the multi-file upload step
interface FileSlot {
    id: string;
    file: File | null;
    accountId: string;
    parsedRows: ParsedRow[];
    rawTransactions: RawTransaction[];
    dragOver: boolean;
    parseError: string | null;
    parsing: boolean; // true while AI is parsing this slot's file
}

type ImportMode = "csv" | "ai";

type Step = "upload" | "preview" | "transfers" | "done";

const VALID_TYPES = ["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"] as const;
const VALID_TRANSFER_TYPES = ["BANK", "PERSON"] as const;

const TEMPLATE_HEADERS = [
    "date",
    "type",
    "amount",
    "account",
    "description",
    "category",
    "transferType",
    "toAccount",
    "recipientName",
];

const TEMPLATE_ROWS = [
    ["2024-01-15", "EXPENSE", "50.00", "My Account", "Grocery shopping", "Food", "", "", ""],
    ["2024-01-16", "INCOME", "1000.00", "My Account", "Monthly salary", "Salary", "", "", ""],
    ["2024-01-17", "TRANSFER", "200.00", "My Account", "", "", "BANK", "Savings Account", ""],
    ["2024-01-18", "TRANSFER", "100.00", "My Account", "Send to friend", "", "PERSON", "", "John Doe"],
    ["2024-01-19", "INVESTMENT", "500.00", "My Account", "Buy AAPL", "", "", "", ""],
];

function buildTemplateCSV(): string {
    const rows = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS];
    return rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
}

// Map a ParsedRow to a RawTransaction for transfer detection.
// INCOME → CREDIT, everything else → DEBIT.
function toRawTransaction(row: ParsedRow, sourceAccountId: string): RawTransaction | null {
    if (!row.input || !row.input.date) return null;
    const type: "DEBIT" | "CREDIT" =
        row.input.type === "INCOME" ? "CREDIT" : "DEBIT";
    return {
        tempId: row.input.date + "_" + row.rowIndex + "_" + row.input.amount + "_" + sourceAccountId,
        sourceAccountId,
        date: new Date(row.input.date),
        description: row.input.description ?? "",
        amount: row.input.amount,
        type,
        referenceNumber: undefined,
    };
}

const MAX_SLOTS = 3;

function emptySlot(id: string): FileSlot {
    return { id, file: null, accountId: "", parsedRows: [], rawTransactions: [], dragOver: false, parseError: null, parsing: false };
}

export function UploadTransactionsModal({
    accounts,
    onClose,
    onSuccess,
}: UploadTransactionsModalProps) {
    const [step, setStep] = useState<Step>("upload");
    const [importMode, setImportMode] = useState<ImportMode>("csv");
    const [slots, setSlots] = useState<FileSlot[]>([emptySlot("slot-0")]);
    // Keep a ref so AI parse callbacks can read current slot state without stale closures
    const slotsRef = useRef(slots);
    slotsRef.current = slots;
    const [submitting, setSubmitting] = useState(false);
    const [uploadResult, setUploadResult] = useState<{
        succeeded: number;
        failed: Array<{ index: number; error: string }>;
    } | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);

    // Transfers step state
    const [importId, setImportId] = useState<string | null>(null);
    const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
    const [confirmedPairs, setConfirmedPairs] = useState<Set<string>>(new Set());   // debitTempId of accepted pairs
    const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set()); // debitTempId of dismissed pairs
    const [skippedTempIds, setSkippedTempIds] = useState<Set<string>>(new Set());  // clean txs the user unchecked
    const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());
    const [confirmResult, setConfirmResult] = useState<{ imported: number; transfersCreated: number; skipped: number } | null>(null);
    // DB cross-import candidates: unmatched IMPS/NEFT txs that found a counterpart already in the DB
    const [dbCandidates, setDbCandidates] = useState<DbCandidate[]>([]);
    const [confirmedDbLinks, setConfirmedDbLinks] = useState<Set<string>>(new Set()); // tempIds confirmed as transfers
    const [dismissedDbLinks, setDismissedDbLinks] = useState<Set<string>>(new Set()); // tempIds dismissed

    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const accountsByName = useMemo(() => {
        const map = new Map<string, string>();
        for (const a of accounts) {
            map.set(a.name.toLowerCase().trim(), a.id);
        }
        return map;
    }, [accounts]);

    const processRows = useCallback(
        (rawRows: string[][], sourceAccountId: string): { parsed: ParsedRow[]; rawTxs: RawTransaction[] } => {
            if (rawRows.length < 2) return { parsed: [], rawTxs: [] };

            const headers = rawRows[0].map((h) =>
                String(h ?? "").toLowerCase().trim(),
            );
            const col = (name: string) => headers.indexOf(name);

            const parsed = rawRows
                .slice(1)
                .filter((row) => row.some((cell) => String(cell ?? "").trim()))
                .map((row, i) => {
                    const get = (name: string): string => {
                        const idx = col(name);
                        return idx >= 0 ? String(row[idx] ?? "").trim() : "";
                    };

                    const raw: Record<string, string> = {};
                    for (const h of TEMPLATE_HEADERS) raw[h] = get(h);

                    const errors: string[] = [];

                    const dateStr = get("date");
                    if (!dateStr) errors.push("date is required");
                    else if (isNaN(Date.parse(dateStr)))
                        errors.push(`invalid date: "${dateStr}"`);

                    const typeRaw = get("type").toUpperCase();
                    if (!typeRaw) errors.push("type is required");
                    else if (
                        !VALID_TYPES.includes(
                            typeRaw as (typeof VALID_TYPES)[number],
                        )
                    )
                        errors.push(
                            `type must be one of: ${VALID_TYPES.join(", ")}`,
                        );

                    const amountStr = get("amount");
                    const amount = parseFloat(amountStr);
                    if (!amountStr) errors.push("amount is required");
                    else if (isNaN(amount) || amount <= 0)
                        errors.push("amount must be a positive number");

                    // Account: prefer the dropdown sourceAccountId, fall back to CSV column
                    let fromAccountId: string | undefined = sourceAccountId || undefined;
                    const accountName = get("account");
                    if (!fromAccountId) {
                        if (!accountName) errors.push("account is required");
                        else {
                            const id = accountsByName.get(accountName.toLowerCase());
                            if (!id) errors.push(`account not found: "${accountName}"`);
                            else fromAccountId = id;
                        }
                    }

                    let toAccountId: string | undefined;
                    let transferType: "BANK" | "PERSON" | undefined;

                    if (typeRaw === "TRANSFER") {
                        const ttRaw = get("transferType").toUpperCase();
                        if (!ttRaw) {
                            errors.push(
                                "transferType is required for TRANSFER (BANK or PERSON)",
                            );
                        } else if (
                            !VALID_TRANSFER_TYPES.includes(
                                ttRaw as (typeof VALID_TRANSFER_TYPES)[number],
                            )
                        ) {
                            errors.push("transferType must be BANK or PERSON");
                        } else {
                            transferType = ttRaw as "BANK" | "PERSON";
                            if (ttRaw === "BANK") {
                                const toName = get("toAccount");
                                if (!toName) {
                                    errors.push(
                                        "toAccount is required for BANK transfers",
                                    );
                                } else {
                                    const toId = accountsByName.get(
                                        toName.toLowerCase(),
                                    );
                                    if (!toId)
                                        errors.push(
                                            `toAccount not found: "${toName}"`,
                                        );
                                    else toAccountId = toId;
                                }
                            }
                        }
                    }

                    if (errors.length > 0) {
                        return { rowIndex: i + 2, input: null, errors, raw };
                    }

                    return {
                        rowIndex: i + 2,
                        errors: [],
                        raw,
                        input: {
                            fromAccountId: fromAccountId!,
                            type: typeRaw as TransactionInput["type"],
                            amount,
                            date: dateStr,
                            description: get("description") || undefined,
                            category: get("category") || undefined,
                            recipientName: get("recipientName") || undefined,
                            transferType,
                            toAccountId,
                        },
                    };
                });

            const rawTxs: RawTransaction[] = parsed
                .map((row) => {
                    const tx = toRawTransaction(row, sourceAccountId);
                    if (!tx) return null;
                    // Assign stable tempId using crypto
                    tx.tempId = typeof crypto !== "undefined" && crypto.randomUUID
                        ? crypto.randomUUID()
                        : `${sourceAccountId}_${row.rowIndex}_${Date.now()}`;
                    return tx;
                })
                .filter((t): t is RawTransaction => t !== null);

            return { parsed, rawTxs };
        },
        [accountsByName],
    );

    const handleFileForSlot = useCallback(
        async (slotId: string, file: File) => {
            const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
            if (!["csv", "xlsx", "xls"].includes(ext)) {
                setSlots((prev) =>
                    prev.map((s) =>
                        s.id === slotId
                            ? { ...s, parseError: "Please upload a .csv, .xlsx, or .xls file" }
                            : s,
                    ),
                );
                return;
            }

            try {
                const buffer = await file.arrayBuffer();
                const XLSX = await import("xlsx");
                const bytes = new Uint8Array(buffer);
                const workbook = XLSX.read(bytes, { type: "array" });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
                    header: 1,
                    raw: false,
                    dateNF: "yyyy-mm-dd",
                    defval: "",
                });

                setSlots((prev) => {
                    const slot = prev.find((s) => s.id === slotId);
                    const sourceAccountId = slot?.accountId ?? "";
                    const { parsed, rawTxs } = processRows(rawRows, sourceAccountId);
                    return prev.map((s) =>
                        s.id === slotId
                            ? { ...s, file, parsedRows: parsed, rawTransactions: rawTxs, parseError: null }
                            : s,
                    );
                });
            } catch (err) {
                setSlots((prev) =>
                    prev.map((s) =>
                        s.id === slotId
                            ? {
                                  ...s,
                                  parseError: `Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`,
                              }
                            : s,
                    ),
                );
            }
        },
        [processRows],
    );

    // Re-process rows when account dropdown changes for a slot
    const handleAccountChange = (slotId: string, accountId: string) => {
        setSlots((prev) =>
            prev.map((s) => {
                if (s.id !== slotId) return s;
                if (!s.file || s.parsedRows.length === 0) return { ...s, accountId };
                // Re-assign sourceAccountId to existing raw transactions (works for both CSV and AI mode)
                const updated: RawTransaction[] = s.rawTransactions.map((t) => ({
                    ...t,
                    sourceAccountId: accountId,
                }));
                const updatedParsed: ParsedRow[] = s.parsedRows.map((row) => {
                    if (!row.input) return row;
                    return { ...row, input: { ...row.input, fromAccountId: accountId } };
                });
                return { ...s, accountId, parsedRows: updatedParsed, rawTransactions: updated };
            }),
        );
    };

    const addSlot = () => {
        if (slots.length >= MAX_SLOTS) return;
        setSlots((prev) => [...prev, emptySlot(`slot-${prev.length}`)]);
    };

    const removeSlot = (slotId: string) => {
        setSlots((prev) => prev.filter((s) => s.id !== slotId));
    };

    const handleModeChange = (mode: ImportMode) => {
        setImportMode(mode);
        setSlots([emptySlot("slot-0")]);
        setParseError(null);
    };

    const handleAiParseForSlot = useCallback(
        async (slotId: string, file: File) => {
            const slot = slotsRef.current.find((s) => s.id === slotId);
            if (!slot) return;

            if (!slot.accountId) {
                setSlots((prev) =>
                    prev.map((s) =>
                        s.id === slotId
                            ? { ...s, parseError: "Select an account before uploading the statement." }
                            : s,
                    ),
                );
                return;
            }

            // Mark slot as parsing
            setSlots((prev) =>
                prev.map((s) =>
                    s.id === slotId
                        ? { ...s, file, parsing: true, parseError: null, parsedRows: [], rawTransactions: [] }
                        : s,
                ),
            );

            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("accountId", slot.accountId);

                const res = await fetch("/api/statements/parse", {
                    method: "POST",
                    body: formData,
                });

                const data = (await res.json()) as {
                    transactions?: ParsedTransactionAI[];
                    error?: string;
                };

                if (!res.ok) throw new Error(data.error ?? "AI parse failed");

                const txs = data.transactions ?? [];
                // Find the account name at call time via slotsRef for the raw display
                const currentSlot = slotsRef.current.find((s) => s.id === slotId);
                const acctId = currentSlot?.accountId ?? slot.accountId;

                const parsedRows: ParsedRow[] = txs.map((t, i) => ({
                    rowIndex: i + 1,
                    input: {
                        fromAccountId: acctId,
                        type: (t.type === "CREDIT" ? "INCOME" : "EXPENSE") as TransactionInput["type"],
                        amount: t.amount,
                        date: t.date,
                        description: t.description || undefined,
                    },
                    errors: [],
                    raw: {
                        date: t.date,
                        type: t.type === "CREDIT" ? "INCOME" : "EXPENSE",
                        amount: String(t.amount),
                        account: "",
                        description: t.description ?? "",
                        category: "",
                        transferType: "",
                        toAccount: "",
                        recipientName: "",
                    },
                }));

                const rawTxs: RawTransaction[] = txs.map((t) => ({
                    tempId:
                        typeof crypto !== "undefined" && crypto.randomUUID
                            ? crypto.randomUUID()
                            : `${acctId}_${t.date}_${t.amount}_${Math.random()}`,
                    sourceAccountId: acctId,
                    date: new Date(t.date),
                    description: t.description ?? "",
                    amount: t.amount,
                    type: t.type,
                    referenceNumber: t.referenceNumber,
                }));

                setSlots((prev) =>
                    prev.map((s) =>
                        s.id === slotId
                            ? {
                                  ...s,
                                  file,
                                  parsedRows,
                                  rawTransactions: rawTxs,
                                  parsing: false,
                                  parseError: null,
                              }
                            : s,
                    ),
                );
            } catch (err) {
                setSlots((prev) =>
                    prev.map((s) =>
                        s.id === slotId
                            ? {
                                  ...s,
                                  parsing: false,
                                  parseError:
                                      err instanceof Error ? err.message : "AI parse failed",
                              }
                            : s,
                    ),
                );
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    // All parsed rows across all slots (for preview step)
    const allParsedRows = useMemo(() => slots.flatMap((s) => s.parsedRows), [slots]);
    const allRawTxs = useMemo(() => slots.flatMap((s) => s.rawTransactions), [slots]);
    const validCount = allParsedRows.filter((r) => r.input !== null).length;
    const errorCount = allParsedRows.filter((r) => r.errors.length > 0).length;

    const downloadTemplate = () => {
        const csv = buildTemplateCSV();
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "transactions-template.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ── Step: upload → preview ────────────────────────────────────────────────

    const goToPreview = () => {
        if (allParsedRows.length === 0) return;
        setStep("preview");
    };

    // ── Step: preview → transfers (detect) ───────────────────────────────────

    const goToTransfers = useCallback(async () => {
        if (allRawTxs.length === 0) {
            // No raw transactions — skip detection and go straight to classic import
            await handleClassicSubmit();
            return;
        }

        setSubmitting(true);
        setParseError(null);
        try {
            // Check for duplicates first
            const dupBody = {
                transactions: allRawTxs.map((t) => ({
                    accountId: t.sourceAccountId,
                    date: t.date.toISOString(),
                    amount: t.amount,
                })),
            };
            const dupRes = await fetch("/api/statements/check-duplicates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dupBody),
            });
            const dupData = (await dupRes.json()) as { duplicateKeys?: string[]; error?: string };
            if (dupData.duplicateKeys) {
                setDuplicateKeys(new Set(dupData.duplicateKeys));
                // Pre-skip duplicates
                const autoSkipped = new Set<string>();
                for (const t of allRawTxs) {
                    const dateStr = t.date.toISOString().slice(0, 10);
                    const key = `${t.sourceAccountId}_${dateStr}_${t.amount}`;
                    if (dupData.duplicateKeys.includes(key)) autoSkipped.add(t.tempId);
                }
                setSkippedTempIds(autoSkipped);
            }

            // Run transfer detection
            const detectRes = await fetch("/api/statements/detect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transactions: allRawTxs.map((t) => ({ ...t, date: t.date.toISOString() })) }),
            });
            const detectData = (await detectRes.json()) as {
                importId?: string;
                result?: DetectionResult;
                dbCandidates?: DbCandidate[];
                error?: string;
            };
            if (!detectRes.ok || !detectData.importId || !detectData.result) {
                throw new Error(detectData.error ?? "Detection failed");
            }

            setImportId(detectData.importId);
            setDetectionResult(detectData.result);
            // Default: all auto-matched pairs (confidence >= 0.85) confirmed
            const autoConfirmed = new Set<string>();
            for (const pair of detectData.result.transferPairs) {
                if (!pair.needsReview) autoConfirmed.add(pair.debitTempId);
            }
            setConfirmedPairs(autoConfirmed);
            setDismissedPairs(new Set());

            const candidates = detectData.dbCandidates ?? [];
            setDbCandidates(candidates);
            // Default: all DB candidates auto-confirmed (high confidence)
            setConfirmedDbLinks(new Set(candidates.map((c) => c.tempId)));
            setDismissedDbLinks(new Set());

            setStep("transfers");
        } catch (err) {
            setParseError(err instanceof Error ? err.message : "Detection failed");
        } finally {
            setSubmitting(false);
        }
    }, [allRawTxs]);

    // ── Classic submit (no bank-statement flow) ───────────────────────────────

    const handleClassicSubmit = async () => {
        const validRows = allParsedRows.filter((r) => r.input !== null);
        if (!validRows.length) return;

        setSubmitting(true);
        setParseError(null);
        try {
            const result = await bulkCreateTransactions(
                validRows.map((r) => r.input!),
            );
            setUploadResult(result);
            setStep("done");
        } catch (err) {
            setParseError(
                err instanceof Error ? err.message : "Upload failed",
            );
        } finally {
            setSubmitting(false);
        }
    };

    // ── Step: transfers → confirm & import ───────────────────────────────────

    const handleConfirmImport = async () => {
        if (!importId || !detectionResult) return;
        setSubmitting(true);
        setParseError(null);
        try {
            const finalConfirmedPairs = detectionResult.transferPairs.filter(
                (p) => confirmedPairs.has(p.debitTempId),
            );
            const dismissedList = detectionResult.transferPairs
                .filter((p) => dismissedPairs.has(p.debitTempId))
                .map((p) => p.debitTempId);

            const confirmedDbCandidateLinks = dbCandidates
                .filter((c) => confirmedDbLinks.has(c.tempId))
                .map((c) => ({ tempId: c.tempId, existingTxId: c.existingTxId }));

            const res = await fetch("/api/statements/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    importId,
                    confirmedPairs: finalConfirmedPairs,
                    dismissedPairIds: [...skippedTempIds, ...dismissedList],
                    transactions: allRawTxs.map((t) => ({ ...t, date: t.date.toISOString() })),
                    dbCandidateLinks: confirmedDbCandidateLinks,
                }),
            });
            const data = (await res.json()) as {
                imported?: number;
                transfersCreated?: number;
                skipped?: number;
                error?: string;
            };
            if (!res.ok) throw new Error(data.error ?? "Import failed");
            setConfirmResult({
                imported: data.imported ?? 0,
                transfersCreated: data.transfersCreated ?? 0,
                skipped: data.skipped ?? 0,
            });
            setStep("done");
        } catch (err) {
            setParseError(err instanceof Error ? err.message : "Import failed");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Transfer step helpers ─────────────────────────────────────────────────

    const togglePairConfirmed = (debitTempId: string) => {
        if (confirmedPairs.has(debitTempId)) {
            setConfirmedPairs((prev) => { const n = new Set(prev); n.delete(debitTempId); return n; });
            setDismissedPairs((prev) => new Set([...prev, debitTempId]));
        } else {
            setDismissedPairs((prev) => { const n = new Set(prev); n.delete(debitTempId); return n; });
            setConfirmedPairs((prev) => new Set([...prev, debitTempId]));
        }
    };

    const toggleTxSkipped = (tempId: string) => {
        setSkippedTempIds((prev) => {
            const n = new Set(prev);
            if (n.has(tempId)) n.delete(tempId);
            else n.add(tempId);
            return n;
        });
    };

    const getAccountName = (id: string) =>
        accounts.find((a) => a.id === id)?.name ?? id;

    const isDuplicate = (tx: RawTransaction) => {
        const dateStr = tx.date.toISOString().slice(0, 10);
        return duplicateKeys.has(`${tx.sourceAccountId}_${dateStr}_${tx.amount}`);
    };

    // tempIds from ALL transfer pairs (confirmed or not) — these are greyed out in the table
    const allPairedTempIds = useMemo(() => {
        if (!detectionResult) return new Set<string>();
        const s = new Set<string>();
        for (const p of detectionResult.transferPairs) {
            s.add(p.debitTempId);
            s.add(p.creditTempId);
        }
        return s;
    }, [detectionResult]);

    const confirmedPairedTempIds = useMemo(() => {
        if (!detectionResult) return new Set<string>();
        const s = new Set<string>();
        for (const p of detectionResult.transferPairs) {
            if (confirmedPairs.has(p.debitTempId)) {
                s.add(p.debitTempId);
                s.add(p.creditTempId);
            }
        }
        // Also mark DB-linked tempIds as paired so they appear greyed out in the table
        for (const tempId of confirmedDbLinks) {
            s.add(tempId);
        }
        return s;
    }, [detectionResult, confirmedPairs, confirmedDbLinks]);

    const transferImportCount = confirmedPairs.size + confirmedDbLinks.size;
    const cleanCount = allRawTxs.filter(
        (t) => !confirmedPairedTempIds.has(t.tempId) && !skippedTempIds.has(t.tempId),
    ).length;
    const savedCount = skippedTempIds.size + confirmedPairs.size + confirmedDbLinks.size;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative bg-surface-container-low border border-line-subtle/20 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-line-subtle/10">
                    <div>
                        <h2 className="text-lg font-bold text-on-surface">
                            Import Transactions
                        </h2>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                            Upload up to {MAX_SLOTS} bank statements or CSV files
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">

                    {/* ── STEP: upload ─────────────────────────────────────── */}
                    {step === "upload" && (
                        <div className="space-y-6">
                            {/* Mode toggle */}
                            <div className="flex gap-1 p-1 bg-surface-container rounded-xl w-fit">
                                <button
                                    onClick={() => handleModeChange("csv")}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                        importMode === "csv"
                                            ? "bg-primary text-on-primary shadow-sm"
                                            : "text-on-surface-variant hover:text-on-surface"
                                    }`}
                                >
                                    CSV / Excel
                                </button>
                                <button
                                    onClick={() => handleModeChange("ai")}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                        importMode === "ai"
                                            ? "bg-primary text-on-primary shadow-sm"
                                            : "text-on-surface-variant hover:text-on-surface"
                                    }`}
                                >
                                    AI Parse
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-tertiary/20 text-tertiary font-semibold">
                                        PDF · IMG
                                    </span>
                                </button>
                            </div>

                            {importMode === "ai" && (
                                <p className="text-xs text-on-surface-variant bg-surface-container rounded-xl px-4 py-3">
                                    Upload your bank statement as a <span className="text-on-surface font-medium">PDF</span>, <span className="text-on-surface font-medium">image</span> (PNG / JPG / WEBP), or <span className="text-on-surface font-medium">plain text</span> file.
                                    Select the account <span className="text-on-surface font-medium">before</span> uploading — the AI needs it to assign transactions.
                                </p>
                            )}

                            {/* File slots */}
                            <div className="space-y-3">
                                {slots.map((slot, slotIdx) => (
                                    <div key={slot.id} className="border border-line-subtle/20 rounded-xl overflow-hidden">
                                        {/* Slot header */}
                                        <div className="flex items-center gap-3 px-4 py-3 bg-surface-container">
                                            <span className="text-xs font-medium text-on-surface-variant">
                                                File {slotIdx + 1}
                                            </span>
                                            {/* Account selector */}
                                            <select
                                                value={slot.accountId}
                                                onChange={(e) => handleAccountChange(slot.id, e.target.value)}
                                                className="flex-1 text-xs bg-surface-container-high border border-line-subtle/20 rounded-lg px-3 py-1.5 text-on-surface focus:outline-none focus:border-primary/50"
                                            >
                                                <option value="">Select account…</option>
                                                {accounts.map((a) => (
                                                    <option key={a.id} value={a.id}>{a.name}</option>
                                                ))}
                                            </select>
                                            {slot.parsedRows.length > 0 && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-tertiary/15 text-tertiary font-medium whitespace-nowrap">
                                                    {slot.parsedRows.length} rows
                                                </span>
                                            )}
                                            {slots.length > 1 && (
                                                <button
                                                    onClick={() => removeSlot(slot.id)}
                                                    className="text-on-surface-variant/50 hover:text-error transition-colors"
                                                    title="Remove file slot"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>

                                        {/* Drop zone */}
                                        <div
                                            className={`border-t border-line-subtle/10 p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                                                slot.dragOver
                                                    ? "bg-primary/8 border-primary"
                                                    : slot.parsing
                                                    ? "bg-surface-container"
                                                    : "hover:bg-surface-container"
                                            }`}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, dragOver: true } : s));
                                            }}
                                            onDragLeave={() =>
                                                setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, dragOver: false } : s))
                                            }
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, dragOver: false } : s));
                                                const f = e.dataTransfer.files[0];
                                                if (f) {
                                                    if (importMode === "ai") handleAiParseForSlot(slot.id, f);
                                                    else handleFileForSlot(slot.id, f);
                                                }
                                            }}
                                            onClick={() => !slot.parsing && fileInputRefs.current[slotIdx]?.click()}
                                        >
                                            {slot.parsing ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <svg className="w-6 h-6 text-primary animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                    <p className="text-xs text-on-surface-variant">AI is parsing your statement…</p>
                                                </div>
                                            ) : slot.file ? (
                                                <p className="text-sm text-on-surface font-medium">{slot.file.name}</p>
                                            ) : importMode === "ai" ? (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-on-surface-variant/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                        <polyline points="17 8 12 3 7 8" />
                                                        <line x1="12" y1="3" x2="12" y2="15" />
                                                    </svg>
                                                    <p className="text-xs text-on-surface-variant">Drop statement or click — PDF, PNG, JPG, WEBP, TXT</p>
                                                </>
                                            ) : (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-on-surface-variant/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                        <polyline points="17 8 12 3 7 8" />
                                                        <line x1="12" y1="3" x2="12" y2="15" />
                                                    </svg>
                                                    <p className="text-xs text-on-surface-variant">Drop file or click — .csv, .xlsx, .xls</p>
                                                </>
                                            )}
                                            <input
                                                ref={(el) => { fileInputRefs.current[slotIdx] = el; }}
                                                type="file"
                                                accept={importMode === "ai" ? ".pdf,.png,.jpg,.jpeg,.webp,.txt" : ".csv,.xlsx,.xls"}
                                                className="hidden"
                                                onChange={(e) => {
                                                    const f = e.target.files?.[0];
                                                    if (f) {
                                                        if (importMode === "ai") handleAiParseForSlot(slot.id, f);
                                                        else handleFileForSlot(slot.id, f);
                                                    }
                                                }}
                                            />
                                        </div>
                                        {slot.parseError && (
                                            <p className="px-4 py-2 text-xs text-error bg-error/8">
                                                {slot.parseError}
                                            </p>
                                        )}
                                    </div>
                                ))}

                                {slots.length < MAX_SLOTS && (
                                    <button
                                        onClick={addSlot}
                                        className="w-full py-2.5 border border-dashed border-line-subtle/30 rounded-xl text-xs text-on-surface-variant hover:border-primary/50 hover:text-primary transition-colors"
                                    >
                                        + Add another file
                                    </button>
                                )}
                            </div>

                            {parseError && (
                                <p className="text-sm text-error bg-error/10 px-4 py-3 rounded-lg">
                                    {parseError}
                                </p>
                            )}

                            {/* Format info + template download — CSV mode only */}
                            {importMode === "csv" && <div className="bg-surface-container rounded-xl p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-on-surface">
                                        Required Format
                                    </h3>
                                    <button
                                        onClick={downloadTemplate}
                                        className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1.5 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7 10 12 15 17 10" />
                                            <line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                        Download Template
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="text-xs w-full">
                                        <thead>
                                            <tr>
                                                {TEMPLATE_HEADERS.map((h) => (
                                                    <th key={h} className="text-left px-2 py-1.5 text-on-surface-variant font-medium whitespace-nowrap border-b border-line-subtle/10">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {TEMPLATE_ROWS.map((row, i) => (
                                                <tr key={i} className="border-b border-line-subtle/5">
                                                    {row.map((cell, j) => (
                                                        <td key={j} className="px-2 py-1.5 text-on-surface-variant/70 whitespace-nowrap">
                                                            {cell || (
                                                                <span className="text-on-surface-variant/30 italic">optional</span>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="text-xs text-on-surface-variant/60 space-y-0.5 pt-1">
                                    <p><span className="text-on-surface-variant font-medium">account</span> — must match an existing account name exactly (case-insensitive). Overridden by the account selector above.</p>
                                    <p><span className="text-on-surface-variant font-medium">type</span> — INCOME, EXPENSE, TRANSFER, or INVESTMENT</p>
                                    <p><span className="text-on-surface-variant font-medium">transferType</span> — BANK or PERSON (required for TRANSFER)</p>
                                </div>
                            </div>}
                        </div>
                    )}

                    {/* ── STEP: preview ────────────────────────────────────── */}
                    {step === "preview" && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-sm text-on-surface-variant">
                                    {allParsedRows.length} rows across{" "}
                                    <span className="text-on-surface font-medium">
                                        {slots.filter((s) => s.file).length} file{slots.filter((s) => s.file).length !== 1 ? "s" : ""}
                                    </span>
                                </span>
                                <span className="text-xs px-2.5 py-1 rounded-full bg-tertiary/15 text-tertiary font-medium">
                                    {validCount} valid
                                </span>
                                {errorCount > 0 && (
                                    <span className="text-xs px-2.5 py-1 rounded-full bg-error/15 text-error font-medium">
                                        {errorCount} with errors
                                    </span>
                                )}
                            </div>

                            {parseError && (
                                <p className="text-sm text-error bg-error/10 px-4 py-3 rounded-lg">
                                    {parseError}
                                </p>
                            )}

                            {allParsedRows.length === 0 ? (
                                <p className="text-sm text-on-surface-variant text-center py-8">
                                    No data rows found in the files.
                                </p>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-line-subtle/15">
                                    <table className="text-xs w-full">
                                        <thead>
                                            <tr className="bg-surface-container">
                                                <th className="text-left px-3 py-2.5 text-on-surface-variant font-medium whitespace-nowrap">Row</th>
                                                <th className="text-left px-3 py-2.5 text-on-surface-variant font-medium whitespace-nowrap">Date</th>
                                                <th className="text-left px-3 py-2.5 text-on-surface-variant font-medium whitespace-nowrap">Type</th>
                                                <th className="text-left px-3 py-2.5 text-on-surface-variant font-medium whitespace-nowrap">Amount</th>
                                                <th className="text-left px-3 py-2.5 text-on-surface-variant font-medium whitespace-nowrap">Account</th>
                                                <th className="text-left px-3 py-2.5 text-on-surface-variant font-medium whitespace-nowrap">Description</th>
                                                <th className="text-left px-3 py-2.5 text-on-surface-variant font-medium whitespace-nowrap">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allParsedRows.map((row) => (
                                                <tr key={row.rowIndex} className={`border-t border-line-subtle/10 ${row.errors.length > 0 ? "bg-error/5" : ""}`}>
                                                    <td className="px-3 py-2 text-on-surface-variant/50">{row.rowIndex}</td>
                                                    <td className="px-3 py-2 text-on-surface whitespace-nowrap">{row.raw.date}</td>
                                                    <td className="px-3 py-2 text-on-surface whitespace-nowrap">{row.raw.type}</td>
                                                    <td className="px-3 py-2 text-on-surface whitespace-nowrap">{row.raw.amount}</td>
                                                    <td className="px-3 py-2 text-on-surface whitespace-nowrap">{row.raw.account}</td>
                                                    <td className="px-3 py-2 text-on-surface-variant max-w-[160px] truncate">{row.raw.description}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {row.errors.length > 0 ? (
                                                            <span className="text-error" title={row.errors.join("; ")}>
                                                                ✗ {row.errors[0]}
                                                                {row.errors.length > 1 && ` (+${row.errors.length - 1})`}
                                                            </span>
                                                        ) : (
                                                            <span className="text-tertiary">✓ OK</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP: transfers ──────────────────────────────────── */}
                    {step === "transfers" && detectionResult && (
                        <div className="space-y-6">

                            {/* Section 1: Detected transfers */}
                            {detectionResult.transferPairs.length > 0 && (
                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-on-surface">
                                            {detectionResult.transferPairs.length} inter-account transfer{detectionResult.transferPairs.length !== 1 ? "s" : ""} detected
                                        </h3>
                                        <p className="text-xs text-on-surface-variant mt-0.5">
                                            These will be recorded as transfers — not counted as expenses
                                        </p>
                                    </div>

                                    {detectionResult.transferPairs.map((pair) => {
                                        const isConfirmed = confirmedPairs.has(pair.debitTempId);
                                        const isDismissed = dismissedPairs.has(pair.debitTempId);
                                        const debitTx = allRawTxs.find((t) => t.tempId === pair.debitTempId);
                                        const creditTx = allRawTxs.find((t) => t.tempId === pair.creditTempId);

                                        return (
                                            <div
                                                key={pair.debitTempId}
                                                className={`rounded-xl border p-4 space-y-2 transition-colors ${
                                                    isDismissed
                                                        ? "border-line-subtle/10 opacity-50"
                                                        : isConfirmed
                                                        ? "border-primary/30 bg-primary/5"
                                                        : "border-warning/40 bg-warning/5"
                                                }`}
                                            >
                                                {/* Transfer arrow row */}
                                                <div className="flex items-center gap-2 text-sm">
                                                    <span className="font-medium text-on-surface truncate max-w-[120px]">
                                                        {getAccountName(pair.fromAccountId)}
                                                    </span>
                                                    <span className="text-on-surface-variant">──</span>
                                                    <span className="font-semibold text-on-surface whitespace-nowrap">
                                                        ₹{pair.amount.toLocaleString("en-IN")}
                                                    </span>
                                                    <span className="text-on-surface-variant">──▶</span>
                                                    <span className="font-medium text-on-surface truncate max-w-[120px]">
                                                        {getAccountName(pair.toAccountId)}
                                                    </span>
                                                    {pair.needsReview && !isDismissed && (
                                                        <span className="ml-auto shrink-0 text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                                                            Review
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Descriptions */}
                                                {(debitTx || creditTx) && (
                                                    <div className="text-xs text-on-surface-variant flex gap-4 flex-wrap">
                                                        {debitTx && (
                                                            <span>
                                                                {debitTx.date.toLocaleDateString("en-IN", { month: "short", day: "numeric" })} · &quot;{debitTx.description}&quot;
                                                            </span>
                                                        )}
                                                        {creditTx && (
                                                            <span>
                                                                {creditTx.date.toLocaleDateString("en-IN", { month: "short", day: "numeric" })} · &quot;{creditTx.description}&quot;
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Confidence + reasons */}
                                                <div className="text-xs text-on-surface-variant/70">
                                                    Confidence: {Math.round(pair.confidence * 100)}% · {pair.reasons.join(" · ")}
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-2 pt-1">
                                                    {pair.needsReview ? (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setConfirmedPairs((prev) => new Set([...prev, pair.debitTempId]));
                                                                    setDismissedPairs((prev) => { const n = new Set(prev); n.delete(pair.debitTempId); return n; });
                                                                }}
                                                                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${isConfirmed ? "bg-primary/20 text-primary" : "bg-surface-container-high text-on-surface-variant hover:bg-primary/15 hover:text-primary"}`}
                                                            >
                                                                ✓ Yes, transfer
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setDismissedPairs((prev) => new Set([...prev, pair.debitTempId]));
                                                                    setConfirmedPairs((prev) => { const n = new Set(prev); n.delete(pair.debitTempId); return n; });
                                                                }}
                                                                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${isDismissed ? "bg-error/20 text-error" : "bg-surface-container-high text-on-surface-variant hover:bg-error/15 hover:text-error"}`}
                                                            >
                                                                ✗ No, keep separate
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => togglePairConfirmed(pair.debitTempId)}
                                                            className="text-xs text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
                                                        >
                                                            ↩ Undo — treat as separate
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Section 1.5: DB cross-import candidates */}
                            {dbCandidates.length > 0 && (
                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-on-surface">
                                            {dbCandidates.length} cross-import transfer{dbCandidates.length !== 1 ? "s" : ""} detected
                                        </h3>
                                        <p className="text-xs text-on-surface-variant mt-0.5">
                                            These IMPS/NEFT/UPI transactions match existing records in another account — link them as transfers to avoid double-counting
                                        </p>
                                    </div>

                                    {dbCandidates.map((candidate) => {
                                        const isConfirmed = confirmedDbLinks.has(candidate.tempId);
                                        const isDismissed = dismissedDbLinks.has(candidate.tempId);
                                        const rawTx = allRawTxs.find((t) => t.tempId === candidate.tempId);

                                        // Determine from/to for display
                                        const fromName = candidate.existingTxType === "EXPENSE"
                                            ? candidate.existingAccountName
                                            : getAccountName(rawTx?.sourceAccountId ?? "");
                                        const toName = candidate.existingTxType === "EXPENSE"
                                            ? getAccountName(rawTx?.sourceAccountId ?? "")
                                            : candidate.existingAccountName;

                                        return (
                                            <div
                                                key={candidate.tempId}
                                                className={`rounded-xl border p-4 space-y-2 transition-colors ${
                                                    isDismissed
                                                        ? "border-line-subtle/10 opacity-50"
                                                        : isConfirmed
                                                        ? "border-primary/30 bg-primary/5"
                                                        : "border-warning/40 bg-warning/5"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 text-sm flex-wrap">
                                                    <span className="font-medium text-on-surface truncate max-w-[120px]">
                                                        {fromName}
                                                    </span>
                                                    <span className="text-on-surface-variant">──</span>
                                                    <span className="font-semibold text-on-surface whitespace-nowrap">
                                                        ₹{candidate.amount.toLocaleString("en-IN")}
                                                    </span>
                                                    <span className="text-on-surface-variant">──▶</span>
                                                    <span className="font-medium text-on-surface truncate max-w-[120px]">
                                                        {toName}
                                                    </span>
                                                    <span className="ml-auto shrink-0 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                                                        Cross-import
                                                    </span>
                                                </div>
                                                <div className="text-xs text-on-surface-variant">
                                                    {new Date(candidate.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} · &quot;{candidate.description}&quot;
                                                </div>
                                                <div className="flex items-center gap-2 pt-1">
                                                    <button
                                                        onClick={() => {
                                                            setConfirmedDbLinks((prev) => new Set([...prev, candidate.tempId]));
                                                            setDismissedDbLinks((prev) => { const n = new Set(prev); n.delete(candidate.tempId); return n; });
                                                        }}
                                                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${isConfirmed && !isDismissed ? "bg-primary/20 text-primary" : "bg-surface-container-high text-on-surface-variant hover:bg-primary/15 hover:text-primary"}`}
                                                    >
                                                        ✓ Yes, link as transfer
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setDismissedDbLinks((prev) => new Set([...prev, candidate.tempId]));
                                                            setConfirmedDbLinks((prev) => { const n = new Set(prev); n.delete(candidate.tempId); return n; });
                                                        }}
                                                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${isDismissed ? "bg-error/20 text-error" : "bg-surface-container-high text-on-surface-variant hover:bg-error/15 hover:text-error"}`}
                                                    >
                                                        ✗ Import as {candidate.existingTxType === "EXPENSE" ? "income" : "expense"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Section 2: All transactions table */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h3 className="text-sm font-semibold text-on-surface">Transactions to import</h3>
                                    <span className="text-xs text-on-surface-variant">
                                        {allRawTxs.filter((t) => t.type === "DEBIT" && !confirmedPairedTempIds.has(t.tempId)).length} expenses ·{" "}
                                        {allRawTxs.filter((t) => t.type === "CREDIT" && !confirmedPairedTempIds.has(t.tempId)).length} income ·{" "}
                                        {transferImportCount} transfers
                                    </span>
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-line-subtle/15 max-h-64">
                                    <table className="text-xs w-full">
                                        <thead>
                                            <tr className="bg-surface-container">
                                                <th className="text-left px-3 py-2 text-on-surface-variant font-medium">Skip</th>
                                                <th className="text-left px-3 py-2 text-on-surface-variant font-medium whitespace-nowrap">Date</th>
                                                <th className="text-left px-3 py-2 text-on-surface-variant font-medium">Description</th>
                                                <th className="text-left px-3 py-2 text-on-surface-variant font-medium whitespace-nowrap">Amount</th>
                                                <th className="text-left px-3 py-2 text-on-surface-variant font-medium">Type</th>
                                                <th className="text-left px-3 py-2 text-on-surface-variant font-medium">Account</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allRawTxs.map((tx) => {
                                                const isPaired = confirmedPairedTempIds.has(tx.tempId);
                                                const isSkipped = skippedTempIds.has(tx.tempId);
                                                const isDup = isDuplicate(tx);

                                                return (
                                                    <tr
                                                        key={tx.tempId}
                                                        className={`border-t border-line-subtle/10 ${isPaired || isSkipped ? "opacity-40" : ""} ${isDup && !isSkipped ? "bg-warning/5" : ""}`}
                                                    >
                                                        <td className="px-3 py-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSkipped}
                                                                onChange={() => toggleTxSkipped(tx.tempId)}
                                                                disabled={isPaired}
                                                                className="accent-primary"
                                                                title={isDup ? "Already imported" : "Skip this row"}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 whitespace-nowrap">
                                                            {tx.date.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                                                        </td>
                                                        <td className="px-3 py-2 max-w-[160px] truncate text-on-surface-variant">
                                                            {tx.description}
                                                        </td>
                                                        <td className="px-3 py-2 whitespace-nowrap text-on-surface">
                                                            ₹{tx.amount.toLocaleString("en-IN")}
                                                        </td>
                                                        <td className="px-3 py-2 whitespace-nowrap">
                                                            {isPaired ? (
                                                                <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">↔ Transfer</span>
                                                            ) : isDup ? (
                                                                <span className="text-warning">Already imported</span>
                                                            ) : (
                                                                <span className={tx.type === "CREDIT" ? "text-tertiary" : "text-error"}>
                                                                    {tx.type === "CREDIT" ? "Income" : "Expense"}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap max-w-[100px] truncate">
                                                            {getAccountName(tx.sourceAccountId)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {parseError && (
                                <p className="text-sm text-error bg-error/10 px-4 py-3 rounded-lg">{parseError}</p>
                            )}
                        </div>
                    )}

                    {/* ── STEP: done ────────────────────────────────────────── */}
                    {step === "done" && (
                        <div className="flex flex-col items-center justify-center py-10 gap-6">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-tertiary/20">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                            <div className="text-center space-y-1.5">
                                {confirmResult ? (
                                    <>
                                        <p className="text-base font-semibold text-on-surface">
                                            {confirmResult.imported} transaction{confirmResult.imported !== 1 ? "s" : ""} imported
                                            {confirmResult.transfersCreated > 0 && ` · ${confirmResult.transfersCreated} transfer${confirmResult.transfersCreated !== 1 ? "s" : ""} detected`}
                                            {confirmResult.skipped > 0 && ` · ${confirmResult.skipped} duplicate${confirmResult.skipped !== 1 ? "s" : ""} skipped`}
                                        </p>
                                    </>
                                ) : uploadResult ? (
                                    <>
                                        <p className="text-base font-semibold text-on-surface">
                                            {uploadResult.succeeded} transaction{uploadResult.succeeded !== 1 ? "s" : ""} imported
                                        </p>
                                        {uploadResult.failed.length > 0 && (
                                            <p className="text-sm text-error">
                                                {uploadResult.failed.length} failed to import
                                            </p>
                                        )}
                                    </>
                                ) : null}
                            </div>
                            {uploadResult && uploadResult.failed.length > 0 && (
                                <div className="w-full bg-error/8 rounded-xl p-4 space-y-1.5 max-h-40 overflow-y-auto">
                                    {uploadResult.failed.map((f) => (
                                        <p key={f.index} className="text-xs text-error">
                                            Row {f.index + 1}: {f.error}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-line-subtle/10 gap-3">
                    {step === "upload" && (
                        <>
                            <button onClick={onClose} className="btn-secondary">
                                Cancel
                            </button>
                            <button
                                onClick={goToPreview}
                                disabled={allParsedRows.length === 0 || slots.some((s) => s.parsing)}
                                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {slots.some((s) => s.parsing)
                                    ? "Parsing…"
                                    : `Preview ${allParsedRows.length > 0 ? `${allParsedRows.length} rows` : ""}`}
                            </button>
                        </>
                    )}
                    {step === "preview" && (
                        <>
                            <button
                                onClick={() => {
                                    setStep("upload");
                                    setParseError(null);
                                }}
                                className="btn-secondary"
                            >
                                Back
                            </button>
                            <button
                                onClick={goToTransfers}
                                disabled={submitting || validCount === 0}
                                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting
                                    ? "Detecting transfers…"
                                    : `Continue with ${validCount} transaction${validCount !== 1 ? "s" : ""}`}
                            </button>
                        </>
                    )}
                    {step === "transfers" && (
                        <>
                            <button
                                onClick={() => setStep("preview")}
                                className="btn-secondary"
                            >
                                ← Back
                            </button>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-on-surface-variant">
                                    Importing {cleanCount} transaction{cleanCount !== 1 ? "s" : ""}
                                    {transferImportCount > 0 && ` + ${transferImportCount} transfer${transferImportCount !== 1 ? "s" : ""}`}
                                    {savedCount > 0 && ` (saved ${savedCount} duplicate${savedCount !== 1 ? "s" : ""})`}
                                </span>
                                <button
                                    onClick={handleConfirmImport}
                                    disabled={submitting}
                                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? "Importing…" : "Confirm & Import →"}
                                </button>
                            </div>
                        </>
                    )}
                    {step === "done" && (
                        <button onClick={onSuccess} className="btn-primary ml-auto">
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
