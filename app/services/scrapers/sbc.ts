import type { ChurchInput } from "./types";
import usCitiesRaw from "~/data/us-cities.json";

const SBC_API = "https://churches.sbc.net/wp-json/facetwp/v1/refresh";
const SBC_HOME = "https://churches.sbc.net/";
const CONCURRENCY = 8; // parallel page fetches

export interface SbcScrapeResult {
  churches: ChurchInput[];
  currentPage: number;
  totalPages: number;
  done: boolean;
  nonce: string;
}

// "city lower,STATE" -> [lat, lng]
const usCities = usCitiesRaw as unknown as Record<string, [number, number]>;

function normCity(city: string): string {
  return city.replace(/['\u2019`]/g, "").toLowerCase().trim();
}

function lookupCoords(city: string | undefined, state: string | undefined): { lat: number; lng: number } | null {
  if (!city || !state) return null;
  const key = `${normCity(city)},${state}`;
  const coords = usCities[key];
  if (!coords) return null;
  return { lat: coords[0], lng: coords[1] };
}

async function fetchNonce(): Promise<string | null> {
  try {
    const res = await fetch(SBC_HOME, {
      headers: { "User-Agent": "ChurchFinderInagg/1.0" },
    });
    const html = await res.text();
    const match = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function parseFwplHtml(html: string): Array<Omit<ChurchInput, "source">> {
  const results: Array<Omit<ChurchInput, "source">> = [];

  // Split on fwpl-result boundaries
  const blocks = html.match(/<div class="fwpl-result[^"]*"[\s\S]*?(?=<div class="fwpl-result|$)/g) ?? [];

  for (const block of blocks) {
    const urlMatch = block.match(/href="(https?:\/\/churches\.sbc\.net\/church\/([^"\/]+)\/?)[^"]*"/i);
    if (!urlMatch) continue;
    const profileUrl = urlMatch[1];
    const sourceId = urlMatch[2];

    const nameMatch = block.match(/href="https?:\/\/churches\.sbc\.net\/church\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/i);
    const name = nameMatch?.[1]?.trim();
    if (!name) continue;

    // el-rsu39 = city, el-gg1c1 = state, el-wcp5oo = zip
    const cityMatch = block.match(/el-rsu39[^>]*>([^<]+)</i);
    const stateMatch = block.match(/el-gg1c1[^>]*>([^<]+)</i);
    const zipMatch = block.match(/el-wcp5oo[^>]*>([^<]+)</i);

    const city = cityMatch?.[1]?.replace(/,\s*$/, "").trim();
    const state = stateMatch?.[1]?.trim();
    const zip = zipMatch?.[1]?.trim();

    const coords = lookupCoords(city, state);
    if (!coords) continue; // skip if we can't place it on a map

    results.push({
      sourceId,
      name,
      city: city || undefined,
      state: state || undefined,
      zip: zip || undefined,
      lat: coords.lat,
      lng: coords.lng,
      profileUrl,
    });
  }

  return results;
}

async function fetchPage(
  page: number,
  nonce: string,
  isFirst: boolean,
): Promise<{ churches: ChurchInput[]; totalPages: number } | null> {
  try {
    const res = await fetch(SBC_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "ChurchFinderInagg/1.0" },
      body: JSON.stringify({
        action: "facetwp_refresh",
        data: {
          facets: {},
          template: "all_churches",
          paged: page,
          extras: { sort: "default" },
          soft_refresh: isFirst ? 0 : 1,
          is_preload: 0,
          first_load: isFirst ? 1 : 0,
        },
        nonce,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      template?: string;
      settings?: { pager?: { total_pages?: number } };
    };
    const totalPages = data.settings?.pager?.total_pages ?? 0;
    const churches = parseFwplHtml(data.template ?? "").map((c) => ({ ...c, source: "sbc" as const }));
    return { churches, totalPages };
  } catch (err) {
    console.error(`SBC scraper error on page ${page}:`, err);
    return null;
  }
}

export async function scrapeSbcBatch(
  _startPage: number,
  nonce: string | null,
): Promise<SbcScrapeResult> {
  const currentNonce = nonce || (await fetchNonce());
  if (!currentNonce) {
    return { churches: [], currentPage: 0, totalPages: 0, done: false, nonce: "" };
  }

  // Fetch page 1 first to discover totalPages
  const first = await fetchPage(1, currentNonce, true);
  if (!first) {
    return { churches: [], currentPage: 1, totalPages: 0, done: false, nonce: currentNonce };
  }

  const totalPages = first.totalPages || 1556; // fallback to known count
  const churches: ChurchInput[] = [...first.churches];

  console.log(`SBC: ${totalPages} total pages, fetching with concurrency ${CONCURRENCY}`);

  // Fetch remaining pages in parallel batches
  for (let i = 2; i <= totalPages; i += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, totalPages - i + 1) },
      (_, k) => fetchPage(i + k, currentNonce, false),
    );
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r) churches.push(...r.churches);
    }
  }

  return {
    churches,
    currentPage: totalPages,
    totalPages,
    done: true,
    nonce: currentNonce,
  };
}
