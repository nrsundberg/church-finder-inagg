import { useEffect, useState, type ComponentType } from "react";
import type { MapProps } from "./map-impl";
import type { ChurchResult } from "~/services/search.server";

export function MapWrapper(props: MapProps) {
  const [MapComponent, setMapComponent] =
    useState<ComponentType<MapProps> | null>(null);

  useEffect(() => {
    import("./map-impl").then((mod) => {
      setMapComponent(() => mod.ChurchMap);
    });
  }, []);

  if (!MapComponent) {
    return (
      <div className="h-full w-full bg-default-100 rounded-lg flex items-center justify-center text-foreground/40">
        <span className="text-sm">Loading map...</span>
      </div>
    );
  }

  return <MapComponent {...props} />;
}
