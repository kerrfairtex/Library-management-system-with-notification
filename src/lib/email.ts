/**
 * Optional e-mail copies of member notifications (Koha "notices").
 * Opt-in: both RESEND_API_KEY and EMAIL_FROM must be set, otherwise e-mail is
 * skipped and in-app notifications work exactly as before.
 * Uses Resend's HTTP API via fetch — no extra npm dependency.
 */

/** Notification types worth an e-mail to the member. */
export const EMAILED_TYPES = [
  "due_soon",
  "overdue",
  "hold_ready",
  "hold_expired",
  "borrow_request_approved",
  "borrow_request_rejected",
] as const;

export type EmailConfig = { apiKey: string; from: string; siteUrl: string | null };

export function emailConfig(env: Record<string, string | undefined>): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  const site = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || null;
  return { apiKey, from, siteUrl: site };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function isPlausibleEmail(addr: string | null | undefined): addr is string {
  return typeof addr === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.trim());
}

export function buildNoticeEmail(
  n: { title: string; message: string },
  memberName: string,
  siteUrl: string | null
) {
  const link = siteUrl ? `${siteUrl}/my-loans` : null;
  const greeting = memberName ? `Hi ${memberName},` : "Hello,";
  const text = [
    greeting,
    "",
    n.message,
    "",
    link ? `View your loans: ${link}` : "",
    "— TRAC Library",
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");
  const html =
    `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(n.message)}</p>` +
    (link ? `<p><a href="${escapeHtml(link)}">View your loans</a></p>` : "") +
    `<p>— TRAC Library</p>`;
  return { subject: `TRAC Library: ${n.title}`, text, html };
}

export async function sendEmail(
  config: EmailConfig,
  to: string,
  mail: { subject: string; text: string; html: string },
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.from, to: [to], ...mail }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Email provider returned HTTP ${res.status}`);
}
