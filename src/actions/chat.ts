"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
  createdAt: string; // ISO 8601
}

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

/** Load all saved messages for the current user, oldest-first. */
export async function getChatHistory(): Promise<ChatMessageData[]> {
  const session = await getSession();

  const rows = await prisma.chatMessage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Persist one or more messages (e.g. the user turn + assistant reply). */
export async function appendMessages(
  messages: ChatMessageData[]
): Promise<void> {
  const session = await getSession();

  await prisma.chatMessage.createMany({
    data: messages.map((m) => ({
      userId: session.user.id,
      role: m.role,
      content: m.content,
    })),
  });
}

/** Delete the entire history for the current user. */
export async function clearChatHistory(): Promise<void> {
  const session = await getSession();

  await prisma.chatMessage.deleteMany({
    where: { userId: session.user.id },
  });
}
