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
    const { runScrape } = await import("../app/services/scrapers/orchestrator");
    ctx.waitUntil(runScrape(env.D1_DATABASE));
  },
} satisfies ExportedHandler<Env>;
