"use client";

import { useState, type FormEvent } from "react";
import { apiJson, useApi } from "@/lib/hooks";
import { Button, Card, ErrorState, Notice } from "@/components/ui";

type PrefsView = {
  available: boolean;
  options: { type: string; label: string; description: string; required: boolean; email: boolean }[];
};

/**
 * "Notification e-mails" on My profile (patrons). Every notice stays in the
 * Notifications inbox; these switches only decide which are also e-mailed.
 */
export function NotificationPrefsCard() {
  const { data, loading, error, reload, setData } = useApi<PrefsView>("/api/my-notifications/preferences");
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const options = data?.options ?? [];
  const value = (type: string, fallback: boolean) => (type in draft ? draft[type] : fallback);
  const dirty = options.some((o) => o.type in draft && draft[o.type] !== o.email);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      const email = Object.fromEntries(options.filter((o) => !o.required).map((o) => [o.type, value(o.type, o.email)]));
      const next = await apiJson<PrefsView>("/api/my-notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({ email }),
      });
      setData(next);
      setDraft({});
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Your settings weren’t saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Notification e-mails" anchorId="notifications">
      <p className="text-muted mb-3 text-sm">
        Every notice appears in your Notifications inbox. Choose which ones we also send by e-mail.
      </p>
      {error ? (
        <ErrorState message={error} onRetry={reload} className="mb-0" />
      ) : loading ? (
        <div className="skeleton h-40 w-full" aria-busy="true" aria-label="Loading notification settings" />
      ) : (
        <form onSubmit={save} className="space-y-3">
          {saveError && <ErrorState message={saveError} />}
          {saved && <Notice>Notification settings saved.</Notice>}
          {data && !data.available && (
            <Notice tone="info">These settings aren’t switched on for the library yet. For now every notice is e-mailed.</Notice>
          )}
          <fieldset disabled={!data?.available || busy}>
            <legend className="sr-only">E-mail me about</legend>
            <ul className="divide-y divide-[var(--line)]">
              {options.map((o) => (
                <li key={o.type} className="flex items-start gap-3 py-2">
                  <input
                    id={`pref-${o.type}`}
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={o.required ? true : value(o.type, o.email)}
                    disabled={o.required}
                    aria-describedby={`pref-${o.type}-desc`}
                    onChange={(e) => {
                      setSaved(false);
                      setDraft((d) => ({ ...d, [o.type]: e.target.checked }));
                    }}
                  />
                  <label htmlFor={`pref-${o.type}`} className="min-w-0">
                    <span className="font-medium">{o.label}</span>
                    {o.required && <span className="text-muted text-xs"> · always on</span>}
                    <span id={`pref-${o.type}-desc`} className="text-muted block text-sm">
                      {o.description}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…" disabled={!dirty || !data?.available}>
              Save e-mail settings
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
