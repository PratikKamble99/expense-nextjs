export interface RawTransaction {
  tempId: string;
  sourceAccountId: string;
  date: Date;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  referenceNumber?: string;
}

export interface TransferPair {
  debitTempId: string;
  creditTempId: string;
  amount: number;
  confidence: number;
  needsReview: boolean;
  reasons: string[];
  fromAccountId: string;
  toAccountId: string;
}

export interface DetectionResult {
  transferPairs: TransferPair[];
  cleanTransactions: RawTransaction[];
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

const BANK_NAMES = [
  "sbi", "hdfc", "icici", "axis", "kotak", "pnb", "bob", "canara",
  "union", "idbi", "indusind", "yes bank", "rbl", "federal", "iob",
  "syndicate", "allahabad", "uco", "vijaya", "dena", "central bank",
];

const GENERIC_KEYWORDS = ["neft", "imps", "trf", "transfer", "trfr", "rtgs", "upi"];

function scoreAmount(debitAmt: number, creditAmt: number): number {
  if (debitAmt === creditAmt) return 0.40;
  const larger = Math.max(debitAmt, creditAmt);
  const pct = Math.abs(debitAmt - creditAmt) / larger;
  if (pct <= 0.005) return 0.25;
  if (Math.abs(debitAmt - creditAmt) <= 50) return 0.20;
  return 0;
}

function scoreDate(a: Date, b: Date): number {
  const diffMs = Math.abs(a.getTime() - b.getTime());
  const diffDays = diffMs / 86_400_000;
  if (diffDays < 1) return 0.30;
  if (diffDays < 2) return 0.22;
  if (diffDays < 3) return 0.12;
  if (diffDays <= 5) return 0.05;
  return 0;
}

const UTR_RE = /\b(UTR|IMPS|NEFT|UPI|RTGS)[\/\s]?([A-Z0-9]{6,})/gi;
const REF_RE = /\b([A-Z0-9]{8,})\b/g;

function extractRefs(desc: string): string[] {
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  UTR_RE.lastIndex = 0;
  while ((m = UTR_RE.exec(desc)) !== null) refs.push(m[2].toUpperCase());
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(desc)) !== null) refs.push(m[1].toUpperCase());
  return refs;
}

function lastNDigits(s: string, n: number): string {
  const digits = s.replace(/\D/g, "");
  return digits.slice(-n);
}

function scoreReference(debit: RawTransaction, credit: RawTransaction): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const dDesc = debit.description.toUpperCase();
  const cDesc = credit.description.toUpperCase();

  // Last 6+ digits of reference number match
  const dRef = debit.referenceNumber ?? "";
  const cRef = credit.referenceNumber ?? "";
  if (dRef && cRef && dRef.length >= 6 && cRef.length >= 6) {
    if (lastNDigits(dRef, 6) === lastNDigits(cRef, 6)) {
      reasons.push("Ref match");
      return { score: 0.20, reasons };
    }
  }

  // UTR/IMPS/NEFT ref found in both descriptions
  const dRefs = extractRefs(dDesc);
  const cRefs = extractRefs(cDesc);
  if (dRefs.length > 0 && cRefs.length > 0) {
    const dSet = new Set(dRefs);
    const shared = cRefs.filter((r) => dSet.has(r));
    if (shared.length > 0) {
      reasons.push("UTR/ref match");
      return { score: 0.20, reasons };
    }
    // Check last 6 digits of any ref
    const dLast = dRefs.map((r) => r.slice(-6));
    const cLast = cRefs.map((r) => r.slice(-6));
    if (dLast.some((d) => cLast.includes(d))) {
      reasons.push("Ref suffix match");
      return { score: 0.20, reasons };
    }
  }

  // UPI ID in both descriptions
  const upiRe = /[\w.-]+@[\w]+/g;
  const dUpi = dDesc.match(upiRe);
  const cUpi = cDesc.match(upiRe);
  if (dUpi && cUpi) {
    const dSet = new Set(dUpi);
    if (cUpi.some((u) => dSet.has(u))) {
      reasons.push("UPI ID match");
      return { score: 0.16, reasons };
    }
  }

  // Bank name cross-reference
  const dHasBank = BANK_NAMES.some((b) => dDesc.includes(b.toUpperCase()));
  const cHasBank = BANK_NAMES.some((b) => cDesc.includes(b.toUpperCase()));
  if (dHasBank && cHasBank) {
    reasons.push("Bank name match");
    return { score: 0.10, reasons };
  }

  // Generic keywords both
  const dGeneric = GENERIC_KEYWORDS.some((k) => dDesc.includes(k.toUpperCase()));
  const cGeneric = GENERIC_KEYWORDS.some((k) => cDesc.includes(k.toUpperCase()));
  if (dGeneric && cGeneric) {
    reasons.push("Transfer keyword");
    return { score: 0.05, reasons };
  }

  return { score: 0, reasons };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

// ── Main function ─────────────────────────────────────────────────────────────

export function detectTransfers(txs: RawTransaction[]): DetectionResult {
  const debits = txs.filter((t) => t.type === "DEBIT");
  const credits = txs.filter((t) => t.type === "CREDIT");

  interface Candidate {
    debitTempId: string;
    creditTempId: string;
    score: number;
    reasons: string[];
    debitAmount: number;
    creditAmount: number;
    fromAccountId: string;
    toAccountId: string;
  }

  const candidates: Candidate[] = [];

  for (const debit of debits) {
    for (const credit of credits) {
      // Only match across different accounts
      if (debit.sourceAccountId === credit.sourceAccountId) continue;

      const amtScore = scoreAmount(debit.amount, credit.amount);
      if (amtScore === 0) continue; // amount is too different — skip early

      const dateScore = scoreDate(debit.date, credit.date);
      const { score: refScore, reasons: refReasons } = scoreReference(debit, credit);

      // Direction check: debit + credit = +0.10
      const dirScore = 0.10;

      let total = amtScore + dateScore + refScore + dirScore;
      total = Math.min(1, Math.max(0, total));

      if (total < 0.50) continue;

      const reasons: string[] = [];
      if (amtScore === 0.40) reasons.push("Exact amount");
      else if (amtScore === 0.25) reasons.push("Near amount (±0.5%)");
      else if (amtScore === 0.20) reasons.push("Near amount (±₹50)");

      if (dateScore === 0.30) reasons.push("Same day");
      else if (dateScore === 0.22) reasons.push(`1 day apart (${formatDate(debit.date)} / ${formatDate(credit.date)})`);
      else if (dateScore === 0.12) reasons.push(`2 days apart`);
      else if (dateScore === 0.05) reasons.push(`3–5 days apart`);

      reasons.push(...refReasons);

      candidates.push({
        debitTempId: debit.tempId,
        creditTempId: credit.tempId,
        score: total,
        reasons,
        debitAmount: debit.amount,
        creditAmount: credit.amount,
        fromAccountId: debit.sourceAccountId,
        toAccountId: credit.sourceAccountId,
      });
    }
  }

  // Sort by score descending, greedy match
  candidates.sort((a, b) => b.score - a.score);

  const usedIds = new Set<string>();
  const transferPairs: TransferPair[] = [];

  for (const c of candidates) {
    if (usedIds.has(c.debitTempId) || usedIds.has(c.creditTempId)) continue;
    usedIds.add(c.debitTempId);
    usedIds.add(c.creditTempId);

    transferPairs.push({
      debitTempId: c.debitTempId,
      creditTempId: c.creditTempId,
      // Use credit side amount as the canonical transfer amount
      amount: c.creditAmount,
      confidence: c.score,
      needsReview: c.score < 0.85,
      reasons: c.reasons,
      fromAccountId: c.fromAccountId,
      toAccountId: c.toAccountId,
    });
  }

  // Sort pairs by confidence desc
  transferPairs.sort((a, b) => b.confidence - a.confidence);

  const cleanTransactions = txs.filter((t) => !usedIds.has(t.tempId));

  return { transferPairs, cleanTransactions };
}
