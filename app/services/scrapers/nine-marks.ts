import type { ChurchInput } from "./types";

interface NineMarksLocation {
  ID: number;
  title: string;
  content: string;
  excerpt: string;
  lat: string;
  lng: string;
  address: string;
  phone: string;
  website: string;
  email: string;
  distance: string;
  image: string;
}

interface NineMarksResponse {
  status: string;
  count: number;
  locations: NineMarksLocation[];
}

// US coverage grid: [ne_lat, ne_lng, sw_lat, sw_lng]
const US_TILES: Array<[number, number, number, number]> = [
  // Row 1: Northern tier
  [50, -110, 43, -125],
  [50, -95, 43, -112],
  [50, -80, 43, -97],
  [50, -66, 43, -82],
  // Row 2: Upper-middle tier
  [44, -110, 38, -125],
  [44, -95, 38, -112],
  [44, -80, 38, -97],
  [44, -66, 38, -82],
  // Row 3: Lower-middle tier
  [39, -95, 33, -110],
  [39, -80, 33, -97],
  [39, -66, 33, -82],
  [39, -110, 33, -125],
  // Row 4: Southern tier
  [34, -95, 29, -110],
  [34, -80, 29, -97],
  [34, -66, 29, -82],
  [34, -110, 29, -125],
  // Row 5: Deep South + Florida
  [30, -85, 24, -100],
  [30, -70, 24, -87],
  // Alaska + Hawaii approximate
  [72, -130, 54, -170],
  [22, -154, 18, -162],
];

async function fetchTile(
  neLat: number,
  neLng: number,
  swLat: number,
  swLng: number,
): Promise<NineMarksLocation[]> {
  const cLat = (neLat + swLat) / 2;
  const cLng = (neLng + swLng) / 2;
  const url = `https://www.9marks.org/feed/get-locations/${neLat}/${neLng}/${swLat}/${swLng}/${cLat}/${cLng}/6/json/`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": "ChurchFinderInagg/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as NineMarksResponse;
    return data.locations ?? [];
  } catch {
    return [];
  }
}

function parseLocation(loc: NineMarksLocation): ChurchInput | null {
  const lat = parseFloat(loc.lat);
  const lng = parseFloat(loc.lng);
  if (isNaN(lat) || isNaN(lng)) return null;

  // Parse city/state from address "123 Main St, City, ST 12345"
  const addrParts = loc.address.split(",").map((s) => s.trim());
  const city = addrParts.length >= 2 ? addrParts[addrParts.length - 2] : undefined;
  const stateZip = addrParts.length >= 1 ? addrParts[addrParts.length - 1] : "";
  const stateMatch = stateZip.match(/^([A-Z]{2})\s*(\d{5})?/);

  return {
    sourceId: String(loc.ID),
    source: "9marks",
    name: loc.title,
    address: loc.address || undefined,
    city: city || undefined,
    state: stateMatch?.[1] || undefined,
    zip: stateMatch?.[2] || undefined,
    lat,
    lng,
    phone: loc.phone || undefined,
    email: loc.email || undefined,
    website: loc.website || undefined,
    profileUrl: `https://www.9marks.org/?post_type=wpsl_stores&p=${loc.ID}`,
  };
}

// Fetch just the tile(s) covering a given bounding box (for on-demand geo search)
export async function scrapeNineMarksByBounds(
  neLat: number,
  neLng: number,
  swLat: number,
  swLng: number,
): Promise<ChurchInput[]> {
  const locations = await fetchTile(neLat, neLng, swLat, swLng);
  const results: ChurchInput[] = [];
  for (const loc of locations) {
    const church = parseLocation(loc);
    if (church) results.push(church);
  }
  return results;
}

export async function scrapeNineMarks(): Promise<ChurchInput[]> {
  // Fetch all tiles in parallel — 9Marks API handles concurrent requests fine
  const tileResults = await Promise.allSettled(
    US_TILES.map(([neLat, neLng, swLat, swLng]) => fetchTile(neLat, neLng, swLat, swLng)),
  );

  const seen = new Set<number>();
  const results: ChurchInput[] = [];

  for (const result of tileResults) {
    if (result.status !== "fulfilled") continue;
    for (const loc of result.value) {
      if (seen.has(loc.ID)) continue;
      seen.add(loc.ID);
      const church = parseLocation(loc);
      if (church) results.push(church);
    }
  }

  return results;
}
