import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/server-error";
import { requireCapability, requireSession } from "@/lib/authz";
import { db, supabase } from "@/lib/supabase";
import {
  getCirculationSettings,
  invalidateCirculationSettings,
  parseCirculationSetting,
} from "@/lib/settings";

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;
  try {
    return NextResponse.json(await getCirculationSettings());
  } catch (error) {
    return serverError("GET /api/settings/circulation", error, { error: "Failed to load settings" }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireCapability(
    "staff.manage",
    "Only admins can modify settings."
  );
  if (!user) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Send an object of settings." }, { status: 400 });
  }

  const updates = [];
  for (const [key, value] of Object.entries(body)) {
    const parsed = parseCirculationSetting(key, value);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    updates.push({
      key: `circulation.${parsed.key}`,
      value: parsed.value,
      category: "circulation",
      updated_by: user.id,
    });
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "No settings to save." }, { status: 400 });
  }

  try {
    const { error } = await db(supabase).from("settings").upsert(updates);
    if (error) throw new Error(error.message);
    invalidateCirculationSettings();
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("PATCH /api/settings/circulation", error, { error: "Failed to update settings" }, 500);
  }
}
