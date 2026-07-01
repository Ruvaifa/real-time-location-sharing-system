import { useMemo } from "react";
import { Navigation, LogOut, Users } from "lucide-react";
import { useAppStore, sendWsMessage } from "../store/useAppStore";
import { calculateDistance } from "../App";

export function TripPanel() {
  const trip = useAppStore((s) => s.trip);
  const location = useAppStore((s) => s.location);
  const peers = useAppStore((s) => s.peers);
  const username = useAppStore((s) => s.username);
  const setTrip = useAppStore((s) => s.setTrip);

  if (!trip) return null;

  const isCreator = trip.creatorID === username;
  const isActive = trip.status === "active";
  const isPlanning = trip.status === "planning";

  const distanceToDest = useMemo(() => {
    if (!location) return null;
    return calculateDistance(
      location.lat,
      location.lng,
      trip.dest[0],
      trip.dest[1]
    );
  }, [location, trip.dest]);

  const progressPct = useMemo(() => {
    if (!location || trip.distanceMeters === 0) return 0;
    const totalDist = calculateDistance(
      trip.origin[0],
      trip.origin[1],
      trip.dest[0],
      trip.dest[1]
    );
    const covered = calculateDistance(
      trip.origin[0],
      trip.origin[1],
      location.lat,
      location.lng
    );
    return Math.min(100, Math.round((covered / totalDist) * 100));
  }, [location, trip.origin, trip.dest, trip.distanceMeters]);

  const formatDist = (m: number) =>
    m > 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

  const formatDuration = (s: number) => {
    const mins = Math.round(s / 60);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="trip-panel">
      <div className="trip-panel-header">
        <Navigation size={16} style={{ color: "#42A5F5" }} />
        <div className="trip-panel-title">
          <span className="trip-panel-dest">{trip.destName || "Destination"}</span>
          <span className="trip-panel-status">
            {isPlanning && "Planning"}
            {isActive && "In Progress"}
            {trip.status === "completed" && "Completed"}
          </span>
        </div>
        <button className="trip-panel-close" onClick={() => setTrip(null)}>
          <LogOut size={14} />
        </button>
      </div>

      <div className="trip-panel-stats">
        <div className="trip-stat">
          <span className="trip-stat-label">Distance</span>
          <span className="trip-stat-value">
            {distanceToDest !== null ? formatDist(distanceToDest) : "—"}
          </span>
        </div>
        <div className="trip-stat">
          <span className="trip-stat-label">ETA</span>
          <span className="trip-stat-value">
            {distanceToDest !== null
              ? formatDuration((distanceToDest / (20 / 3.6)))
              : "—"}
          </span>
        </div>
        <div className="trip-stat">
          <span className="trip-stat-label">Progress</span>
          <span className="trip-stat-value">{progressPct}%</span>
        </div>
      </div>

      <div className="trip-progress-bar">
        <div className="trip-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="trip-participants">
        <div className="trip-participants-header">
          <Users size={14} />
          <span>{trip.participants.length} rider{trip.participants.length !== 1 ? "s" : ""}</span>
        </div>
        {trip.participants.map((pid, index) => {
          const peer = pid === username ? location : peers[pid];
          const isOnline = peer && Date.now() - (peer?.timestamp || 0) < 60000;
          return (
            <div key={pid || `trip-participant-${trip.id}-${index}`} className="trip-rider">
              <div
                className="trip-rider-dot"
                style={{ backgroundColor: isOnline ? "#4CAF50" : "#888" }}
              />
              <span className="trip-rider-name">
                {pid}{pid === username ? " (You)" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {isCreator && isPlanning && (
        <button
          className="trip-start-btn"
          onClick={() => sendWsMessage("trip_start")}
        >
          Start Navigation
        </button>
      )}

      {isCreator && isActive && (
        <button
          className="trip-end-btn"
          onClick={() => sendWsMessage("trip_end")}
        >
          End Trip
        </button>
      )}
    </div>
  );
}
