import { NextResponse } from "next/server";
import { supabase, db } from "@/lib/supabase";
import { getMemberByEmail } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bookId = url.searchParams.get("bookId") || "74b881b2-c4db-4a37-93d7-29be3dd43d65";
    const memberEmail = url.searchParams.get("memberEmail") || "student@gmail.com";
    
    const member = await getMemberByEmail(memberEmail);
    const memberId = member?.id || "unknown";
    
    // Test A: The EXACT query from createBorrowRequest
    const t1 = Date.now();
    const { data: aData, error: aErr } = await db(supabase)
      .from("holds")
      .select("id")
      .eq("book_id", bookId)
      .eq("member_id", memberId)
      .eq("kind", "borrow_request")
      .in("status", ["pending", "ready", "approved"])
      .maybeSingle();
    const t2 = Date.now();
    
    // Test B: Try calling createBorrowRequest and capture the throw
    let bResult = null;
    try {
      // Inline the EXACT same logic
      const open = await db(supabase)
        .from("holds")
        .select("id")
        .eq("book_id", bookId)
        .eq("member_id", memberId)
        .eq("kind", "borrow_request")
        .in("status", ["pending", "ready", "approved"])
        .maybeSingle();
      bResult = { open, open_is_truthy: !!open, open_is_null: open === null, open_is_undefined: open === undefined };
    } catch (e) {
      bResult = { error: e instanceof Error ? e.message : String(e) };
    }
    
    // Test C: Try the INSERT directly (to see if it succeeds or hits constraint)
    let cResult = null;
    if (url.searchParams.get("doInsert") === "true") {
      try {
        const { data, error } = await db(supabase)
          .from("holds")
          .insert({
            book_id: bookId,
            member_id: memberId,
            kind: "borrow_request",
            status: "pending",
            priority: 1,
          })
          .select("*")
          .single();
        cResult = { success: !error, data, error: error?.message, code: error?.code };
      } catch (e) {
        cResult = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    
    return NextResponse.json({
      _env: { supabase_url: process.env.SUPABASE_URL, has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
      member: member ? { id: member.id, email: member.email } : null,
      params: { bookId, memberId },
      test_a_exact_query: { data: aData, error: aErr?.message, code: aErr?.code, ms: t2 - t1 },
      test_b_inline_logic: bResult,
      test_c_insert: cResult,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
