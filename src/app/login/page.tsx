"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useState, type FormEvent } from "react";
import { apiJson } from "@/lib/hooks";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { PublicUser } from "@/lib/types";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson<{ user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      router.replace(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    setError(null);
    const supabaseBrowser = getSupabaseBrowserClient();
    if (!supabaseBrowser) {
      setError("Google sign-in isn't configured on this deployment.");
      return;
    }

    setGoogleBusy(true);
    const safeNext = nextPath.startsWith("/") ? nextPath : "/";
    try {
      sessionStorage.setItem("trac.auth.next", safeNext);
    } catch {
      // Private mode / blocked storage — callback falls back to "/".
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data, error: oauthError } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Always show Google's account picker (there is no in-app sign-up form).
        queryParams: { prompt: "select_account" },
        // We navigate ourselves so a missed auto-redirect cannot look like a no-op.
        skipBrowserRedirect: true,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleBusy(false);
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    setError("Could not start Google sign-in. Try again.");
    setGoogleBusy(false);
  }

  const locked = busy || googleBusy;

  return (
    <form className="login-form" onSubmit={onSubmit} noValidate>
      <header className="login-form-header">
        <h2 className="login-form-title">Sign in</h2>
      </header>

      {error && (
        <div
          id={errorId}
          className="login-alert"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        className="btn login-google"
        onClick={onGoogleSignIn}
        disabled={locked}
        aria-busy={googleBusy}
        aria-label="Continue with Google — opens Google account chooser"
      >
        <GoogleIcon />
        <span>{googleBusy ? "Opening Google…" : "Continue with Google"}</span>
      </button>

      <div className="login-divider" role="separator">
        <span>or</span>
      </div>

      <div className="login-field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="field"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          disabled={locked}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="name@example.com"
        />
      </div>

      <div className="login-field">
        <label className="label" htmlFor="password">
          Password
        </label>
        <div className="login-password">
          <input
            id="password"
            className="field"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            disabled={locked}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
            placeholder="Enter your password"
          />
          <button
            type="button"
            className="login-password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            disabled={locked}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary login-submit"
        disabled={locked || !email.trim() || !password}
        aria-busy={busy}
      >
        {busy ? "Signing in…" : "Sign in to desk"}
      </button>

      <div className="login-help">
        <button
          type="button"
          className="login-link"
          onClick={() => setShowForgot((v) => !v)}
          aria-expanded={showForgot}
        >
          Forgot password?
        </button>
        <span aria-hidden>·</span>
        <Link href="/about" className="login-link">
          About &amp; Privacy
        </Link>
        <span aria-hidden>·</span>
        <a
          href={(process.env.NEXT_PUBLIC_SHELF_ORIGIN ?? "https://trac-library-bookshelf.vercel.app")}
          className="login-link"
          target="_blank"
          rel="noreferrer noopener"
        >
          ← Back to 3D Bookshelf
        </a>
      </div>

      {showForgot && (
        <div className="login-forgot" role="note">
          <p>
            Password resets are handled at the library desk for security.
            Visit us or call <a href="tel:+639637130812">0963 713 0812</a> and
            a librarian will set a temporary password for you.
          </p>
        </div>
      )}
    </form>
  );
}

function LoginBrand() {
  return (
    <div className="login-copy">
      <div className="login-seal">
        <Image
          src="/brand/trac-logo.png"
          alt="Institute of Agricultural Sciences — TRAC, Bongao, Tawi-Tawi"
          width={180}
          height={180}
          priority
          className="login-seal-image"
        />
      </div>
      <p className="brand login-brand">TRAC</p>
      <p className="login-institute">Institute of Agricultural Sciences</p>
      <h1 className="display login-headline">Library desk access</h1>
      <p className="login-support">
        Catalog, circulation, and due-date alerts for Bongao, Tawi-Tawi.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-atmosphere" aria-hidden>
        <Image
          src="/brand/trac-campus.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="login-campus-photo"
        />
        <div className="login-atmosphere-veil" />
        <div className="login-atmosphere-grain" />
      </div>

      <section className="login-stage">
        <LoginBrand />
        <div className="login-panel">
          <Suspense
            fallback={<p className="login-form-subtitle">Loading sign-in…</p>}
          >
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
