import { NextResponse } from "next/server";
import { InputError } from "@/lib/academic";
import { requireSession } from "@/lib/authz";
import { EMAIL_PREF_OPTIONS, applyPrefsUpdate, wantsEmail } from "@/lib/notification-prefs";
import { serverError } from "@/lib/server-error";
import { getMemberByUser, getNotificationPrefs, saveNotificationPrefs } from "@/lib/store";

/*
 * GET /api/my-notifications/preferences → the signed-in member's e-mail settings
 * PUT /api/my-notifications/preferences {email: {due_soon: false, …}}
 *
 * Own settings only: the member comes from the session, never the request.
 * In-app notices are always on; this only decides what is also e-mailed.
 */

function view(prefs: { emailOff: string[] }, available: boolean) {
  return {
    available,
    options: EMAIL_PREF_OPTIONS.map((o) => ({
      type: o.type,
      label: o.label,
      description: o.description,
      required: o.required === true,
      email: wantsEmail(prefs, o.type),
    })),
  };
}

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;
  try {
    const me = await getMemberByUser(user);
    if (!me) return NextResponse.json({ error: "No library membership found for your account." }, { status: 404 });
    const { prefs, available } = await getNotificationPrefs(me.id);
    return NextResponse.json(view(prefs, available));
  } catch (error) {
    return serverError("GET /api/my-notifications/preferences", error, { error: "Failed to load your settings." }, 500);
  }
}

export async function PUT(request: Request) {
  const { user, response } = await requireSession();
  if (!user) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const me = await getMemberByUser(user);
    if (!me) return NextResponse.json({ error: "No library membership found for your account." }, { status: 404 });
    const { prefs } = await getNotificationPrefs(me.id);
    const next = applyPrefsUpdate(prefs, body);
    if (!next.ok) return NextResponse.json({ error: next.error }, { status: 400 });
    await saveNotificationPrefs(me.id, next.prefs);
    return NextResponse.json(view(next.prefs, true));
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverError("PUT /api/my-notifications/preferences", error, { error: "Failed to save your settings." }, 500);
  }
}
