import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionUserId } from "@/lib/session";
import { getPublicUserById } from "@/lib/store";

export async function GET() {
  const jar = await cookies();
  const userId = await readSessionUserId(jar.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = await getPublicUserById(userId);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
