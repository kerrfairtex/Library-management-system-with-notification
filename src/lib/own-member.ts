import { db, supabase } from "@/lib/supabase";

/** Resolve the members.id for a signed-in user's email.
 *  Escapes LIKE wildcards (% _ \) so one email cannot match another. */
export async function getOwnMemberId(email: string): Promise<string | null> {
  const safe = email.trim().replace(/[\\%_]/g, "\\$&");
  const { data } = await db(supabase)
    .from("members")
    .select("id")
    .ilike("email", safe)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
