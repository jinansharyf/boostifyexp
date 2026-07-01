import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons (Leaflet's default assets don't bundle correctly with Vite)
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
};

export function LocationPicker({ latitude, longitude, onChange, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initLat = latitude ?? 6.9271; // Colombo default
    const initLng = longitude ?? 79.8612;
    const map = L.map(containerRef.current).setView([initLat, initLng], latitude != null ? 15 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([initLat, initLng], { draggable: true, icon: defaultIcon }).addTo(map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      onChange(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
    });
    map.on("click", (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Fix sizing when rendered inside cards
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external changes to the marker/view
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (latitude == null || longitude == null) return;
    const current = markerRef.current.getLatLng();
    if (Math.abs(current.lat - latitude) < 1e-6 && Math.abs(current.lng - longitude) < 1e-6) return;
    markerRef.current.setLatLng([latitude, longitude]);
    mapRef.current.setView([latitude, longitude], Math.max(mapRef.current.getZoom(), 15));
  }, [latitude, longitude]);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      );
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (data.length === 0) return;
      const lat = Number(data[0].lat);
      const lng = Number(data[0].lon);
      onChange(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Search address or place…"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-2xl border border-border"
      />
      <p className="text-[11px] text-muted-foreground">
        Tap the map or drag the pin to set your exact location.
      </p>
    </div>
  );
}