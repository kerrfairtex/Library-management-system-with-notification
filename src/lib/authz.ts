import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canAccess, type AppCapability } from "./permissions";
import { SESSION_COOKIE, readSessionUserId } from "./session";
import { getPublicUserById } from "./store";
import type { PublicUser } from "./types";

/**
 * Authorization for route handlers.
 *
 * src/proxy.ts only verifies that the session cookie carries a valid
 * signature. It never loads the user, so a cookie for a deleted account still
 * passes and every signed-in user reaches every route regardless of role.
 * These helpers close both gaps at the point where it matters: they read the
 * account from the database on each call, so a deleted user and a demoted
 * admin both lose access immediately.
 */

type Denied = { user: null; response: NextResponse };
type Allowed = { user: PublicUser; response: null };

export async function requireSession(): Promise<Allowed | Denied> {
  const jar = await cookies();
  const userId = await readSessionUserId(jar.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return {
      user: null,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const user = await getPublicUserById(userId);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "This account no longer exists." },
        { status: 401 }
      ),
    };
  }

  return { user, response: null };
}

export async function requireAdmin(): Promise<Allowed | Denied> {
  return requireCapability("staff.manage", "Only an admin can manage user accounts.");
}

export async function requireCapability(
  capability: AppCapability,
  message = "You do not have access to this area."
): Promise<Allowed | Denied> {
  const session = await requireSession();
  if (!session.user) return session;

  if (!canAccess(session.user, capability)) {
    return {
      user: null,
      response: NextResponse.json({ error: message }, { status: 403 }),
    };
  }

  return session;
}
