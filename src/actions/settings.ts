"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface PreferenceData {
  currency: string;
  theme: string;
  dateFormat: string;
  txAlerts: boolean;
  monthlySummary: boolean;
  lowBalanceWarning: boolean;
}

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function getPreferences(): Promise<PreferenceData> {
  const session = await getSession();

  const pref = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id },
    update: {},
  });

  return {
    currency: pref.currency,
    theme: pref.theme,
    dateFormat: pref.dateFormat,
    txAlerts: pref.txAlerts,
    monthlySummary: pref.monthlySummary,
    lowBalanceWarning: pref.lowBalanceWarning,
  };
}

export async function updatePreferences(
  data: Partial<PreferenceData>
): Promise<PreferenceData> {
  const session = await getSession();

  const pref = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });

  return {
    currency: pref.currency,
    theme: pref.theme,
    dateFormat: pref.dateFormat,
    txAlerts: pref.txAlerts,
    monthlySummary: pref.monthlySummary,
    lowBalanceWarning: pref.lowBalanceWarning,
  };
}

export async function updateProfileName(name: string): Promise<void> {
  const session = await getSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: trimmed },
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  const result = await auth.api.changePassword({
    body: { currentPassword, newPassword, revokeOtherSessions: false },
    headers: await headers(),
  });

  if (!result) throw new Error("Failed to change password");
}
