import { NextResponse } from "next/server";

/** Minimal liveness probe: no secrets, config, DB state, or stack traces. */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
