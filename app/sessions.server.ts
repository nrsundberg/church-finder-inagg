import { createCookieSessionStorage } from "react-router";

export function getSessionStorage(secret: string, secure: boolean) {
  return createCookieSessionStorage({
    cookie: {
      name: "__admin_session",
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      secrets: [secret],
      maxAge: 60 * 60 * 8, // 8 hours
    },
  });
}
