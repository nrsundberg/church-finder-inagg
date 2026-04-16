import { createRequestHandler, RouterContextProvider } from "react-router";

// @ts-expect-error - build output has no type declarations
const buildImport = () => import("../build/server/index.js");

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Bridge Cloudflare env bindings into process.env
    Object.assign(process.env, env);

    const context = new RouterContextProvider();
    (context as any).cloudflare = { env, ctx };

    const serverMode =
      (env as any).ENVIRONMENT === "development" ? "development" : "production";
    return createRequestHandler(buildImport, serverMode)(
      request,
      context as any,
    );
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const { runScrape, getPrismaFromD1 } = await import("../app/services/scrapers/orchestrator");

    // Check for a task queued by the admin UI
    const row = await env.D1_DATABASE
      .prepare('SELECT nonce FROM "ScrapeState" WHERE id = ?')
      .bind("pending-task")
      .first<{ nonce: string }>();

    if (row?.nonce) {
      await env.D1_DATABASE.prepare('DELETE FROM "ScrapeState" WHERE id = ?').bind("pending-task").run();

      if (row.nonce === "cross-reference") {
        const { runCrossReference } = await import("../app/services/scrapers/cross-reference");
        const prisma = getPrismaFromD1(env.D1_DATABASE);
        ctx.waitUntil(runCrossReference(prisma));
        return;
      }

      if (row.nonce === "sbc-force") {
        ctx.waitUntil(runScrape(env.D1_DATABASE, "sbc", true));
        return;
      }

      if (row.nonce === "founders-scrape") {
        ctx.waitUntil(runScrape(env.D1_DATABASE, "founders", true));
        return;
      }
    }

    // Normal daily cron
    ctx.waitUntil(runScrape(env.D1_DATABASE));
  },
} satisfies ExportedHandler<Env>;
