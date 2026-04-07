import type { Route } from "./+types/scrape";

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const expectedToken = context.cloudflare.env.SCRAPE_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const source = url.searchParams.get("source") ?? "all";
  const { runScrape } = await import("~/services/scrapers/orchestrator");

  context.cloudflare.ctx.waitUntil(
    runScrape(context.cloudflare.env.D1_DATABASE, source, true),
  );

  return Response.json({ ok: true, message: `Scrape started (source: ${source})` });
}
