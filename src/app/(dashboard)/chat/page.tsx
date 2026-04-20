import type { Metadata } from "next";
import { getChatHistory } from "@/actions/chat";
import { ChatInterface } from "@/components/chat/ChatInterface";

export const metadata: Metadata = {
  title: "AI Assistant | Luminescent Ledger",
  description: "Ask your personal AI financial assistant anything about your money.",
};

export default async function ChatPage() {
  // Load persisted history on the server so there's no loading flash
  const initialMessages = await getChatHistory();

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-line-subtle/10 shrink-0">
        <h1 className="text-2xl font-bold text-on-surface">AI Assistant</h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Powered by GPT-4o · Ask anything about your finances
        </p>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <ChatInterface initialMessages={initialMessages} />
      </div>
    </div>
  );
}
