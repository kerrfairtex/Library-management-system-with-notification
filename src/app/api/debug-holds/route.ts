import { NextResponse } from "next/server";
import { supabase, db } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bookId = url.searchParams.get("bookId");
    const memberId = url.searchParams.get("memberId");
    
    const { data: allHolds, error: allError } = await db(supabase)
      .from("holds")
      .select("*");
    
    let specific = null;
    if (bookId && memberId) {
      const { data, error } = await db(supabase)
        .from("holds")
        .select("*")
        .eq("book_id", bookId)
        .eq("member_id", memberId)
        .eq("kind", "borrow_request")
        .in("status", ["pending", "ready", "approved"]);
      specific = { count: data?.length, data, error: error?.message };
    }
    
    const { data: members, error: mError } = await db(supabase)
      .from("members")
      .select("*");
    
    const { data: users, error: uError } = await db(supabase)
      .from("users")
      .select("id, email, role, status");
    
    return NextResponse.json({
      all_holds_count: allHolds?.length || 0,
      all_holds_error: allError?.message,
      all_holds: allHolds || [],
      specific_check: specific,
      members_count: members?.length || 0,
      members: members || [],
      members_error: mError?.message,
      users_count: users?.length || 0,
      users: users || [],
      users_error: uError?.message,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
