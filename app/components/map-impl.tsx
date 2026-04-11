import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import type { ChurchResult } from "~/services/search.server";

// Fix Leaflet default marker icon issue with bundlers
// @ts-expect-error - _getIconUrl is an internal method
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const MILES_TO_METERS = 1609.34;

function getMarkerColor(church: ChurchResult): string {
  if (church.sourceCount >= 3) return "#10b981"; // green - all 3
  if (church.sourceCount >= 2) return "#3b82f6"; // blue - 2 sources
  if (church.isSbc) return "#ef4444"; // red - SBC only
  if (church.isFounders) return "#f59e0b"; // amber - Founders only
  return "#8b5cf6"; // purple - 9Marks only
}

function createMarkerIcon(church: ChurchResult, selected: boolean): L.DivIcon {
  const color = getMarkerColor(church);
  if (church.coordsApproximate) {
    const size = selected ? 20 : 14;
    return L.divIcon({
      className: "",
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:transparent;border:2px dashed ${color};opacity:0.6"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, selected ? -13 : -10],
    });
  }
  if (selected) {
    return L.divIcon({
      className: "",
      html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 0 2px ${color},0 2px 8px rgba(0,0,0,0.5)"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -13],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

function calculateZoom(radiusMiles: number): number {
  if (radiusMiles <= 5) return 12;
  if (radiusMiles <= 10) return 11;
  if (radiusMiles <= 25) return 10;
  if (radiusMiles <= 50) return 9;
  return 8;
}

// Flies to a new center+zoom whenever center/radius changes
function FlyToView({ lat, lng, radiusMiles }: { lat: number; lng: number; radiusMiles: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], calculateZoom(radiusMiles), { duration: 0.8 });
  }, [lat, lng, radiusMiles, map]);
  return null;
}

// Pans to a selected church
function PanTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

function createCenterIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#60a5fa;border:3px solid white;box-shadow:0 0 0 2px #3b82f6,0 2px 8px rgba(0,0,0,0.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export interface MapProps {
  center: { lat: number; lng: number } | null;
  churches: ChurchResult[];
  radius: number;
  selectedId: number | null;
  onSelect: (church: ChurchResult) => void;
}

export function ChurchMap({
  center,
  churches,
  radius,
  selectedId,
  onSelect,
}: MapProps) {
  const initialCenter: [number, number] = center
    ? [center.lat, center.lng]
    : [39.8283, -98.5795]; // Geographic center of US
  const initialZoom = center ? calculateZoom(radius) : 4;

  const selectedChurch = selectedId ? churches.find((c) => c.id === selectedId) : null;

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      style={{ height: "100%", width: "100%" }}
      className="rounded-lg"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {center && (
        <FlyToView lat={center.lat} lng={center.lng} radiusMiles={radius} />
      )}
      {center && (
        <Circle
          center={[center.lat, center.lng]}
          radius={radius * MILES_TO_METERS}
          pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.06, weight: 1.5 }}
        />
      )}
      {center && (
        <Marker position={[center.lat, center.lng]} icon={createCenterIcon()} />
      )}
      {selectedChurch && (
        <PanTo lat={selectedChurch.lat} lng={selectedChurch.lng} />
      )}
      {churches.map((church) => (
        <Marker
          key={`${church.id}-${selectedId === church.id}`}
          position={[church.lat, church.lng]}
          icon={createMarkerIcon(church, selectedId === church.id)}
          eventHandlers={{ click: () => onSelect(church) }}
        >
          <Popup>
            <div className="text-sm">
              <strong>{church.name}</strong>
              {church.city && church.state && (
                <div className="text-gray-600 mt-1">
                  {church.city}, {church.state}
                </div>
              )}
              <div className="flex gap-1 mt-1">
                {church.isSbc && (
                  <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                    SBC
                  </span>
                )}
                {church.isFounders && (
                  <span className="px-1 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                    Founders
                  </span>
                )}
                {church.isNineMarks && (
                  <span className="px-1 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                    9Marks
                  </span>
                )}
              </div>
              {church.website && (
                <a
                  href={church.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1 text-blue-600 hover:underline text-xs"
                >
                  Website
                </a>
              )}
              {church.coordsApproximate && (
                <div className="text-gray-400 text-xs mt-1 italic">Approximate location</div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
