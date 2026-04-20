import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface ParsedTransactionAI {
  date: string;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  referenceNumber?: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

const PARSE_PROMPT = `You are a financial data extraction assistant. Extract ALL transactions from this bank statement.

Return a JSON object with a single key "transactions" containing an array of transaction objects.
Each transaction must have:
- date: ISO date string in YYYY-MM-DD format
- description: merchant/payee name or transaction description (string)
- amount: absolute positive number — never negative
- type: "DEBIT" for money going out (purchases, withdrawals, payments, fees) or "CREDIT" for money coming in (deposits, salary, refunds)
- referenceNumber: transaction reference, cheque number, or UTR if visible (optional string, omit if absent)

Rules:
- Extract every single transaction, including small fees and charges
- Opening balance, closing balance, and running balance rows are NOT transactions — skip them
- Column headers are NOT transactions — skip them
- Do not invent transactions not present in the statement
- Return ONLY valid JSON with the "transactions" array — no markdown, no explanation`;

/**
 * Extracts readable text from a text-based PDF buffer using BT...ET stream parsing.
 * Works for the majority of bank statement PDFs (text-based, not scanned images).
 */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const parts: string[] = [];

  const btEtRegex = /BT\b([\s\S]*?)\bET\b/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btEtRegex.exec(raw)) !== null) {
    const block = btMatch[1];
    // Match string literals: (content) — handle escaped parens
    const strRegex = /\(([^)\\]|\\.)*\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRegex.exec(block)) !== null) {
      const str = sm[0]
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        // octal escape \NNN
        .replace(/\\([0-7]{3})/g, (_, oct) =>
          String.fromCharCode(parseInt(oct, 8)),
        );
      const cleaned = str.trim();
      if (cleaned) parts.push(cleaned);
    }
  }

  return parts.join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const accountId = formData.get("accountId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 },
      );
    }

    const fileName = file.name.toLowerCase();
    const mimeType = file.type || "application/octet-stream";
    const isImage =
      mimeType.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/.test(fileName);
    const isPdf =
      mimeType === "application/pdf" || fileName.endsWith(".pdf");
    const isText =
      mimeType.startsWith("text/") || /\.(txt|csv)$/.test(fileName);

    if (!isImage && !isPdf && !isText) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Please upload a PDF, image (PNG/JPG/WEBP), or text file.",
        },
        { status: 400 },
      );
    }

    // ── Build the OpenAI message ──────────────────────────────────────────────

    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } };

    const content: ContentBlock[] = [];

    if (isText) {
      const text = await file.text();
      content.push({ type: "text", text: PARSE_PROMPT });
      content.push({
        type: "text",
        text: `Bank statement content:\n\n${text}`,
      });
    } else if (isPdf) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = extractPdfText(buffer);

      if (extracted.length > 100) {
        // Text-based PDF — use extracted text
        content.push({ type: "text", text: PARSE_PROMPT });
        content.push({
          type: "text",
          text: `Bank statement content (extracted from PDF):\n\n${extracted}`,
        });
      } else {
        // Scanned / image-based PDF — text extraction yielded nothing.
        // OpenAI vision only accepts image MIME types, so we can't pass the PDF directly.
        return NextResponse.json(
          {
            error:
              "This PDF appears to be a scanned image and no text could be extracted from it. " +
              "Please take a screenshot of the statement and upload it as a PNG or JPG instead.",
          },
          { status: 400 },
        );
      }
    } else {
      // Image
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mediaType = isImage ? (mimeType.startsWith("image/") ? mimeType : "image/jpeg") : "image/jpeg";
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${mediaType};base64,${base64}`,
          detail: "high",
        },
      });
      content.push({ type: "text", text: PARSE_PROMPT });
    }

    // ── Call OpenAI ───────────────────────────────────────────────────────────

    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
          max_tokens: 4096,
        }),
      },
    );

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return NextResponse.json(
        { error: `OpenAI error: ${errText}` },
        { status: 502 },
      );
    }

    const openaiData = (await openaiRes.json()) as OpenAIResponse;
    const rawContent = openaiData.choices[0]?.message?.content;

    if (!rawContent) {
      return NextResponse.json(
        { error: "No response from AI model" },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(rawContent) as {
      transactions?: unknown[];
    };

    if (!Array.isArray(parsed.transactions)) {
      return NextResponse.json(
        { error: "AI returned unexpected format" },
        { status: 502 },
      );
    }

    // Validate and normalise each transaction
    const transactions: ParsedTransactionAI[] = (
      parsed.transactions as Partial<ParsedTransactionAI>[]
    )
      .filter(
        (t) =>
          typeof t.date === "string" &&
          typeof t.amount === "number" &&
          t.amount > 0 &&
          (t.type === "DEBIT" || t.type === "CREDIT"),
      )
      .map((t) => ({
        date: t.date!,
        description: t.description ?? "",
        amount: Math.abs(Number(t.amount)),
        type: t.type!,
        referenceNumber: t.referenceNumber ?? undefined,
      }));

    return NextResponse.json({ transactions, accountId });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
