import type { ChurchInput } from "./types";

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

function parseArticle(articleHtml: string): ChurchInput | null {
  const lat = parseFloat(articleHtml.match(/data-latitude="([^"]+)"/)?.[1] ?? "");
  const lng = parseFloat(articleHtml.match(/data-longitude="([^"]+)"/)?.[1] ?? "");
  if (isNaN(lat) || isNaN(lng)) return null;

  // id="post-12345"
  const idMatch = articleHtml.match(/id="post-(\d+)"/i);
  if (!idMatch) return null;
  const sourceId = idMatch[1];

  // <h2 class="employer-title"><a href="...">Name</a></h2>
  const nameMatch = articleHtml.match(/class="employer-title"[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/i);
  const name = nameMatch?.[1]?.trim();
  if (!name) return null;

  // Profile URL: https://church.founders.org/church/slug/
  const profileUrlMatch = articleHtml.match(/href="(https:\/\/church\.founders\.org\/church\/[^"]+)"/i);
  const profileUrl = profileUrlMatch?.[1];

  // State from location slug: church-location/florida/
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

// On-demand geo fetch for a specific area
export async function scrapeFoundersByCenter(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<ChurchInput[]> {
  return scrapeFounders(lat, lng, radiusMiles);
}

export async function scrapeFounders(
  lat = 39.8283,
  lng = -98.5795,
  radiusMiles = 5000,
): Promise<ChurchInput[]> {
  const url = `https://church.founders.org/churches/?filter-center-latitude=${lat}&filter-center-longitude=${lng}&filter-distance=${radiusMiles}&employers_ppp=-1&filter-orderby=menu_order`;

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ChurchFinderInagg/1.0", Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`Founders fetch failed: ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error("Founders scraper error:", err);
    return [];
  }

  const articleMatches = html.match(/<article id="post-\d+"[^>]*>[\s\S]*?<\/article>/gi);
  if (!articleMatches) {
    console.error("Founders: no articles found in response");
    return [];
  }

  const results: ChurchInput[] = [];
  for (const articleHtml of articleMatches) {
    const church = parseArticle(articleHtml);
    if (church) results.push(church);
  }

  console.log(`Founders: parsed ${results.length} churches from ${articleMatches.length} articles`);
  return results;
}
