"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { appendMessages, clearChatHistory } from "@/actions/chat";
import type { ChatMessageData } from "@/actions/chat";

const MAX_LLM_CONTEXT = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  createdAt?: string; // ISO — undefined only while streaming
}

type FilterPeriod = "all" | "today" | "yesterday" | "week" | "month";

const FILTER_LABELS: Record<FilterPeriod, string> = {
  all: "All",
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  month: "This Month",
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function filterMessages(messages: Message[], period: FilterPeriod): Message[] {
  if (period === "all") return messages;

  const now = new Date();
  const todayStart = startOfDay(now);

  if (period === "yesterday") {
    const yStart = new Date(todayStart.getTime() - 86_400_000);
    const yEnd = new Date(todayStart.getTime() - 1);
    return messages.filter((m) => {
      if (!m.createdAt) return false;
      const t = new Date(m.createdAt).getTime();
      return t >= yStart.getTime() && t <= yEnd.getTime();
    });
  }

  let since: Date;
  switch (period) {
    case "today":
      since = todayStart;
      break;
    case "week":
      since = new Date(todayStart.getTime() - 6 * 86_400_000);
      break;
    case "month":
      since = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  return messages.filter(
    (m) => m.createdAt && new Date(m.createdAt) >= since
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-line-subtle/20" />
      <span className="text-xs text-on-surface-variant/60 font-medium shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-line-subtle/20" />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-on-surface-variant animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-1 border border-primary/20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word ${
            isUser
              ? "bg-primary text-white rounded-tr-sm shadow-sm"
              : "bg-surface-container-high text-on-surface rounded-tl-sm border border-line-subtle/10"
          }`}
        >
          {message.content ? (
            message.content
          ) : isStreaming ? (
            <TypingDots />
          ) : null}
        </div>

        {message.createdAt && (
          <span className="text-[10px] text-on-surface-variant/50 px-1">
            {timeLabel(message.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "How much did I spend on food last month?",
  "What's my total balance across all accounts?",
  "Which category is my biggest expense?",
  "Show me all transfers above ₹5000",
  "How much have I invested in mutual funds?",
  "Am I saving more than last month?",
];

// ── Main component ────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  initialMessages?: ChatMessageData[];
}

export function ChatInterface({ initialMessages = [] }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [filter, setFilter] = useState<FilterPeriod>("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filtered = useMemo(
    () => filterMessages(messages, filter),
    [messages, filter]
  );

  // Group filtered messages by calendar day for separators
  const groups = useMemo(() => {
    const result: Array<{ label: string; items: Message[] }> = [];
    let currentLabel = "";

    for (const msg of filtered) {
      const label = msg.createdAt ? dayLabel(msg.createdAt) : "Just now";
      if (label !== currentLabel) {
        result.push({ label, items: [msg] });
        currentLabel = label;
      } else {
        result[result.length - 1].items.push(msg);
      }
    }

    return result;
  }, [filtered]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filtered]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      const trimmed = userMessage.trim();
      if (!trimmed || isLoading) return;

      const now = new Date().toISOString();
      const userMsg: Message = { role: "user", content: trimmed, createdAt: now };
      const nextMessages = [...messages, userMsg];

      setMessages(nextMessages);
      setInput("");
      setIsLoading(true);
      // Reset filter to "all" so the new message is always visible
      setFilter("all");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "" },
      ]);

      let finalAssistantContent = "";

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.slice(-MAX_LLM_CONTEXT),
          }),
        });

        if (!response.ok) throw new Error(`Request failed (${response.status})`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Response body unavailable");

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          finalAssistantContent += decoder.decode(value, { stream: true });
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: finalAssistantContent },
          ]);
        }

        const assistantTs = new Date().toISOString();
        // Stamp the completed assistant message with its finish time
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            role: "assistant",
            content: finalAssistantContent,
            createdAt: assistantTs,
          },
        ]);

        if (finalAssistantContent) {
          await appendMessages([
            { role: "user", content: trimmed, createdAt: now },
            { role: "assistant", content: finalAssistantContent, createdAt: assistantTs },
          ]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            role: "assistant",
            content: `Sorry, I ran into an error: ${msg}. Please try again.`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
        textareaRef.current?.focus();
      }
    },
    [messages, isLoading]
  );

  const handleClear = async () => {
    if (isLoading || isClearing) return;
    setIsClearing(true);
    try {
      await clearChatHistory();
      setMessages([]);
      setFilter("all");
    } finally {
      setIsClearing(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar (filter + clear) ── */}
      {hasMessages && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line-subtle/10">
          {/* Period filter pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {(Object.keys(FILTER_LABELS) as FilterPeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => setFilter(period)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === period
                    ? "bg-primary/15 text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                {FILTER_LABELS[period]}
              </button>
            ))}
          </div>

          {/* Clear history */}
          <button
            onClick={handleClear}
            disabled={isLoading || isClearing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            {isClearing ? "Clearing…" : "Clear"}
          </button>
        </div>
      )}

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {!hasMessages ? (
          /* Empty state — full history is empty */
          <div className="flex flex-col items-center justify-center h-full gap-8 text-center px-4">
            <div>
              <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-7 h-7 text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-on-surface">
                Your Financial Assistant
              </h2>
              <p className="text-sm text-on-surface-variant mt-2 max-w-sm mx-auto">
                Ask me anything about your money — spending, savings,
                investments, and more.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  disabled={isLoading}
                  className="text-left px-4 py-3 rounded-xl bg-surface-container text-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border border-line-subtle/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          /* Filter active but no results */
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-10 h-10 text-on-surface-variant/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-sm text-on-surface-variant">
              No messages in this period
            </p>
            <button
              onClick={() => setFilter("all")}
              className="text-xs text-primary hover:underline"
            >
              Show all messages
            </button>
          </div>
        ) : (
          /* Grouped messages with day separators */
          groups.map((group, gi) => (
            <div key={gi} className="space-y-4">
              <DateSeparator label={group.label} />
              {group.items.map((msg, mi) => {
                const globalIndex =
                  groups
                    .slice(0, gi)
                    .reduce((acc, g) => acc + g.items.length, 0) + mi;
                return (
                  <MessageBubble
                    key={globalIndex}
                    message={msg}
                    isStreaming={
                      isLoading &&
                      globalIndex === filtered.length - 1 &&
                      msg.role === "assistant"
                    }
                  />
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="shrink-0 px-4 pb-4 pt-3 border-t border-line-subtle/10">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2.5 items-end bg-surface-container rounded-2xl border border-line-subtle/10 px-4 py-3 focus-within:border-primary/30 transition-colors"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask about your finances…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none min-h-[24px] max-h-[160px] leading-relaxed disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
            aria-label="Send message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
        <p className="text-xs text-on-surface-variant mt-2 text-center">
          Enter to send&nbsp;·&nbsp;Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
