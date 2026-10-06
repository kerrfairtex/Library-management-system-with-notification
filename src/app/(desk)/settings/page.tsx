"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/hooks";
import { apiJson } from "@/lib/hooks";
import { EmptyState, ErrorBanner, PageHeader, Modal } from "@/components/ui";
import type { CirculationRule, MemberType } from "@/lib/types";

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

const defaultSettings: CirculationSettings = {
  max_active_loans_per_member: 3,
  loan_period_days: 14,
  loan_period_options: [7, 14, 21, 30],
  max_loan_days: 60,
  overdue_fine_per_day: 5,
  pickup_window_days: 3,
  overdue_alert_cooldown_days: 4,
  due_soon_window_days: 3,
  max_renewal_days: 60,
};

const emptyRuleForm = {
  memberType: "student" as MemberType,
  loanDays: 14,
  renewalDays: 7,
  maxRenewals: 2,
  maxLoans: 3,
  finePerDay: 1.00,
};

export default function SettingsPage() {
  const { data: me } = useApi<{ user: { role: string } }>("/api/auth/me");
  const isAdmin = me?.user?.role === "admin";

  const { data, loading, error, reload } = useApi<CirculationSettings>("/api/settings/circulation");
  const { data: rulesData, reload: reloadRules } = useApi<{ circulationRules: CirculationRule[] }>("/api/circulation-rules");

  const [form, setForm] = useState<CirculationSettings>(defaultSettings);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CirculationRule | null>(null);
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

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

  function openCreateRule() {
    setEditingRule(null);
    setRuleForm(emptyRuleForm);
    setRuleError(null);
    setRuleModalOpen(true);
  }

  function openEditRule(rule: CirculationRule) {
    setEditingRule(rule);
    setRuleForm({
      memberType: rule.memberType,
      loanDays: rule.loanDays,
      renewalDays: rule.renewalDays,
      maxRenewals: rule.maxRenewals,
      maxLoans: rule.maxLoans,
      finePerDay: rule.finePerDay,
    });
    setRuleError(null);
    setRuleModalOpen(true);
  }

  async function saveRule(e: FormEvent) {
    e.preventDefault();
    setRuleBusy(true);
    setRuleError(null);
    try {
      await apiJson("/api/circulation-rules", {
        method: editingRule ? "PATCH" : "POST",
        body: JSON.stringify({ memberType: ruleForm.memberType, ...ruleForm }),
      });
      setRuleModalOpen(false);
      await reloadRules();
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setRuleBusy(false);
    }
  }

  async function deleteRule(memberType: MemberType) {
    if (!window.confirm(`Delete circulation rule for ${memberType}?`)) return;
    try {
      await apiJson("/api/circulation-rules", {
        method: "DELETE",
        body: JSON.stringify({ memberType }),
      });
      await reloadRules();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure library circulation policies and system settings."
        action={
          <button type="button" className="btn btn-primary" onClick={openCreateRule}>
            Add Circulation Rule
          </button>
        }
      />

      <div className="panel p-4 md:p-5">
        {error && <ErrorBanner message={error} />}
        {formError && <ErrorBanner message={formError} />}
        {success && (
          <div className="mb-4 p-3 bg-green-50 text-green-800 rounded">
            Settings saved successfully!
          </div>
        )}

        {/* Circulation Rules Section */}
        <section className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Circulation Rules (per member type)</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member Type</th>
                  <th>Loan Days</th>
                  <th>Renewal Days</th>
                  <th>Max Renewals</th>
                  <th>Max Loans</th>
                  <th>Fine/Day (₱)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7}>Loading…</td></tr>}
                {!loading && (!rulesData?.circulationRules || rulesData.circulationRules.length === 0) && (
                  <tr><td colSpan={7}>No circulation rules configured.</td></tr>
                )}
                {rulesData?.circulationRules?.map((rule) => (
                  <tr key={rule.memberType}>
                    <td className="font-semibold capitalize">{rule.memberType}</td>
                    <td>{rule.loanDays}</td>
                    <td>{rule.renewalDays}</td>
                    <td>{rule.maxRenewals}</td>
                    <td>{rule.maxLoans}</td>
                    <td>₱{rule.finePerDay.toFixed(2)}</td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEditRule(rule)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteRule(rule.memberType)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Global Settings Section */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Global Circulation Policies</h3>

          <form onSubmit={onSubmit} className="space-y-6">
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
                  Days before due date to send "due soon" reminder.
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
        </section>
      </div>

      {/* Rule Modal */}
      <Modal
        open={ruleModalOpen}
        title={editingRule ? "Edit Circulation Rule" : "Add Circulation Rule"}
        onClose={() => setRuleModalOpen(false)}
      >
        <form onSubmit={saveRule} className="space-y-3">
          {ruleError && <ErrorBanner message={ruleError} />}
          <div>
            <label className="label" htmlFor="memberType">
              Member Type *
            </label>
            <select
              id="memberType"
              className="field"
              value={ruleForm.memberType}
              onChange={(e) => setRuleForm((f) => ({ ...f, memberType: e.target.value as MemberType }))}
              disabled={!!editingRule}
            >
              <option value="student">Student</option>
              <option value="staff">Staff</option>
              <option value="community">Community</option>
            </select>
            {editingRule && <p className="text-xs text-gray-500 mt-1">Member type cannot be changed for existing rules.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="loanDays">Loan Days *</label>
              <input
                id="loanDays"
                type="number"
                min="1"
                max="365"
                className="field"
                required
                value={ruleForm.loanDays}
                onChange={(e) => setRuleForm((f) => ({ ...f, loanDays: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="renewalDays">Renewal Days *</label>
              <input
                id="renewalDays"
                type="number"
                min="1"
                max="60"
                className="field"
                required
                value={ruleForm.renewalDays}
                onChange={(e) => setRuleForm((f) => ({ ...f, renewalDays: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="maxRenewals">Max Renewals *</label>
              <input
                id="maxRenewals"
                type="number"
                min="0"
                max="10"
                className="field"
                required
                value={ruleForm.maxRenewals}
                onChange={(e) => setRuleForm((f) => ({ ...f, maxRenewals: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="maxLoans">Max Loans *</label>
              <input
                id="maxLoans"
                type="number"
                min="1"
                max="20"
                className="field"
                required
                value={ruleForm.maxLoans}
                onChange={(e) => setRuleForm((f) => ({ ...f, maxLoans: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="finePerDay">Fine per Day (₱) *</label>
              <input
                id="finePerDay"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="field"
                required
                value={ruleForm.finePerDay}
                onChange={(e) => setRuleForm((f) => ({ ...f, finePerDay: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={() => setRuleModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={ruleBusy}>
              {ruleBusy ? "Saving…" : editingRule ? "Update Rule" : "Create Rule"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
