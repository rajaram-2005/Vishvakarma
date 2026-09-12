/**
 * RAVANA · route helper — the app is anonymous-first: the first request invents a uid and the
 * response stamps the `aetheris_uid` cookie (same pattern as /api/agents/run) so later RAVANA
 * calls resolve to the same owner.
 */
import { uidCookie } from "@/aetheris/lib/user";

export function stampUid<T extends { headers: Headers }>(res: T, isNew: boolean, uid: string): T {
  if (isNew) {
    const c = uidCookie(uid);
    res.headers.append("Set-Cookie", `${c.name}=${c.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${c.maxAge}`);
  }
  return res;
}
