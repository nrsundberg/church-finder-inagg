// Post-deploy: set Worker usage_model to "unbound" (unlimited subrequests).
// Wrangler v4 ignores usage_model in wrangler.jsonc, so we call the CF API directly.
import { readFileSync } from "fs";
import { homedir } from "os";

const ACCOUNT_ID = "a7f63e2108d01fc6d8571772ac20f3e9";
const WORKER_NAME = "church-finder-inagg";

const cfg = readFileSync(`${homedir()}/Library/Preferences/.wrangler/config/default.toml`, "utf8");
const token = cfg.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
if (!token) throw new Error("No wrangler OAuth token found — run `wrangler login` first");

const form = new FormData();
form.append(
  "settings",
  new Blob([JSON.stringify({ usage_model: "unbound" })], { type: "application/json" }),
  "settings",
);

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/settings`,
  { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: form },
);
const data = await res.json();
if (data.success) {
  console.log("✓ usage_model=unbound");
} else {
  console.error("✗ Failed to set usage_model:", data.errors);
  process.exit(1);
}
