const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FETCH_TIMEOUT_MS = 8_000;
const CONCURRENCY = 3;

export interface SbcProfileData {
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

function deobfuscateEmail(encoded: string): string {
  const key = parseInt(encoded.substring(0, 2), 16);
  let email = "";
  for (let i = 2; i < encoded.length; i += 2) {
    email += String.fromCharCode(parseInt(encoded.substring(i, i + 2), 16) ^ key);
  }
  return email;
}

export function parseSbcProfileHtml(html: string): SbcProfileData {
  // ACF map marker: <div class="marker" data-lat="..." data-lng="...">
  const markerMatch = html.match(/class="marker"[^>]*data-lat="([^"]+)"[^>]*data-lng="([^"]+)"/);
  // Also try reversed attribute order
  const markerMatchRev = !markerMatch
    ? html.match(/class="marker"[^>]*data-lng="([^"]+)"[^>]*data-lat="([^"]+)"/)
    : null;

  let lat: number | null = null;
  let lng: number | null = null;
  if (markerMatch) {
    lat = parseFloat(markerMatch[1]);
    lng = parseFloat(markerMatch[2]);
  } else if (markerMatchRev) {
    lng = parseFloat(markerMatchRev[1]);
    lat = parseFloat(markerMatchRev[2]);
  }
  if (lat !== null && (isNaN(lat) || isNaN(lng!))) {
    lat = null;
    lng = null;
  }

  // Phone: standard US format
  const phoneMatch = html.match(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
  const phone = phoneMatch?.[0]?.trim() ?? null;

  // Website: first external link that isn't sbc.net or google.com
  const websiteMatch = html.match(/href="(https?:\/\/(?!churches\.sbc\.net|www\.google\.com)[^"]+)"/i);
  const website = websiteMatch?.[1] ?? null;

  // Cloudflare-obfuscated email
  const emailMatch = html.match(/\/cdn-cgi\/l\/email-protection#([a-f0-9]+)/i);
  const email = emailMatch ? deobfuscateEmail(emailMatch[1]) : null;

  return { lat, lng, phone, email, website };
}

async function fetchProfileHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { "User-Agent": "ChurchFinderInagg/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface ChurchToEnrich {
  sbcId: string;
  sbcUrl: string;
}

// Enriches SBC churches on-demand. Yields the sbcIds updated after each batch
// so the caller can stream SSE updates incrementally.
export async function* enrichSbcChurches(
  d1: D1Database,
  churches: ChurchToEnrich[],
  limit = 20,
): AsyncGenerator<string[]> {
  const toProcess = churches.slice(0, limit);
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async ({ sbcId, sbcUrl }) => {
        // Check cache
        const cached = await d1
          .prepare(`SELECT html FROM "ChurchPageCache" WHERE sbcId = ? AND fetchedAt > ?`)
          .bind(sbcId, cutoff)
          .first<{ html: string }>();

        const html = cached?.html ?? (await fetchProfileHtml(sbcUrl));
        if (!html) return null;

        // Upsert cache if we fetched fresh
        if (!cached) {
          await d1
            .prepare(
              `INSERT OR REPLACE INTO "ChurchPageCache" (sbcId, url, html, fetchedAt) VALUES (?, ?, ?, ?)`,
            )
            .bind(sbcId, sbcUrl, html, now)
            .run();
        }

        const data = parseSbcProfileHtml(html);
        const hasUpdate = data.lat || data.phone || data.email || data.website;
        if (!hasUpdate) return null;

        await d1
          .prepare(
            `UPDATE "Church" SET
               lat = CASE WHEN ? IS NOT NULL THEN ? ELSE lat END,
               lng = CASE WHEN ? IS NOT NULL THEN ? ELSE lng END,
               phone = COALESCE(?, phone),
               email = COALESCE(?, email),
               website = COALESCE(?, website),
               coordsApproximate = CASE WHEN ? IS NOT NULL THEN 0 ELSE coordsApproximate END,
               updatedAt = ?
             WHERE sbcId = ?`,
          )
          .bind(
            data.lat, data.lat,
            data.lng, data.lng,
            data.phone,
            data.email,
            data.website,
            data.lat,
            now,
            sbcId,
          )
          .run();

        return sbcId;
      }),
    );

    const updated = results
      .filter((r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((id): id is string => id !== null);

    if (updated.length > 0) yield updated;
  }
}
