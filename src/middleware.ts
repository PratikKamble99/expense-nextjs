import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/dashboard", "/accounts", "/transactions", "/settings", "/reports"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (isProtected) {
    // better-auth uses "__Secure-" prefix on HTTPS (production), plain name on HTTP (dev)
    const sessionToken =
      req.cookies.get("better-auth.session_token")?.value ??
      req.cookies.get("__Secure-better-auth.session_token")?.value;
    if (!sessionToken) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/accounts/:path*", "/transactions/:path*", "/settings/:path*", "/reports/:path*"],
};
