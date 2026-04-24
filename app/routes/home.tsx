import { useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";
import { Maximize2, Minimize2 } from "lucide-react";
import { geocode } from "~/lib/geocode.server";
import { getPrisma } from "~/db.server";
import type { ChurchResult } from "~/services/search.server";
import { SearchForm } from "~/components/search-form";
import { ChurchList } from "~/components/church-list";
import { MapWrapper } from "~/components/map-wrapper";
import type { Route } from "./+types/home";

type SourceFreshness = {
  sbc: string | null;
  founders: string | null;
  nineMarks: string | null;
};

type SelectionOrigin = "list" | "map" | null;

const MIN_RADIUS_MILES = 0.5;
const MAX_RADIUS_MILES = 100;
const DEFAULT_RADIUS_MILES = 25;
const MIN_SOURCE_COUNT = 1;
const MAX_SOURCE_COUNT = 3;
const DEFAULT_SOURCE_COUNT = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNumberParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function hasValidCoords(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export const meta: Route.MetaFunction = ({ data }) => {
  const query = (data as { query?: string } | undefined)?.query;
  const title = query
    ? `Churches near ${query} — Church Finder`
    : "Church Finder — SBC · Founders · 9Marks";
  return [
    { title },
    ...(query ? [{ property: "og:title", content: title }, { name: "robots", content: "noindex" }] : []),
  ];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const r = clamp(
    parseNumberParam(url.searchParams.get("r"), DEFAULT_RADIUS_MILES),
    MIN_RADIUS_MILES,
    MAX_RADIUS_MILES,
  );
  const min = clamp(
    Math.trunc(parseNumberParam(url.searchParams.get("min"), DEFAULT_SOURCE_COUNT)),
    MIN_SOURCE_COUNT,
    MAX_SOURCE_COUNT,
  );

  const prisma = getPrisma(context);
  const [lastSbcLog, lastFoundersLog, lastNineMarksLog] = await Promise.all([
    prisma.scrapeLog.findFirst({
      where: { source: "sbc", status: "success" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.scrapeLog.findFirst({
      where: { source: "founders", status: "success" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.scrapeLog.findFirst({
      where: { source: "9marks", status: "success" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);
  const sourceFreshness: SourceFreshness = {
    sbc: lastSbcLog?.startedAt?.toISOString() ?? null,
    founders: lastFoundersLog?.startedAt?.toISOString() ?? null,
    nineMarks: lastNineMarksLog?.startedAt?.toISOString() ?? null,
  };

  if (!q) {
    return { center: null, radius: r, minSources: min, query: "", error: null, sourceFreshness };
  }

  const qLat = parseFloat(url.searchParams.get("lat") ?? "");
  const qLng = parseFloat(url.searchParams.get("lng") ?? "");

  let center;
  if (!isNaN(qLat) && !isNaN(qLng) && hasValidCoords(qLat, qLng)) {
    center = { lat: qLat, lng: qLng, displayName: q };
  } else {
    center = await geocode(q);
  }

  if (!center) {
    return {
      center: null,
      radius: r,
      minSources: min,
      query: q,
      error: `Could not find "${q}". Try a city name, state, or ZIP code.`,
      sourceFreshness,
    };
  }

  return { center, radius: r, minSources: min, query: q, error: null, sourceFreshness };
}

function formatAge(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { center, radius, minSources, query, error, sourceFreshness } = loaderData;
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  const [churches, setChurches] = useState<ChurchResult[]>([]);
  const [liveFetching, setLiveFetching] = useState(false);
  const [liveSources, setLiveSources] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectionOrigin, setSelectionOrigin] = useState<SelectionOrigin>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setChurches([]);
    setSelectedId(null);
    setSelectionOrigin(null);
    setLiveSources({});

    if (!center) return;

    setLiveFetching(true);
    const url = `/api/live-search?lat=${center.lat}&lng=${center.lng}&r=${radius}&min=${minSources}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("update", (e) => {
      const { churches: c } = JSON.parse(e.data) as { churches: ChurchResult[] };
      setChurches(c);
    });

    es.addEventListener("status", (e) => {
      const { source, loading } = JSON.parse(e.data) as { source: string; loading: boolean };
      setLiveSources((prev) => ({ ...prev, [source]: loading }));
    });

    const finish = () => {
      setLiveFetching(false);
      es.close();
      esRef.current = null;
    };

    es.addEventListener("done", finish);
    es.onerror = finish;

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [center?.lat, center?.lng, radius, minSources]);

  const activeSources = Object.entries(liveSources)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const fetchingLabel = activeSources.length > 0 ? activeSources.join(" + ") : null;
  const freshnessSummary = [
    ["SBC", formatAge(sourceFreshness.sbc)],
    ["Founders", formatAge(sourceFreshness.founders)],
    ["9Marks", formatAge(sourceFreshness.nineMarks)],
  ];

  return (
    <div className="flex flex-col lg:h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-[1001] flex-shrink-0 border-b border-zinc-800 px-4 py-3 bg-zinc-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-shrink-0">
              <h1 className="text-lg font-bold">Church Finder</h1>
              <p className="text-xs text-zinc-500">SBC · Founders · 9Marks</p>
            </div>
            <div className="w-full">
              <SearchForm query={query} radius={radius} minSources={minSources} />
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          {fetchingLabel && (
            <p className="mt-1.5 text-xs text-blue-400 animate-pulse">
              Fetching fresh data from {fetchingLabel}…
            </p>
          )}
        </div>
      </header>

      {churches.length > 0 && (
        <div className="flex-shrink-0 px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#ef4444]" /> SBC only
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#f59e0b]" /> Founders only
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#8b5cf6]" /> 9Marks only
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#3b82f6]" /> 2 sources
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#10b981]" /> All 3 sources
            </span>
            <span className="flex items-center gap-1 text-zinc-600">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-zinc-500 opacity-70" />
              Approximate pin
            </span>
            <span className="ml-auto text-zinc-600" title="Shows the last successful scrape per directory">
              {freshnessSummary.map(([label, age]) => `${label} ${age}`).join(" · ")}
            </span>
            <span className="w-full text-zinc-600 lg:w-auto">
              Dashed pins mean city-level SBC coordinates that still need page-level enrichment.
            </span>
          </div>
        </div>
      )}

      <main className="lg:flex-1 lg:overflow-hidden">
        <div className="max-w-7xl mx-auto lg:h-full flex flex-col lg:flex-row">
          <div className={mapFullscreen
            ? "fixed inset-0 z-[2000] bg-zinc-950"
            : "lg:flex-1 h-[60vw] max-h-[350px] lg:h-full lg:max-h-none relative isolate"
          }>
            {isNavigating && (
              <div className="absolute inset-0 z-[1000] bg-zinc-950/60 flex items-center justify-center">
                <span className="text-sm text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-700">
                  Searching…
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setMapFullscreen((f) => !f)}
              className="absolute top-2 right-2 z-[1001] bg-zinc-900/80 border border-zinc-700 rounded p-1.5 text-zinc-300 hover:text-white transition-colors"
              title={mapFullscreen ? "Exit fullscreen" : "Fullscreen map"}
            >
              {mapFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <MapWrapper
              center={center}
              churches={churches}
              radius={radius}
              selectedId={selectedId}
              onSelect={(c) => {
                setSelectionOrigin("map");
                setSelectedId(c.id);
              }}
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto lg:max-h-none lg:flex-none lg:w-96 xl:w-[420px] border-t lg:border-t-0 lg:border-l border-zinc-800">
            {!query ? (
              <div className="flex flex-col items-center justify-center lg:h-full text-center py-16 px-8 text-zinc-500">
                <p className="text-lg font-medium text-zinc-400">Enter a location to search</p>
                <p className="text-sm mt-1">
                  Find churches from SBC, Founders, and 9Marks directories
                </p>
              </div>
            ) : liveFetching && churches.length === 0 ? (
              <div className="flex flex-col items-center justify-center lg:h-full text-center py-16 px-8 text-zinc-500">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">Loading churches…</p>
              </div>
            ) : (
              <ChurchList
                churches={churches}
                selectedId={selectedId}
                scrollSelectedIntoView={selectionOrigin === "map"}
                onSelect={(c) => {
                  setSelectionOrigin("list");
                  setSelectedId(c.id);
                }}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
