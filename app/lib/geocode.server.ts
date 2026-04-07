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

async function nominatimSearch(query: string, limit: number) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}&countrycodes=us`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) return [];
  return (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
}

export async function geocode(query: string): Promise<GeoResult | null> {
  try {
    const data = await nominatimSearch(query, 1);
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return null;
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
  try {
    // bbox covers all US states including Alaska and Hawaii
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en&osm_tag=place&bbox=-180,18,-65,72`;
    const res = await fetch(url, { headers: PHOTON_HEADERS });
    if (!res.ok) return [];
    const data = (await res.json()) as { features: PhotonFeature[] };

    return data.features
      .filter((f) => f.properties.country === "United States")
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
    return [];
  }
}
