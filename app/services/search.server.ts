import type { PrismaClient } from "~/db/client";

export interface ChurchResult {
  id: number;
  name: string;
  nameNorm: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  isSbc: boolean;
  isFounders: boolean;
  isNineMarks: boolean;
  sbcUrl: string | null;
  foundersUrl: string | null;
  nineMarksUrl: string | null;
  sourceCount: number;
  distance: number;
}

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Safety-net dedup: merges display-side any records that share the same
 * nameNorm and are within 0.5 miles of each other. Handles stale DB data
 * that hasn't been through the cross-reference merge yet.
 */
function clientDedup(churches: ChurchResult[]): ChurchResult[] {
  const absorbed = new Set<number>();
  const result: ChurchResult[] = [];

  for (let i = 0; i < churches.length; i++) {
    if (absorbed.has(churches[i].id)) continue;

    const seed = churches[i];
    const cluster: ChurchResult[] = [seed];

    for (let j = i + 1; j < churches.length; j++) {
      if (absorbed.has(churches[j].id)) continue;
      const b = churches[j];
      if (
        b.nameNorm === seed.nameNorm &&
        haversine(seed.lat, seed.lng, b.lat, b.lng) <= 0.5
      ) {
        cluster.push(b);
        absorbed.add(b.id);
      }
    }

    if (cluster.length === 1) {
      result.push(seed);
      continue;
    }

    // Pick canonical: longest name wins; tie-break lower id (older/more authoritative)
    const canonical = cluster.reduce((best, c) =>
      c.name.length > best.name.length ||
      (c.name.length === best.name.length && c.id < best.id)
        ? c
        : best,
    );

    const merged: ChurchResult = {
      ...canonical,
      isSbc: cluster.some((c) => c.isSbc),
      isFounders: cluster.some((c) => c.isFounders),
      isNineMarks: cluster.some((c) => c.isNineMarks),
      sbcUrl: cluster.find((c) => c.sbcUrl)?.sbcUrl ?? null,
      foundersUrl: cluster.find((c) => c.foundersUrl)?.foundersUrl ?? null,
      nineMarksUrl: cluster.find((c) => c.nineMarksUrl)?.nineMarksUrl ?? null,
      address: cluster.find((c) => c.address)?.address ?? null,
      city: cluster.find((c) => c.city)?.city ?? null,
      state: cluster.find((c) => c.state)?.state ?? null,
      zip: cluster.find((c) => c.zip)?.zip ?? null,
      phone: cluster.find((c) => c.phone)?.phone ?? null,
      website: cluster.find((c) => c.website)?.website ?? null,
    };
    merged.sourceCount =
      (merged.isSbc ? 1 : 0) +
      (merged.isFounders ? 1 : 0) +
      (merged.isNineMarks ? 1 : 0);

    result.push(merged);
  }

  return result;
}

export async function searchChurches(
  prisma: PrismaClient,
  lat: number,
  lng: number,
  radiusMiles: number,
  minSources?: number,
): Promise<ChurchResult[]> {
  // Bounding box pre-filter (1 degree lat ≈ 69 miles)
  const latDelta = radiusMiles / 69;
  const lngDelta = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180));

  const churches = await prisma.church.findMany({
    where: {
      lat: { gte: lat - latDelta, lte: lat + latDelta },
      lng: { gte: lng - lngDelta, lte: lng + lngDelta },
      ...(minSources && minSources > 1
        ? { sourceCount: { gte: minSources } }
        : {}),
    },
  });

  const withDistance = churches
    .map((c) => ({
      ...c,
      distance: haversine(lat, lng, c.lat, c.lng),
    }))
    .filter((c) => c.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);

  return clientDedup(withDistance).slice(0, 200);
}
