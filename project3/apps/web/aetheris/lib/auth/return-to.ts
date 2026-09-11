export const AUTH_RETURN_COOKIE = "aetheris_auth_return";

/** Only allow same-origin path redirects after authentication. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return "/";
  return value.slice(0, 2_000);
}

export function authReturnCookie(value: string) {
  return {
    name: AUTH_RETURN_COOKIE,
    value: safeReturnTo(value),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  };
}
