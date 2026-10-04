import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("key, value")
      .eq("category", "circulation");

    if (error) throw new Error(error.message);

    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

    // Return with defaults
    const defaults = {
      circulation: {
        max_active_loans_per_member: 3,
        loan_period_days: 14,
        loan_period_options: [7, 14, 21, 30],
        max_loan_days: 60,
        overdue_fine_per_day: 5,
        pickup_window_days: 3,
        overdue_alert_cooldown_days: 4,
        due_soon_window_days: 3,
        max_renewal_days: 60,
      },
    };

    const result = { ...defaults };
    for (const [key, value] of Object.entries(settings)) {
      const parts = key.split(".");
      if (parts.length === 2 && parts[0] === "circulation") {
        const value = settings[key];
        if (typeof value === "string" && value.startsWith("[")) {
          try {
            (result.circulation as Record<string, unknown>)[parts[1]] = JSON.parse(value);
          } catch {
            // keep default
          }
        } else if (typeof value === "string" && !isNaN(Number(value))) {
          (result.circulation as Record<string, unknown>)[parts[1]] = Number(value);
        } else if (typeof value === "number") {
          (result.circulation as Record<string, unknown>)[parts[1]] = value;
        } else {
          (result.circulation as Record<string, unknown>)[parts[1]] = value;
        }
      }
    }

    return NextResponse.json(result.circulation);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireCapability(
    "staff.manage",
    "Only admins can modify settings."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const updatedBy = user.id;

    const updates = Object.entries(body).map(([key, value]) => ({
      key: `circulation.${key}`,
      value,
      category: "circulation",
      updated_by: updatedBy,
    }));

    const { error } = await supabase.from("settings").upsert(updates);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 500 }
    );
  }
}