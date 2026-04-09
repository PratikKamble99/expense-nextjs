import nodemailer from "nodemailer";
import { prisma } from "./prisma";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

function baseTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18181b; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #27272a; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
          .content { padding: 20px; background: #f4f4f5; border-radius: 8px; }
          .footer { text-align: center; color: #71717a; font-size: 12px; margin-top: 20px; }
          a { color: #27272a; text-decoration: none; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Expense Tracker</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>&copy; 2026 Expense Tracker. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verifyLink = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify-email?token=${token}`;

  const html = baseTemplate(`
    <h2>Verify Your Email</h2>
    <p>Click the link below to verify your email address:</p>
    <p style="margin: 30px 0;">
      <a href="${verifyLink}" style="background: #27272a; color: white; padding: 12px 24px; border-radius: 6px; display: inline-block;">
        Verify Email
      </a>
    </p>
    <p>Or copy this link: <code>${verifyLink}</code></p>
    <p style="color: #71717a; font-size: 14px;">This link expires in 24 hours.</p>
  `);

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Verify Your Email - Expense Tracker",
      html,
    });

    await prisma.emailLog.create({
      data: {
        to: email,
        type: "verification",
        subject: "Verify Your Email - Expense Tracker",
        status: "SENT",
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await prisma.emailLog.create({
      data: {
        to: email,
        type: "verification",
        subject: "Verify Your Email - Expense Tracker",
        status: "FAILED",
        error: errorMessage,
      },
    });

    throw error;
  }
}

export async function sendLoginAlertEmail(
  email: string,
  name: string,
  provider: string
): Promise<void> {
  const html = baseTemplate(`
    <h2>New Login Detected</h2>
    <p>Hi ${name},</p>
    <p>You signed in to your Expense Tracker account using <strong>${provider}</strong>.</p>
    <p style="color: #71717a; font-size: 14px;">If this wasn't you, please secure your account immediately.</p>
  `);

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "New Login - Expense Tracker",
      html,
    });

    await prisma.emailLog.create({
      data: {
        to: email,
        type: "login_alert",
        subject: "New Login - Expense Tracker",
        status: "SENT",
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await prisma.emailLog.create({
      data: {
        to: email,
        type: "login_alert",
        subject: "New Login - Expense Tracker",
        status: "FAILED",
        error: errorMessage,
      },
    });
  }
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`;

  const html = baseTemplate(`
    <h2>Reset Your Password</h2>
    <p>Click the link below to reset your password:</p>
    <p style="margin: 30px 0;">
      <a href="${resetLink}" style="background: #27272a; color: white; padding: 12px 24px; border-radius: 6px; display: inline-block;">
        Reset Password
      </a>
    </p>
    <p>Or copy this link: <code>${resetLink}</code></p>
    <p style="color: #71717a; font-size: 14px;">This link expires in 1 hour.</p>
  `);

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Reset Your Password - Expense Tracker",
      html,
    });

    await prisma.emailLog.create({
      data: {
        to: email,
        type: "password_reset",
        subject: "Reset Your Password - Expense Tracker",
        status: "SENT",
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await prisma.emailLog.create({
      data: {
        to: email,
        type: "password_reset",
        subject: "Reset Your Password - Expense Tracker",
        status: "FAILED",
        error: errorMessage,
      },
    });

    throw error;
  }
}
