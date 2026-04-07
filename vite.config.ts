import path from "node:path";
import type { Plugin } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import devtoolsJson from "vite-plugin-devtools-json";
import tailwindcss from "@tailwindcss/vite";

// Prisma 7 generates ?module WASM imports (Cloudflare Workers syntax).
// Vite can't parse them — mark them external so wrangler handles them instead.
// Path must be relative to build/server/assets/ (where the importing chunk lives).
const cloudflareWasmModule: Plugin = {
  name: "cloudflare-wasm-module",
  enforce: "pre",
  resolveId(id) {
    if (id.includes(".wasm") && id.endsWith("?module")) {
      return {
        id: "../../../app/db/internal/query_compiler_fast_bg.wasm?module",
        external: true,
      };
    }
  },
};

export default defineConfig((config) => {
  return {
    resolve: {
      alias:
        config.mode === "development"
          ? { "~/db.server": path.resolve(process.cwd(), "app/db.local.server.ts") }
          : undefined,
    },
    // In the browser bundle, swap ~/db/client for the browser-safe Prisma stub
    // (no PrismaClient, no WASM) — mirrors the .prisma/client/index-browser
    // alias pattern used in sam-barber-files for Prisma v6.
    environments: {
      client: {
        resolve: {
          alias: {
            "~/db/client": path.resolve(process.cwd(), "app/db/browser.ts"),
          },
        },
      },
    },
    ssr: {
      resolve: {
        conditions: ["workerd", "browser"],
        externalConditions: ["workerd", "browser"],
      },
    },
    server: {
      port: 3000,
    },
    plugins: [
      cloudflareWasmModule,
      tailwindcss(),
      reactRouter(),
      tsconfigPaths(),
      devtoolsJson(),
    ],
  };
});
