/// <reference types="@cloudflare/workers-types" />

export {};

declare global {
  interface Env {
    D1_DATABASE: D1Database;
    SCRAPE_TOKEN: string;
    CF_API_TOKEN: string;
    ADMIN_PASSWORD: string;
    CF_TURNSTILE_SECRET_KEY: string;
    CF_TURNSTILE_SITE_KEY: string;
  }
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
