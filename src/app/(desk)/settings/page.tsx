"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/hooks";
import { apiJson } from "@/lib/hooks";
import { EmptyState, ErrorBanner, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

type CirculationSettings = {
  max_active_loans_per_member: number;
  loan_period_days: number;
  loan_period_options: number[];
  max_loan_days: number;
  overdue_fine_per_day: number;
  pickup_window_days: number;
  overdue_alert_cooldown_days: number;
  due_soon_window_days: number;
  max_renewal_days: number;
};

export default function SettingsPage() {
  const { data: me } = useApi<{ user: { role: string } }>("/api/auth/me");
  const isAdmin = me?.user?.role === "admin";

  const { data, loading, error, reload } = useApi<{
    max_active_loans_per_member: number;
    loan_period_days: number;
    loan_period_options: number[];
    max_loan_days: number;
    overdue_fine_per_day: number;
    pickup_window_days: number;
    overdue_alert_cooldown_days: number;
    due_soon_window_days: number;
    max_renewal_days: number;
  }>("/api/settings/circulation");

  const [form, setForm] = useState<CirculationSettings>({
    max_active_loans_per_member: 3,
    loan_period_days: 14,
    loan_period_options: [7, 14, 21, 30],
    max_loan_days: 60,
    overdue_fine_per_day: 5,
    pickup_window_days: 3,
    overdue_alert_cooldown_days: 4,
    due_soon_window_days: 3,
    max_renewal_days: 60,
  });

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        max_active_loans_per_member: data.max_active_loans_per_member ?? 3,
        loan_period_days: data.loan_period_days ?? 14,
        loan_period_options: data.loan_period_options ?? [7, 14, 21, 30],
        max_loan_days: data.max_loan_days ?? 60,
        overdue_fine_per_day: data.overdue_fine_per_day ?? 5,
        pickup_window_days: data.pickup_window_days ?? 3,
        overdue_alert_cooldown_days: data.overdue_alert_cooldown_days ?? 4,
        due_soon_window_days: data.due_soon_window_days ?? 3,
        max_renewal_days: data.max_renewal_days ?? 60,
      });
    }
  }, [data]);

  if (!isAdmin) {
    return (
      <div>
        <PageHeader
          title="Settings"
          subtitle="Only administrators can modify system settings."
        />
        <div className="panel p-4 md:p-5">
          <EmptyState
            title="Admins only"
            body="Ask an admin to change your role if you need to manage system settings."
          />
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setSuccess(false);

    try {
      await apiJson("/api/settings/circulation", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setSuccess(true);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function handleOptionsChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    try {
      const parsed = JSON.parse(e.target.value);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
        setForm((f) => ({ ...f, loan_period_options: parsed }));
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure library circulation policies and system settings."
      />

      <div className="panel p-4 md:p-5">
        {error && <ErrorBanner message={error} />}
        {formError && <ErrorBanner message={formError} />}
        {success && (
          <div className="mb-4 p-3 bg-green-50 text-green-800 rounded">
            Settings saved successfully!
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Circulation Policies</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="max_active_loans_per_member">
                  Max Active Loans per Member
                </label>
                <input
                  id="max_active_loans_per_member"
                  type="number"
                  min="1"
                  max="20"
                  className="field"
                  value={form.max_active_loans_per_member}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      max_active_loans_per_member: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum number of books a member can borrow at once.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="loan_period_days">
                  Default Loan Period (days)
                </label>
                <input
                  id="loan_period_days"
                  type="number"
                  min="1"
                  max="60"
                  className="field"
                  value={form.loan_period_days}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      loan_period_days: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Default number of days when checking out a book.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="loan_period_options">
                  Loan Period Options (JSON array)
                </label>
                <textarea
                  id="loan_period_options"
                  className="field font-mono text-sm"
                  rows={2}
                  value={JSON.stringify(form.loan_period_options)}
                  onChange={handleOptionsChange}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Available loan period options shown to librarians. Format: [7, 14, 21, 30]
                </p>
              </div>

              <div>
                <label className="label" htmlFor="max_loan_days">
                  Maximum Loan Period (days)
                </label>
                <input
                  id="max_loan_days"
                  type="number"
                  min="1"
                  max="365"
                  className="field"
                  value={form.max_loan_days}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      max_loan_days: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum allowed loan period (also limits renewals).
                </p>
              </div>

              <div>
                <label className="label" htmlFor="overdue_fine_per_day">
                  Overdue Fine per Day (₱)
                </label>
                <input
                  id="overdue_fine_per_day"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  className="field"
                  value={form.overdue_fine_per_day}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      overdue_fine_per_day: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Fine charged per day overdue, starting from day 1.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="pickup_window_days">
                  Pickup Window (days)
                </label>
                <input
                  id="pickup_window_days"
                  type="number"
                  min="1"
                  max="30"
                  className="field"
                  value={form.pickup_window_days}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      pickup_window_days: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Days to pick up an approved borrow request before it expires.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="overdue_alert_cooldown_days">
                  Overdue Alert Cooldown (days)
                </label>
                <input
                  id="overdue_alert_cooldown_days"
                  type="number"
                  min="1"
                  max="30"
                  className="field"
                  value={form.overdue_alert_cooldown_days}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      overdue_alert_cooldown_days: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Minimum days between duplicate overdue notifications.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="due_soon_window_days">
                  Due Soon Window (days)
                </label>
                <input
                  id="due_soon_window_days"
                  type="number"
                  min="1"
                  max="30"
                  className="field"
                  value={form.due_soon_window_days}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      due_soon_window_days: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Days before due date to send \"due soon\" reminder.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="max_renewal_days">
                  Max Renewal Days
                </label>
                <input
                  id="max_renewal_days"
                  type="number"
                  min="1"
                  max="60"
                  className="field"
                  value={form.max_renewal_days}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      max_renewal_days: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum additional days allowed per renewal.
                </p>
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}