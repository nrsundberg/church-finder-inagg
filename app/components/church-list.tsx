import { useEffect } from "react";
import { ChurchCard } from "./church-card";
import type { ChurchResult } from "~/services/search.server";

interface ChurchListProps {
  churches: ChurchResult[];
  selectedId: number | null;
  onSelect: (church: ChurchResult) => void;
}

export function ChurchList({ churches, selectedId, onSelect }: ChurchListProps) {
  useEffect(() => {
    if (selectedId === null) return;
    const el = document.getElementById(`church-${selectedId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);
  if (churches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center lg:h-full text-center py-16 px-8 text-zinc-500">
        <p className="text-lg font-medium">No churches found</p>
        <p className="text-sm mt-1">Try expanding your search radius</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-xs text-zinc-500 px-1">
        {churches.length} church{churches.length !== 1 ? "es" : ""} found
      </p>
      {churches.map((church) => (
        <ChurchCard
          key={church.id}
          church={church}
          isSelected={church.id === selectedId}
          onClick={() => onSelect(church)}
        />
      ))}
    </div>
  );
}
