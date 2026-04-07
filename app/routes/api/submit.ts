import type { Route } from "./+types/submit";
import { getPrisma } from "~/db.server";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).filter(Boolean).length;
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, body, turnstileToken } = parsed as Record<string, unknown>;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return Response.json({ error: "Name is required." }, { status: 422 });
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "A valid email is required." }, { status: 422 });
  }
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return Response.json({ error: "Message is required." }, { status: 422 });
  }
  if (countWords(body) > 500) {
    return Response.json({ error: "Message exceeds 500 words." }, { status: 422 });
  }
  if (!turnstileToken || typeof turnstileToken !== "string") {
    return Response.json({ error: "Missing CAPTCHA token." }, { status: 422 });
  }

  const secretKey = context.cloudflare.env.CF_TURNSTILE_SECRET_KEY;
  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;

  const verifyForm = new FormData();
  verifyForm.append("secret", secretKey);
  verifyForm.append("response", turnstileToken);
  if (ip) verifyForm.append("remoteip", ip);

  const verifyRes = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: verifyForm });
  const verifyData = (await verifyRes.json()) as { success: boolean };

  if (!verifyData.success) {
    return Response.json({ error: "CAPTCHA verification failed. Please try again." }, { status: 422 });
  }

  const prisma = getPrisma(context);
  await prisma.submission.create({
    data: {
      name: name.trim().slice(0, 200),
      email: email.trim().slice(0, 200),
      body: body.trim(),
      ipAddress: ip ?? null,
    },
  });

  return Response.json({ ok: true }, { status: 201 });
}
