import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "./prisma";
import { sendLoginAlertEmail, sendVerificationEmail } from "./email";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    async sendVerificationEmail({ email, url }) {
      if (!url) {
        console.error("Verification URL is undefined");
        throw new Error("Verification URL is undefined");
      }
      const token = url.split("token=")[1];
      if (!token) throw new Error("No token provided");

      await sendVerificationEmail(email, token);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.AUTH_GOOGLE_ID || "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET || "",
    },
  },
  hooks: {
    async signUp({ user }) {
      if (!user.id) return;

      // Create default BankAccount for new users
      const existingAccount = await prisma.bankAccount.findFirst({
        where: { userId: user.id },
      });

      if (!existingAccount) {
        await prisma.bankAccount.create({
          data: {
            userId: user.id,
            name: "Default Account",
            isDefault: true,
            balance: 0,
            currency: "USD",
          },
        });
      }
    },
    async signIn({ user }) {
      if (!user.email) return;

      // Determine provider (if signIn via social provider)
      const account = await prisma.account.findFirst({
        where: { userId: user.id },
      });

      const provider = account?.providerId || "Email";

      // Send login alert email
      await sendLoginAlertEmail(user.email, user.name || "User", provider);
    },
  },
});
