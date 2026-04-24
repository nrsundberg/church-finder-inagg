import { ArrowRight, ExternalLink, Globe, MapPin, Phone } from "lucide-react";
import { Link, useLocation } from "react-router";
import { SourceBadge } from "./source-badge";
import type { ChurchResult } from "~/services/search.server";

interface ChurchCardProps {
  church: ChurchResult;
  isSelected: boolean;
  onClick: () => void;
}

export function ChurchCard({ church, isSelected, onClick }: ChurchCardProps) {
  const location = useLocation();
  const address = [church.address, church.city, church.state, church.zip]
    .filter(Boolean)
    .join(", ");
  const detailHref = location.search ? `/church/${church.id}${location.search}` : `/church/${church.id}`;

  return (
    <article
      id={`church-${church.id}`}
      onMouseEnter={onClick}
      className={`group relative w-full cursor-pointer rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? "border-blue-500 bg-blue-950/30"
          : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
      }`}
    >
      <Link
        to={detailHref}
        onClick={onClick}
        onFocus={onClick}
        className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        aria-label={`View details for ${church.name}`}
      >
        <span className="sr-only">View details for {church.name}</span>
      </Link>

      <div className="relative z-10 pointer-events-none">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold leading-tight text-zinc-100">{church.name}</h3>
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500 transition-colors group-hover:text-zinc-300">
              View details
              <ArrowRight size={12} />
            </p>
          </div>
          <span className="flex-shrink-0 whitespace-nowrap text-xs text-zinc-500">
            {church.distance.toFixed(1)} mi
          </span>
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          {church.isSbc && <SourceBadge source="sbc" />}
          {church.isFounders && <SourceBadge source="founders" />}
          {church.isNineMarks && <SourceBadge source="nineMarks" />}
        </div>

        {address && (
          <div className="mb-1 flex items-start gap-1 text-xs text-zinc-400">
            <MapPin size={12} className="mt-0.5 flex-shrink-0" />
            <span>{address}</span>
          </div>
        )}

        {church.phone && (
          <div className="mb-1 flex items-center gap-1 text-xs text-zinc-400">
            <Phone size={12} className="flex-shrink-0" />
            <span>{church.phone}</span>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-3 pointer-events-auto">
          {church.website && (
            <a
              href={church.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              <Globe size={11} />
              Website
            </a>
          )}
          {church.sbcUrl && (
            <a
              href={church.sbcUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
            >
              <ExternalLink size={11} />
              SBC
            </a>
          )}
          {church.foundersUrl && (
            <a
              href={church.foundersUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
            >
              <ExternalLink size={11} />
              Founders
            </a>
          )}
          {church.nineMarksUrl && (
            <a
              href={church.nineMarksUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
            >
              <ExternalLink size={11} />
              9Marks
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
