import usCitiesRaw from "~/data/us-cities.json";

export interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

export interface SuggestResult {
  label: string;
  lat: number;
  lng: number;
}

const NOMINATIM_HEADERS = {
  "User-Agent": "ChurchFinderInagg/1.0 (church-finder aggregation tool)",
};

const PHOTON_HEADERS = {
  "User-Agent": "ChurchFinderInagg/1.0 (church-finder aggregation tool)",
};

const usCities = usCitiesRaw as unknown as Record<string, [number, number]>;
const localCities = Object.entries(usCities).map(([key, coords]) => {
  const [city, state] = key.split(",");
  return {
    key,
    city,
    state,
    label: `${toTitleCase(city)}, ${state}`,
    lat: coords[0],
    lng: coords[1],
  };
});

function toTitleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function normalizeQuery(value: string): string {
  return value
    .replace(/['\u2019`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function lookupLocalCity(query: string): GeoResult | null {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const exactKey = normalized.includes(",")
    ? normalized.replace(/\s*,\s*/, ",").replace(/,([a-z]{2})$/, (_, state: string) => `,${state.toUpperCase()}`)
    : null;
  const city = exactKey ? localCities.find((result) => result.key === exactKey) : null;
  if (city) {
    return { lat: city.lat, lng: city.lng, displayName: city.label };
  }

  const [rawCity, rawState] = normalized.split(/\s+(?=[a-z]{2}$)/);
  const state = rawState?.toUpperCase();
  const fallback = localCities.find(
    (result) =>
      result.city === normalized ||
      (state && result.city === rawCity && result.state === state),
  );

  return fallback ? { lat: fallback.lat, lng: fallback.lng, displayName: fallback.label } : null;
}

function suggestLocalCities(query: string, limit: number): SuggestResult[] {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) return [];

  const [rawCity, rawState] = normalized.split(/\s+(?=[a-z]{2}$)/);
  const state = rawState?.toUpperCase();

  return localCities
    .filter((result) => {
      if (result.city.startsWith(normalized)) return true;
      if (state && result.state === state && result.city.startsWith(rawCity)) return true;
      return result.label.toLowerCase().startsWith(normalized);
    })
    .slice(0, limit)
    .map(({ label, lat, lng }) => ({ label, lat, lng }));
}

async function nominatimSearch(query: string, limit: number) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}&countrycodes=us`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) return [];
  return (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
}

export async function geocode(query: string): Promise<GeoResult | null> {
  try {
    const data = await nominatimSearch(query, 1);
    if (!data.length) return lookupLocalCity(query);
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return lookupLocalCity(query);
  }
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

export async function suggest(query: string): Promise<SuggestResult[]> {
  const localResults = suggestLocalCities(query, 5);
  if (localResults.length > 0) return localResults;

  try {
    // bbox covers all US states including Alaska and Hawaii
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en&osm_tag=place&bbox=-180,18,-65,72`;
    const res = await fetch(url, { headers: PHOTON_HEADERS });
    if (!res.ok) return localResults;
    const data = (await res.json()) as { features: PhotonFeature[] };

    return data.features
      .filter((f) => f.properties.country?.startsWith("United States"))
      .map((f) => {
        const { name, city, state, postcode } = f.properties;
        const [lng, lat] = f.geometry.coordinates;

        let label: string;
        if (postcode && !name) {
          label = [postcode, city, state].filter(Boolean).join(", ");
        } else {
          label = [name ?? city, state].filter(Boolean).join(", ");
        }

        return { label, lat, lng };
      })
      .filter((r) => r.label.length > 0);
  } catch {
    return localResults;
  }
}
