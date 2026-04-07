import { MapPin, Phone, Globe, ExternalLink } from "lucide-react";
import { SourceBadge } from "./source-badge";
import type { ChurchResult } from "~/services/search.server";

interface ChurchCardProps {
  church: ChurchResult;
  isSelected: boolean;
  onClick: () => void;
}

export function ChurchCard({ church, isSelected, onClick }: ChurchCardProps) {
  const address = [church.address, church.city, church.state, church.zip]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${
        isSelected
          ? "border-blue-500 bg-blue-950/30"
          : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="font-semibold text-sm leading-tight text-zinc-100">{church.name}</h3>
        <span className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0">
          {church.distance.toFixed(1)} mi
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {church.isSbc && <SourceBadge source="sbc" />}
        {church.isFounders && <SourceBadge source="founders" />}
        {church.isNineMarks && <SourceBadge source="nineMarks" />}
      </div>

      {address && (
        <div className="flex items-start gap-1 text-xs text-zinc-400 mb-1">
          <MapPin size={12} className="mt-0.5 flex-shrink-0" />
          <span>{address}</span>
        </div>
      )}

      {church.phone && (
        <div className="flex items-center gap-1 text-xs text-zinc-400 mb-1">
          <Phone size={12} className="flex-shrink-0" />
          <span>{church.phone}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-2">
        {church.website && (
          <a
            href={church.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
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
            onClick={(e) => e.stopPropagation()}
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
            onClick={(e) => e.stopPropagation()}
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
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
          >
            <ExternalLink size={11} />
            9Marks
          </a>
        )}
      </div>
    </button>
  );
}
