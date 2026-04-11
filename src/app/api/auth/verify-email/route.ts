import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/auth/login?error=NoToken", req.url));
    }

    // Find verification token
    const verification = await prisma.verification.findFirst({
      where: { value: token },
    });

    if (!verification) {
      return NextResponse.redirect(
        new URL("/auth/login?error=InvalidToken", req.url)
      );
    }

    // Check if token is expired
    if (verification.expiresAt < new Date()) {
      return NextResponse.redirect(
        new URL("/auth/login?error=ExpiredToken", req.url)
      );
    }

    // Mark user as verified
    await prisma.user.update({
      where: { id: verification.userId! },
      data: { emailVerified: true },
    });

    // Delete verification token
    await prisma.verification.deleteMany({
      where: { value: token },
    });

    return NextResponse.redirect(
      new URL("/auth/login?verified=true", req.url)
    );
  } catch (error) {
    return NextResponse.redirect(
      new URL("/auth/login?error=VerificationFailed", req.url)
    );
  }
}
