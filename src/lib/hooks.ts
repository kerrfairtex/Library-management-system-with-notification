"use client";

import { useCallback, useEffect, useState } from "react";

/** Pass a null url to hold off until the caller knows what to request. */
export function useApi<T>(url: string | null, refreshKey = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { data, loading, error, reload, setData };
}

function getCsrfToken(): string | null {
  // Try cookie first, then check if we have it in a meta tag
  if (typeof document !== "undefined") {
    const cookieMatch = document.cookie.match(/csrf_token=([^;]+)/);
    if (cookieMatch) return cookieMatch[1];
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) return metaTag.getAttribute("content");
  }
  return null;
}

export async function apiJson<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> || {}),
  };
  
  // Add CSRF token for mutating requests
  if (options?.method && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method.toUpperCase())) {
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body as T;
}
