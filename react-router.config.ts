import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  buildDirectory: "build",
  serverBuildFile: "index.js",
} satisfies Config;
