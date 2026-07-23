import { NextResponse } from "next/server";
import { renewLoan, returnBook } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action as string;
    if (action === "return") {
      const loan = await returnBook(id);
      return NextResponse.json(loan);
    }
    if (action === "renew") {
      const loan = await renewLoan(id, body.extraDays ? Number(body.extraDays) : 14);
      return NextResponse.json(loan);
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update loan." },
      { status: 400 }
    );
  }
}
