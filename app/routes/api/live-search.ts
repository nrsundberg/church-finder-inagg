import { getPrisma } from "~/db.server";
import { searchChurches } from "~/services/search.server";
import type { Route } from "./+types/live-search";

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_RADIUS_MILES = 0.5;
const MAX_RADIUS_MILES = 100;
const DEFAULT_RADIUS_MILES = 25;
const MIN_SOURCE_COUNT = 1;
const MAX_SOURCE_COUNT = 3;
const DEFAULT_SOURCE_COUNT = 1;
const MIN_LOG_GRID_DEGREES = 0.1;
const MAX_LOG_GRID_DEGREES = 1;
const LONGITUDE_DIVISOR_FLOOR = 0.01;
const LIVE_REFRESH_WINDOW_MS = 60 * 1000;
const LIVE_REFRESH_LIMIT = 10;
const LIVE_REFRESH_TILE_DEGREES = 0.25;

// Best-effort per-isolate guardrails to reduce duplicate live refresh fan-out.
const liveRefreshesByIp = new Map<string, number[]>();
const inFlightRefreshes = new Map<string, Promise<void>>();

function enc(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseFiniteNumber(raw: string | null): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function milesPerLongitudeDegree(lat: number): number {
  const cos = Math.cos((lat * Math.PI) / 180);
  return 69 * Math.max(Math.abs(cos), LONGITUDE_DIVISOR_FLOOR);
}

function quantize(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(4));
}

function getClientIp(request: Request): string {
  const cfIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cfIp) return cfIp;

  const forwardedIp = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwardedIp || "unknown";
}

function allowLiveRefresh(ip: string, now = Date.now()): boolean {
  const recent = (liveRefreshesByIp.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < LIVE_REFRESH_WINDOW_MS,
  );

  if (recent.length >= LIVE_REFRESH_LIMIT) {
    if (recent.length > 0) {
      liveRefreshesByIp.set(ip, recent);
    } else {
      liveRefreshesByIp.delete(ip);
    }
    return false;
  }

  recent.push(now);
  liveRefreshesByIp.set(ip, recent);
  return true;
}

function getOrStartRefresh(key: string, work: () => Promise<void>): Promise<void> {
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;

  let promise: Promise<void>;
  promise = work().finally(() => {
    if (inFlightRefreshes.get(key) === promise) {
      inFlightRefreshes.delete(key);
    }
  });
  inFlightRefreshes.set(key, promise);
  return promise;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const rawLat = parseFiniteNumber(url.searchParams.get("lat"));
  const rawLng = parseFiniteNumber(url.searchParams.get("lng"));
  const rawRadius = parseFiniteNumber(url.searchParams.get("r"));
  const rawMin = parseFiniteNumber(url.searchParams.get("min"));

  if (
    rawLat === null ||
    rawLng === null ||
    rawLat < -90 ||
    rawLat > 90 ||
    rawLng < -180 ||
    rawLng > 180
  ) {
    return Response.json({ error: "Invalid search coordinates" }, { status: 400 });
  }

  const lat = rawLat;
  const lng = rawLng;
  const r = clamp(rawRadius ?? DEFAULT_RADIUS_MILES, MIN_RADIUS_MILES, MAX_RADIUS_MILES);
  const min = clamp(Math.trunc(rawMin ?? DEFAULT_SOURCE_COUNT), MIN_SOURCE_COUNT, MAX_SOURCE_COUNT);
  const clientIp = getClientIp(request);

  const d1 = context.cloudflare.env.D1_DATABASE;
  const prisma = getPrisma(context);

  const latDelta = r / 69;
  const lngDelta = r / milesPerLongitudeDegree(lat);
  const logLatStep = clamp(r / 69, MIN_LOG_GRID_DEGREES, MAX_LOG_GRID_DEGREES);
  const logLngStep = clamp(r / milesPerLongitudeDegree(lat), MIN_LOG_GRID_DEGREES, MAX_LOG_GRID_DEGREES);
  const loggedLat = quantize(lat, logLatStep);
  const loggedLng = quantize(lng, logLngStep);
  const refreshKey = [
    quantize(lat, LIVE_REFRESH_TILE_DEGREES),
    quantize(lng, LIVE_REFRESH_TILE_DEGREES),
    Number((Math.round(r * 2) / 2).toFixed(1)),
  ].join(":");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(enc(event, data)));
        } catch (err) {
          console.error("live-search stream send error:", err);
        }
      };
      const close = () => {
        try {
          controller.close();
        } catch (err) {
          console.error("live-search stream close error:", err);
        }
      };

      try {
        // 1. Send cached D1 results immediately + log the search
        const [cached] = await Promise.all([
          searchChurches(prisma, lat, lng, r, min),
          prisma.searchLog
            .create({
              data: {
                lat: loggedLat,
                lng: loggedLng,
                radiusMiles: Math.max(1, Math.ceil(r)),
              },
            })
            .catch((err) => {
              console.error("search-log error:", err);
            }),
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
        const foundersStale = !stale?.lastFounders || stale.lastFounders < cutoff;

        if (!nineMarksStale && !foundersStale) {
          send("done", {});
          close();
          return;
        }

        const existingRefresh = inFlightRefreshes.get(refreshKey);
        if (existingRefresh) {
          await existingRefresh;
          send("update", { churches: await searchChurches(prisma, lat, lng, r, min) });
        } else if (!allowLiveRefresh(clientIp)) {
          console.warn("live-search refresh rate-limited", {
            refreshKey,
            lat: loggedLat,
            lng: loggedLng,
          });
        } else {
          await getOrStartRefresh(refreshKey, async () => {
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
            const lgd = (r * cacheMult) / milesPerLongitudeDegree(lat);

            const fetches: Promise<void>[] = [];

            if (nineMarksStale) {
              fetches.push(
                (async () => {
                  send("status", { source: "9marks", loading: true });
                  try {
                    const churches = await scrapeNineMarksByBounds(
                      lat + ld,
                      lng + lgd,
                      lat - ld,
                      lng - lgd,
                    );
                    if (churches.length > 0) {
                      await batchUpsertChurches(d1, churches);
                      send("update", { churches: await searchChurches(prisma, lat, lng, r, min) });
                    }
                  } catch (err) {
                    console.error("9marks live-refresh error:", err);
                  } finally {
                    send("status", { source: "9marks", loading: false });
                  }
                })(),
              );
            }

            if (foundersStale) {
              fetches.push(
                (async () => {
                  send("status", { source: "founders", loading: true });
                  try {
                    const churches = await scrapeFoundersByCenter(lat, lng, r * cacheMult);
                    if (churches.length > 0) {
                      await batchUpsertChurches(d1, churches);
                      send("update", { churches: await searchChurches(prisma, lat, lng, r, min) });
                    }
                  } catch (err) {
                    console.error("founders live-refresh error:", err);
                  } finally {
                    send("status", { source: "founders", loading: false });
                  }
                })(),
              );
            }

            await Promise.allSettled(fetches);

            // 4. Enrich SBC churches that haven't been profiled yet (phone IS NULL = not enriched)
            try {
              const { enrichSbcChurches } = await import("~/services/scrapers/sbc-profile");

              const enrichCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
              const unenriched = await d1
                .prepare(
                  `SELECT c.sbcId, c.sbcUrl FROM "Church" c
                   LEFT JOIN "ChurchPageCache" p ON p.sbcId = c.sbcId AND p.fetchedAt > ?
                   WHERE c.lat BETWEEN ? AND ? AND c.lng BETWEEN ? AND ?
                     AND c.isSbc = 1 AND c.sbcId IS NOT NULL AND c.sbcUrl IS NOT NULL
                     AND p.sbcId IS NULL
                   LIMIT 20`,
                )
                .bind(enrichCutoff, lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)
                .all<{ sbcId: string; sbcUrl: string }>();

              if (unenriched.results.length > 0) {
                send("status", { source: "sbc details", loading: true });
                try {
                  for await (const _updated of enrichSbcChurches(d1, unenriched.results)) {
                    send("update", { churches: await searchChurches(prisma, lat, lng, r, min) });
                  }
                } finally {
                  send("status", { source: "sbc details", loading: false });
                }
              }
            } catch (err) {
              console.error("sbc-enrich error:", err);
            }
          });
        }
      } catch (err) {
        console.error("live-search error:", err);
      }

      send("done", {});
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
