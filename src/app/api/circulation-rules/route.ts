import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { listCirculationRules, upsertCirculationRule } from "@/lib/store";

export async function GET() {
  const { user, response } = await requireCapability(
    "staff.manage",
    "Only admins can manage circulation rules."
  );
  if (!user) return response;

  try {
    const rules = await listCirculationRules();
    return NextResponse.json({ circulationRules: rules });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load circulation rules." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireCapability(
    "staff.manage",
    "Only admins can manage circulation rules."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const { memberType, loanDays, renewalDays, maxRenewals, maxLoans, finePerDay } = body;
    if (!memberType || loanDays === undefined || renewalDays === undefined || maxRenewals === undefined || maxLoans === undefined || finePerDay === undefined) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const rule = await upsertCirculationRule({
      memberType: String(memberType) as import("@/lib/types").MemberType,
      loanDays: Number(loanDays),
      renewalDays: Number(renewalDays),
      maxRenewals: Number(maxRenewals),
      maxLoans: Number(maxLoans),
      finePerDay: Number(finePerDay),
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create circulation rule." },
      { status: 500 }
    );
  }
}
