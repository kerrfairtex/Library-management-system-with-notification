"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/hooks";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    async function run() {
      const supabaseBrowser = getSupabaseBrowserClient();
      if (!supabaseBrowser) {
        setError("Google sign-in isn't configured on this deployment.");
        return;
      }

      const oauthError =
        searchParams.get("error_description") || searchParams.get("error");
      if (oauthError) {
        setError(oauthError);
        return;
      }

      let nextPath = "/";
      try {
        const stored = sessionStorage.getItem("trac.auth.next");
        if (stored?.startsWith("/")) nextPath = stored;
        sessionStorage.removeItem("trac.auth.next");
      } catch {
        // ignore storage errors
      }
      if (searchParams.get("next")?.startsWith("/")) {
        nextPath = searchParams.get("next")!;
      }

      const code = searchParams.get("code");
      let accessToken: string | undefined;

      if (code) {
        const { data, error: exchangeError } =
          await supabaseBrowser.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError || !data.session) {
          setError(exchangeError?.message ?? "Could not complete Google sign-in.");
          return;
        }
        accessToken = data.session.access_token;
      } else {
        const { data, error: sessionError } = await supabaseBrowser.auth.getSession();
        if (cancelled) return;
        if (sessionError || !data.session) {
          setError(sessionError?.message ?? "Could not complete Google sign-in.");
          return;
        }
        accessToken = data.session.access_token;
      }

      try {
        await apiJson("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({ accessToken }),
        });
        await supabaseBrowser.auth.signOut();
        if (cancelled) return;
        router.replace(nextPath);
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
  }, [router, searchParams]);

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
      <section className="login-stage login-callback-stage">
        <div className="login-panel">
          <div className="mb-4 flex justify-center">
            <div className="login-seal" style={{ width: "5.5rem", marginBottom: 0 }}>
              <Image
                src="/brand/trac-logo.png"
                alt="TRAC"
                width={88}
                height={88}
                className="login-seal-image"
                priority
              />
            </div>
          </div>
          {error ? (
            <>
              <div className="login-alert" role="alert">
                {error}
              </div>
              <a href="/login" className="btn btn-primary login-submit">
                Back to sign in
              </a>
            </>
          ) : (
            <p className="login-callback-copy">Completing Google sign-in…</p>
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
