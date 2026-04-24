import { ArrowLeft, ExternalLink, Globe, Mail, MapPin, Phone } from "lucide-react";
import { isRouteErrorResponse, Link, useLocation, useRouteError } from "react-router";
import { SourceBadge } from "~/components/source-badge";
import { getPrisma } from "~/db.server";
import type { Route } from "./+types/church.$id";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Response("Church not found", { status: 404 });
  }

  const prisma = getPrisma(context);
  const church = await prisma.church.findUnique({
    where: { id },
  });

  if (!church) {
    throw new Response("Church not found", { status: 404 });
  }

  const url = new URL(request.url);
  const backTo = url.search ? `/${url.search}` : "/";

  return { church, backTo };
}

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ChurchDetail = LoaderData["church"];

function formatAddress(church: Pick<ChurchDetail, "address" | "city" | "state" | "zip">) {
  return [church.address, church.city, church.state, church.zip].filter(Boolean).join(", ");
}

function formatLocation(church: Pick<ChurchDetail, "city" | "state">) {
  return [church.city, church.state].filter(Boolean).join(", ");
}

function formatSourceSummary(sourceCount: number) {
  if (sourceCount >= 3) return "Listed in all 3 directories";
  if (sourceCount === 2) return "Listed in 2 directories";
  return "Listed in 1 directory";
}

function buildMapsHref(church: Pick<ChurchDetail, "address" | "city" | "state" | "zip" | "lat" | "lng">) {
  const address = formatAddress(church);
  const query = address || `${church.lat},${church.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function DirectoryLink({
  href,
  label,
  accent,
}: {
  href: string;
  label: string;
  accent: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm transition-colors hover:border-zinc-600 hover:text-zinc-100 ${accent}`}
    >
      <span>{label}</span>
      <ExternalLink size={14} />
    </a>
  );
}

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) {
    return [{ title: "Church Not Found — Church Finder" }];
  }

  const location = formatLocation(data.church);
  const title = location
    ? `${data.church.name} — ${location} | Church Finder`
    : `${data.church.name} | Church Finder`;
  const description = location
    ? `${data.church.name} in ${location}. ${formatSourceSummary(data.church.sourceCount)} on Church Finder.`
    : `${data.church.name}. ${formatSourceSummary(data.church.sourceCount)} on Church Finder.`;

  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
};

export default function ChurchDetailPage({ loaderData }: Route.ComponentProps) {
  const { church, backTo } = loaderData;
  const address = formatAddress(church);
  const location = formatLocation(church);
  const mapsHref = buildMapsHref(church);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <Link to="/" className="text-lg font-bold transition-colors hover:text-zinc-300">
              Church Finder
            </Link>
            <p className="text-xs text-zinc-500">SBC · Founders · 9Marks</p>
          </div>
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <ArrowLeft size={16} />
            Back to search
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-6 shadow-[0_0_0_1px_rgba(24,24,27,0.5)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                Church detail
              </p>
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{church.name}</h1>
                {location && <p className="mt-2 text-sm text-zinc-400">{location}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {church.isSbc && <SourceBadge source="sbc" />}
                {church.isFounders && <SourceBadge source="founders" />}
                {church.isNineMarks && <SourceBadge source="nineMarks" />}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Cross-reference</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {formatSourceSummary(church.sourceCount)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Source count: {church.sourceCount}
              </p>
            </div>
          </div>

          {church.coordsApproximate && (
            <div className="mt-5 rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
              This church location is approximate. Double-check the address before visiting.
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
            <h2 className="text-lg font-semibold">Contact</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              {address ? (
                <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                  <MapPin size={16} className="mt-0.5 flex-shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p>{address}</p>
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 transition-colors hover:text-blue-300"
                    >
                      Open in Maps
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-3 text-zinc-500">
                  No public street address is available yet.
                </div>
              )}

              {church.phone && (
                <a
                  href={`tel:${church.phone}`}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                >
                  <Phone size={16} className="flex-shrink-0 text-zinc-500" />
                  <span>{church.phone}</span>
                </a>
              )}

              {church.email && (
                <a
                  href={`mailto:${church.email}`}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                >
                  <Mail size={16} className="flex-shrink-0 text-zinc-500" />
                  <span className="truncate">{church.email}</span>
                </a>
              )}

              {church.website && (
                <a
                  href={church.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 transition-colors hover:border-zinc-700 hover:text-zinc-100"
                >
                  <Globe size={16} className="flex-shrink-0 text-zinc-500" />
                  <span className="truncate">{church.website}</span>
                </a>
              )}
            </div>
          </section>

          <aside className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
            <h2 className="text-lg font-semibold">Directory listings</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Open the source directories for this church.
            </p>

            <div className="mt-4 space-y-3">
              {church.sbcUrl && (
                <DirectoryLink href={church.sbcUrl} label="Southern Baptist Convention" accent="text-red-300" />
              )}
              {church.foundersUrl && (
                <DirectoryLink href={church.foundersUrl} label="Founders Ministries" accent="text-amber-300" />
              )}
              {church.nineMarksUrl && (
                <DirectoryLink href={church.nineMarksUrl} label="9Marks" accent="text-purple-300" />
              )}
              {!church.sbcUrl && !church.foundersUrl && !church.nineMarksUrl && (
                <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-3 text-sm text-zinc-500">
                  No source pages are attached to this record yet.
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const backTo = location.search ? `/${location.search}` : "/";
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <Link to="/" className="text-lg font-bold transition-colors hover:text-zinc-300">
              Church Finder
            </Link>
            <p className="text-xs text-zinc-500">SBC · Founders · 9Marks</p>
          </div>
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <ArrowLeft size={16} />
            Back to search
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-8 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
            {isNotFound ? "404" : "Error"}
          </p>
          <h1 className="mt-3 text-3xl font-bold">
            {isNotFound ? "Church not found" : "Something went wrong"}
          </h1>
          <p className="mt-3 text-zinc-400">
            {isNotFound
              ? "This church record could not be found. It may have been merged, removed, or the link may be invalid."
              : "The church detail page could not be loaded right now."}
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              to={backTo}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500"
            >
              <ArrowLeft size={16} />
              Return to search
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
