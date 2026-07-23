"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { apiJson } from "@/lib/hooks";
import type { PublicUser } from "@/lib/types";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [email, setEmail] = useState("librarian@shelfwalk.app");
  const [password, setPassword] = useState("librarian123");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson<{ user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-form fade-up fade-up-delay-2" onSubmit={onSubmit}>
      {error && (
        <div className="mb-4 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="mb-3">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="field"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-5">
        <label className="label" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            className="field pr-20"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--jade-deep)]"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in to desk"}
      </button>

      <p className="mt-4 text-center text-xs text-[color-mix(in_srgb,var(--ink)_55%,transparent)]">
        Demo: librarian@shelfwalk.app / librarian123
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-atmosphere" aria-hidden />
      <div className="login-shelves" aria-hidden />

      <section className="login-stage">
        <div className="login-copy fade-up">
          <p className="brand login-brand">Shelfwalk</p>
          <h1 className="display login-headline">Sign in to the circulation desk</h1>
          <p className="login-subcopy">
            Manage catalog, members, loans, and due-date alerts from one quiet workspace.
          </p>
        </div>

        <div className="login-panel panel fade-up fade-up-delay-1">
          <Suspense fallback={<p className="text-sm">Loading sign-in…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
