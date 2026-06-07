import { useState, useRef, useEffect } from "react";
import { Search, MapPin, X } from "lucide-react";
import { searchPlaces, SearchResult } from "../lib/geocoding";
import { getRoute } from "../lib/routing";
import { useAppStore, sendWsMessage } from "../store/useAppStore";

export function DestinationSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const location = useAppStore((s) => s.location);
  const setTrip = useAppStore((s) => s.setTrip);
  const trip = useAppStore((s) => s.trip);
  const username = useAppStore((s) => s.username);
  const requestFitBounds = useAppStore((s) => s.requestFitBounds);
  const routePreview = useAppStore((s) => s.routePreview);
  const setRoutePreview = useAppStore((s) => s.setRoutePreview);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchPlaces(value);
        setResults(res);
      } catch (err) {
        console.error("Geocoding error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = async (result: SearchResult) => {
    setQuery(result.displayName);
    setResults([]);

    if (!location) {
      showToast("Waiting for your location...");
      return;
    }

    setLoading(true);
    try {
      const route = await getRoute(
        [location.lat, location.lng],
        [result.lat, result.lng]
      );
      setRoutePreview({
        origin: [location.lat, location.lng],
        dest: [result.lat, result.lng],
        coordinates: route.coordinates,
        distance: route.distance,
        duration: route.duration,
        destName: result.displayName,
      });
      requestFitBounds([
        [location.lat, location.lng],
        [result.lat, result.lng],
      ]);
    } catch {
      showToast("Could not compute route. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartNavigation = () => {
    if (!routePreview || !location) return;

    const tripId = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tripData = {
      id: tripId,
      creatorID: username,
      creatorName: username,
      origin: routePreview.origin,
      originName: "My location",
      dest: routePreview.dest,
      destName: routePreview.destName,
      routeCoordinates: routePreview.coordinates,
      distanceMeters: routePreview.distance,
      durationSeconds: routePreview.duration,
      status: "active" as const,
      participants: [username],
      startedAt: Date.now(),
    };

    setTrip(tripData);
    setRoutePreview(null);

    sendWsMessage("trip_create", {
      id: tripId,
      originLat: location.lat,
      originLng: location.lng,
      originName: "My location",
      destLat: routePreview.dest[0],
      destLng: routePreview.dest[1],
      destName: routePreview.destName,
      routeGeometry: JSON.stringify(routePreview.coordinates),
      distanceMeters: routePreview.distance,
      durationSeconds: routePreview.duration,
    });

    sendWsMessage("trip_start");

    setQuery("");
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setRoutePreview(null);
  };

  const formatDistance = (m: number) =>
    m > 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

  const formatDuration = (s: number) => {
    const mins = Math.round(s / 60);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  if (trip) return null;

  return (
    <div ref={wrapperRef} className="dest-search-wrap">
      <div className="dest-search-bar">
        <Search size={16} className="dest-search-icon" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Where to?"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="dest-search-input"
        />
        {(query || routePreview) && (
          <button className="dest-search-clear" onClick={handleClear}>
            <X size={14} />
          </button>
        )}
        {loading && <div className="dest-search-spinner" />}
      </div>

      {results.length > 0 && (
        <div className="dest-search-results">
          {results.map((r, i) => (
            <button
              key={`${r.lat}-${r.lng}-${i}`}
              className="dest-search-item"
              onClick={() => handleSelect(r)}
            >
              <MapPin size={14} className="dest-item-icon" />
              <div className="dest-item-text">
                <span className="dest-item-name">{r.name}</span>
                <span className="dest-item-addr">{r.displayName}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {routePreview && (
        <div className="dest-route-preview">
          <div className="dest-route-info">
            <span>{formatDistance(routePreview.distance)}</span>
            <span className="dest-route-sep">·</span>
            <span>{formatDuration(routePreview.duration)} by bike</span>
          </div>
          <button className="dest-start-btn" onClick={handleStartNavigation}>
            Start Navigation
          </button>
        </div>
      )}
      {toast && (
        <div className="dest-toast">{toast}</div>
      )}
    </div>
  );
}
