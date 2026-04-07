import { useEffect, useState, type ComponentType } from "react";
import type { SearchPoint } from "./search-heatmap-impl";

export function SearchHeatmapWrapper({ points }: { points: SearchPoint[] }) {
  const [Component, setComponent] = useState<ComponentType<{ points: SearchPoint[] }> | null>(null);

  useEffect(() => {
    import("./search-heatmap-impl").then((mod) => {
      setComponent(() => mod.SearchHeatmapImpl);
    });
  }, []);

  if (!Component) {
    return (
      <div className="h-full w-full bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-500">
        <span className="text-sm">Loading map...</span>
      </div>
    );
  }

  return <Component points={points} />;
}
