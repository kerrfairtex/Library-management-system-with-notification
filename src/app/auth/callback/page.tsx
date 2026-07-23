"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiJson } from "@/lib/hooks";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabaseBrowser = getSupabaseBrowserClient();
      if (!supabaseBrowser) {
        setError("Google sign-in isn't configured on this deployment.");
        return;
      }

      const { data, error: sessionError } = await supabaseBrowser.auth.getSession();
      if (cancelled) return;

      if (sessionError || !data.session) {
        setError(sessionError?.message ?? "Could not complete Google sign-in.");
        return;
      }

      try {
        await apiJson("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({ accessToken: data.session.access_token }),
        });
        await supabaseBrowser.auth.signOut();
        if (cancelled) return;
        router.replace(nextPath.startsWith("/") ? nextPath : "/");
        router.refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Google sign-in failed.");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  return (
    <main className="login-page">
      <div className="login-atmosphere" aria-hidden />
      <div className="login-shelves" aria-hidden />
      <section className="login-stage">
        <div className="login-panel panel fade-up">
          {error ? (
            <>
              <div className="mb-4 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
                {error}
              </div>
              <a href="/login" className="btn btn-primary w-full">
                Back to sign in
              </a>
            </>
          ) : (
            <p className="text-sm">Completing Google sign-in…</p>
          )}
        </div>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <CallbackInner />
    </Suspense>
  );
}
