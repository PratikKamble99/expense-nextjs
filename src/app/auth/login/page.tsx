"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";

const ERROR_MESSAGES: Record<string, string> = {
  NoToken: "No verification token provided.",
  InvalidToken: "Invalid verification token.",
  ExpiredToken: "Verification token has expired.",
  EMAIL_NOT_VERIFIED: "Please verify your email before logging in.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isVerified = searchParams.get("verified") === "true";
  const errorParam = searchParams.get("error") ?? "";
  const paramError = ERROR_MESSAGES[errorParam];

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    await signIn.email(
      { email, password },
      {
        onSuccess: () => router.push("/dashboard"),
        onError: (ctx) => {
          setError(ctx.error.message || "Login failed");
          setLoading(false);
        },
      }
    );
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);

    await signIn.social(
      { provider: "google", callbackURL: "/dashboard" },
      {
        onError: (ctx) => {
          setError(ctx.error.message || "Google login failed");
          setLoading(false);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Subtle gradient backdrop */}
      <div className="absolute inset-0 bg-primary-gradient opacity-[0.03] pointer-events-none" />

      <div className="w-full max-w-md relative">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-gradient shadow-primary-glow-lg mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Luminescent Ledger</h1>
          <p className="text-sm text-on-surface-variant mt-1">Sign in to manage your finances</p>
        </div>

        <div className="card-elevated p-8 space-y-5">
          {/* Status banners */}
          {isVerified && (
            <div className="p-3.5 bg-tertiary/10 border border-tertiary/20 rounded-xl">
              <p className="text-tertiary text-sm font-medium">Email verified — you can now sign in.</p>
            </div>
          )}
          {(error || paramError) && (
            <div className="p-3.5 bg-error/10 border border-error/20 rounded-xl">
              <p className="text-error text-sm font-medium">{error || paramError}</p>
            </div>
          )}

          {/* Google Sign In */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface-container text-on-surface font-medium text-sm border border-line-subtle/20 hover:bg-surface-container-high hover:border-line-subtle/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line-subtle/15" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-surface-container-high text-on-surface-variant">or</span>
            </div>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="w-full btn-primary">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-on-surface-variant">
            No account?{" "}
            <Link href="/auth/register" className="text-primary font-medium hover:text-primary-container transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
