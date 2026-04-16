import type { ChurchInput } from "./types";

const FOUNDERS_FETCH_TIMEOUT_MS = 60_000;
const ARTICLE_OPEN = '<article id="post-';

// Map Founders location slugs → state abbreviations
const STATE_SLUGS: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new-hampshire": "NH", "new-jersey": "NJ", "new-mexico": "NM", "new-york": "NY",
  "north-carolina": "NC", "north-dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode-island": "RI", "south-carolina": "SC",
  "south-dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west-virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

function extractArticleBlocks(html: string): string[] {
  const blocks: string[] = [];
  const closeTag = "</article>";
  let pos = 0;
  while (true) {
    const start = html.indexOf(ARTICLE_OPEN, pos);
    if (start === -1) break;
    const end = html.indexOf(closeTag, start);
    if (end === -1) break;
    blocks.push(html.slice(start, end + closeTag.length));
    pos = end + closeTag.length;
  }
  return blocks;
}

/** Exported for tests — parses a single employer <article> fragment from the churches listing page. */
export function parseFoundersArticle(articleHtml: string): ChurchInput | null {
  const lat = parseFloat(articleHtml.match(/data-latitude="([^"]+)"/)?.[1] ?? "");
  const lng = parseFloat(articleHtml.match(/data-longitude="([^"]+)"/)?.[1] ?? "");
  if (isNaN(lat) || isNaN(lng)) return null;

  const idMatch = articleHtml.match(/id="post-(\d+)"/i);
  if (!idMatch) return null;
  const sourceId = idMatch[1];

  const nameMatch = articleHtml.match(/class="employer-title"[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/i);
  const name = nameMatch?.[1]?.trim();
  if (!name) return null;

  const profileUrlMatch = articleHtml.match(/href="(https:\/\/church\.founders\.org\/church\/[^"]+)"/i);
  const profileUrl = profileUrlMatch?.[1];

  const stateSlugMatch = articleHtml.match(/church-location\/([^/"]+)\//i);
  const state = stateSlugMatch ? STATE_SLUGS[stateSlugMatch[1]] : undefined;

  return {
    sourceId,
    source: "founders",
    name,
    state: state || undefined,
    lat,
    lng,
    profileUrl: profileUrl || `https://church.founders.org/?p=${sourceId}`,
  };
}

export type ScrapeFoundersOptions = {
  /**
   * When true (cron nationwide scrape), an empty result after a successful HTTP response is treated as an error.
   * Geo-scoped calls may legitimately return zero rows.
   */
  failIfEmpty?: boolean;
};

// On-demand geo fetch for a specific area
export async function scrapeFoundersByCenter(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<ChurchInput[]> {
  return scrapeFounders(lat, lng, radiusMiles, { failIfEmpty: false });
}

export async function scrapeFounders(
  lat = 39.8283,
  lng = -98.5795,
  radiusMiles = 5000,
  options: ScrapeFoundersOptions = {},
): Promise<ChurchInput[]> {
  const { failIfEmpty = false } = options;
  const url = `https://church.founders.org/churches/?filter-center-latitude=${lat}&filter-center-longitude=${lng}&filter-distance=${radiusMiles}&employers_ppp=-1&filter-orderby=menu_order`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FOUNDERS_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "ChurchFinderInagg/1.0", Accept: "text/html" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Founders fetch failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  const articleBlocks = extractArticleBlocks(html);

  const results: ChurchInput[] = [];
  for (const articleHtml of articleBlocks) {
    const church = parseFoundersArticle(articleHtml);
    if (church) results.push(church);
  }

  console.log(`Founders: parsed ${results.length} churches from ${articleBlocks.length} article blocks (${html.length} bytes)`);

  if (failIfEmpty) {
    if (articleBlocks.length === 0) {
      const hint =
        html.length < 8000
          ? "response very small — likely blocked, challenged, or truncated"
          : html.includes("employers-wrapper") || html.includes("employer-card")
            ? "listing chrome present but no <article id=\"post-…\"> blocks — layout may have changed"
            : "no listing markup — page may be wrong or blocked";
      throw new Error(`Founders: no listing articles parsed (${html.length} bytes). ${hint}`);
    }
    if (results.length === 0) {
      throw new Error(
        `Founders: ${articleBlocks.length} listing articles present but none parsed — selectors may need updating`,
      );
    }
  }

  return results;
}
