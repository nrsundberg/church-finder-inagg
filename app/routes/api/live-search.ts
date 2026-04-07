import { getPrisma } from "~/db.server";
import { searchChurches } from "~/services/search.server";
import type { Route } from "./+types/live-search";

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function enc(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lng = parseFloat(url.searchParams.get("lng") ?? "");
  const r = parseInt(url.searchParams.get("r") ?? "25", 10);
  const min = parseInt(url.searchParams.get("min") ?? "1", 10);

  if (isNaN(lat) || isNaN(lng)) {
    return new Response("Bad params", { status: 400 });
  }

  const d1 = context.cloudflare.env.D1_DATABASE;
  const prisma = getPrisma(context);

  const latDelta = r / 69;
  const lngDelta = r / (69 * Math.cos((lat * Math.PI) / 180));

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(new TextEncoder().encode(enc(event, data)));

      try {
        // 1. Send cached D1 results immediately + log the search
        const [cached] = await Promise.all([
          searchChurches(prisma, lat, lng, r, min),
          prisma.searchLog.create({ data: { lat, lng, radiusMiles: r } }),
        ]);
        send("update", { churches: cached });

        // 2. Check per-source freshness (SBC is cron-only, not live-fetched)
        const cutoff = new Date(Date.now() - STALE_MS).toISOString();
        const stale = await d1
          .prepare(
            `SELECT
               MAX(CASE WHEN isNineMarks = 1 THEN updatedAt END) AS lastNineMarks,
               MAX(CASE WHEN isFounders  = 1 THEN updatedAt END) AS lastFounders
             FROM "Church"
             WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
          )
          .bind(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)
          .first<{ lastNineMarks: string | null; lastFounders: string | null }>();

        const nineMarksStale = !stale?.lastNineMarks || stale.lastNineMarks < cutoff;
        const foundersStale  = !stale?.lastFounders  || stale.lastFounders  < cutoff;

        if (!nineMarksStale && !foundersStale) {
          send("done", {});
          controller.close();
          return;
        }

        // Dynamic imports so Prisma WASM stays in a lazy chunk
        const [{ scrapeNineMarksByBounds }, { scrapeFoundersByCenter }, { batchUpsertChurches }] =
          await Promise.all([
            import("~/services/scrapers/nine-marks"),
            import("~/services/scrapers/founders"),
            import("~/services/scrapers/orchestrator"),
          ]);

        // 3. Live-fetch stale sources in parallel using a 1.5× tile for better cache coverage
        const cacheMult = 1.5;
        const ld = (r * cacheMult) / 69;
        const lgd = (r * cacheMult) / (69 * Math.cos((lat * Math.PI) / 180));

        const fetches: Promise<void>[] = [];

        if (nineMarksStale) {
          fetches.push(
            (async () => {
              send("status", { source: "9marks", loading: true });
              const churches = await scrapeNineMarksByBounds(lat + ld, lng + lgd, lat - ld, lng - lgd);
              if (churches.length > 0) {
                await batchUpsertChurches(d1, churches);
                send("update", { churches: await searchChurches(prisma, lat, lng, r, min) });
              }
              send("status", { source: "9marks", loading: false });
            })(),
          );
        }

        if (foundersStale) {
          fetches.push(
            (async () => {
              send("status", { source: "founders", loading: true });
              const churches = await scrapeFoundersByCenter(lat, lng, r * cacheMult);
              if (churches.length > 0) {
                await batchUpsertChurches(d1, churches);
                send("update", { churches: await searchChurches(prisma, lat, lng, r, min) });
              }
              send("status", { source: "founders", loading: false });
            })(),
          );
        }

        await Promise.allSettled(fetches);
      } catch (err) {
        console.error("live-search error:", err);
      }

      send("done", {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
