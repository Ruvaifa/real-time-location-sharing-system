import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, Compass, Radio, Navigation, Route, ClipboardCopy, MessageSquare } from "lucide-react";
import Maplibregl from "maplibre-gl";

import "./styles.css";
import { NavItem } from "./components/ui/bottom-nav-bar";
import { GlobeAnalytics } from "./components/ui/cobe-globe-analytics";
import {
  Map as MapView,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MapRoute,
  useMap,
} from "./components/ui/map";
import { DestinationSearch } from "./components/DestinationSearch";
import { GroupChatPanel } from "./components/GroupChatPanel";
import { TripPanel } from "./components/TripPanel";
import { LocationData, Route as RouteType, useAppStore, sendWsMessage } from "./store/useAppStore";
import { getRoute } from "./lib/routing";
import { fetchActiveTrip, parseRouteCoordinates } from "./lib/trip";
import { normalizeChatMessage } from "./lib/chat";

function buildWsUrl(groupId: string, token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = import.meta.env.VITE_WS_HOST || window.location.host;
  return `${protocol}//${host}/ws/${groupId}?token=${token}`;
}

function mergeTripParticipants(
  base: import("./store/useAppStore").TripData,
  incoming: import("./store/useAppStore").TripData
): import("./store/useAppStore").TripData {
  return {
    ...base,
    ...incoming,
    participants: Array.from(new Set([...(base.participants || []), ...(incoming.participants || [])])),
  };
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
    Math.cos(phi2) *
    Math.sin(deltaLambda / 2) *
    Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

const COLORS = [
  "#4F8BFF",
  "#35D1A1",
  "#FFB300",
  "#FF7A00",
  "#FF5C5C",
];
const SELF_COLOR = "var(--accent)";
const SELF_ROUTE_COLOR = "#FF7A00";
const ROUTE_COLOR = "rgb(252 76 2)";
const MAP_STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  voyager: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
} as const;
const MAP_STYLE_ORDER: Array<keyof typeof MAP_STYLES> = ["dark", "light", "voyager"];

const SIM_ROUTES: RouteType[] = [
  {
    id: "lodhi-garden-loop",
    name: "Lodhi Garden Loop",
    distanceKm: 4.2,
    waypoints: [
      [28.5914, 77.2270],
      [28.5928, 77.2295],
      [28.5950, 77.2310],
      [28.5975, 77.2320],
      [28.5995, 77.2305],
      [28.6010, 77.2280],
      [28.6005, 77.2250],
      [28.5985, 77.2230],
      [28.5960, 77.2225],
      [28.5940, 77.2240],
      [28.5914, 77.2270],
    ],
  },
  {
    id: "india-gate-rajpath",
    name: "India Gate - Rajpath",
    distanceKm: 5.8,
    waypoints: [
      [28.6129, 77.2295],
      [28.6118, 77.2270],
      [28.6100, 77.2240],
      [28.6085, 77.2210],
      [28.6070, 77.2185],
      [28.6055, 77.2160],
      [28.6040, 77.2130],
      [28.6025, 77.2100],
      [28.6010, 77.2075],
      [28.5995, 77.2050],
      [28.5980, 77.2030],
    ],
  },
  {
    id: "connaught-place-circuit",
    name: "Connaught Place Circuit",
    distanceKm: 3.1,
    waypoints: [
      [28.6315, 77.2167],
      [28.6330, 77.2190],
      [28.6345, 77.2215],
      [28.6355, 77.2240],
      [28.6345, 77.2265],
      [28.6330, 77.2280],
      [28.6310, 77.2275],
      [28.6295, 77.2255],
      [28.6285, 77.2230],
      [28.6290, 77.2200],
      [28.6315, 77.2167],
    ],
  },
  {
    id: "chanakyapuri-embassy",
    name: "Chanakyapuri Embassy Row",
    distanceKm: 6.5,
    waypoints: [
      [28.5975, 77.1880],
      [28.5990, 77.1910],
      [28.6010, 77.1940],
      [28.6030, 77.1965],
      [28.6055, 77.1985],
      [28.6075, 77.1970],
      [28.6090, 77.1945],
      [28.6080, 77.1920],
      [28.6060, 77.1895],
      [28.6035, 77.1875],
      [28.6010, 77.1860],
      [28.5990, 77.1850],
      [28.5975, 77.1880],
    ],
  },
];

const CYCLING_SPEED_KMH = 20;
const TICK_INTERVAL_MS = 1000;
const ROUTE_SERVICE_URL = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_FETCH_TIMEOUT_MS = 5000;
const ROUTE_FETCH_MIN_DISTANCE_METERS = 50;
const ROUTE_FETCH_MIN_INTERVAL_MS = 5000;

type LineCoordinate = [number, number];

function getRouteLengthMeters(route: RouteType): number {
  let total = 0;
  for (let i = 1; i < route.waypoints.length; i++) {
    total += calculateDistance(
      route.waypoints[i - 1][0], route.waypoints[i - 1][1],
      route.waypoints[i][0], route.waypoints[i][1]
    );
  }
  return total;
}

function getRoutePosition(
  route: RouteType,
  distanceMeters: number
): { lat: number; lng: number; bearing: number } {
  const wps = route.waypoints;
  let remaining = distanceMeters;

  for (let i = 1; i < wps.length; i++) {
    const segLen = calculateDistance(
      wps[i - 1][0], wps[i - 1][1],
      wps[i][0], wps[i][1]
    );

    if (remaining <= segLen || i === wps.length - 1) {
      const t = segLen > 0 ? Math.min(remaining / segLen, 1) : 0;
      const lat = wps[i - 1][0] + (wps[i][0] - wps[i - 1][0]) * t;
      const lng = wps[i - 1][1] + (wps[i][1] - wps[i - 1][1]) * t;
      const bearing =
        (Math.atan2(wps[i][1] - wps[i - 1][1], wps[i][0] - wps[i - 1][0]) *
          180) /
        Math.PI;
      return { lat, lng, bearing };
    }

    remaining -= segLen;
  }

  const last = wps[wps.length - 1];
  return { lat: last[0], lng: last[1], bearing: 0 };
}

function getLineLengthMeters(line: LineCoordinate[]): number {
  if (line.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += calculateDistance(
      line[i - 1][1],
      line[i - 1][0],
      line[i][1],
      line[i][0]
    );
  }
  return total;
}

function getLinePosition(
  line: LineCoordinate[],
  distanceMeters: number
): { lat: number; lng: number; bearing: number } {
  if (line.length < 2) {
    return { lat: 0, lng: 0, bearing: 0 };
  }

  let remaining = distanceMeters;

  for (let i = 1; i < line.length; i++) {
    const segLen = calculateDistance(
      line[i - 1][1],
      line[i - 1][0],
      line[i][1],
      line[i][0]
    );

    if (remaining <= segLen || i === line.length - 1) {
      const t = segLen > 0 ? Math.min(remaining / segLen, 1) : 0;
      const lng = line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t;
      const lat = line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t;
      const bearing =
        (Math.atan2(line[i][1] - line[i - 1][1], line[i][0] - line[i - 1][0]) *
          180) /
        Math.PI;
      return { lat, lng, bearing };
    }

    remaining -= segLen;
  }

  const last = line[line.length - 1];
  return { lat: last[1], lng: last[0], bearing: 0 };
}

function sliceLineByDistance(
  line: LineCoordinate[],
  distanceMeters: number
): LineCoordinate[] {
  if (line.length < 2) return line;
  if (distanceMeters <= 0) return [line[0]];

  const total = getLineLengthMeters(line);
  if (distanceMeters >= total) return line;

  let remaining = distanceMeters;
  const sliced: LineCoordinate[] = [line[0]];

  for (let i = 1; i < line.length; i++) {
    const segLen = calculateDistance(
      line[i - 1][1],
      line[i - 1][0],
      line[i][1],
      line[i][0]
    );

    if (remaining <= segLen) {
      const t = segLen > 0 ? Math.min(remaining / segLen, 1) : 0;
      const lng = line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t;
      const lat = line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t;
      sliced.push([lng, lat]);
      break;
    }

    sliced.push(line[i]);
    remaining -= segLen;
  }

  return sliced;
}

async function fetchRoadRoute(waypoints: RouteType["waypoints"]): Promise<LineCoordinate[]> {
  if (waypoints.length < 2) return [];

  const coords = waypoints
    .map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`)
    .join(";");
  const url = `${ROUTE_SERVICE_URL}/${coords}?overview=full&geometries=geojson&steps=false`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ROUTE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Failed to fetch route");
    const data = await response.json();
    const route = data?.routes?.[0]?.geometry?.coordinates as LineCoordinate[] | undefined;
    if (!route || route.length < 2) throw new Error("No route geometry returned");
    return route;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getHashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  return COLORS[hash % COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return "?";
  return name.substring(0, 2).toUpperCase();
}

export default function App() {
  const screen = useAppStore((state) => state.screen);

  return (
    <div className="mobile-app-container">
      <AnimatePresence mode="wait">
        {screen === "login" && (
          <LoginScreen key="login" />
        )}
        {screen === "picker" && <PickerScreen key="picker" />}
        {screen === "map" && <MapScreen key="map" />}
      </AnimatePresence>
    </div>
  );
}

function LoginScreen() {
  const setScreen = useAppStore((state) => state.setScreen);
  const setToken = useAppStore((state) => state.setToken);
  const setUser = useAppStore((state) => state.setUser);
  const setUsername = useAppStore((state) => state.setUsername);
  const setUserID = useAppStore((state) => state.setUserID);

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || (isSignUp && !name.trim())) {
      setError("Please fill in all fields.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const host = import.meta.env.VITE_WS_HOST || window.location.host;
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      const endpoint = isSignUp ? "/api/auth/signup" : "/api/auth/login";
      
      const body = isSignUp 
        ? { email, password, name }
        : { email, password };

      const response = await fetch(`${protocol}//${host}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || data.error || "Authentication failed");
      }

      setToken(data.token);
      setUser(data.user);
      setUsername(data.user.name);
      setUserID(data.user.id);
      setScreen("picker");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = email.trim() && password.trim() && (!isSignUp || name.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="login-screen"
    >
      <div className="login-container">
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM18.9 16.4L15.3 12H18C18 8.68 15.32 6 12 6C8.68 6 6 8.68 6 12C6 15.32 8.68 18 12 18V20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12H21.5L18.9 16.4Z" fill="currentColor" />
            <path fillRule="evenodd" clipRule="evenodd" d="M14.6152 7.02558C17.4764 8.24357 18.9248 11.9686 17.29 14.8698C15.6552 17.7711 12.3902 18.0698 10.3709 15.5392L8.25752 12.8711C6.73145 10.9419 7.42063 8.01633 9.71261 7.21447L12.3683 6.27964C13.1256 6.01258 13.9168 6.27964 14.6152 7.02558Z" fill="currentColor" />
          </svg>
        </div>

        <h1 className="login-title">ParkQ Live</h1>
        <p className="login-subtitle">Move together, track together.</p>

        <form onSubmit={handleSubmit} style={{ width: "100%" }}>
          {isSignUp && (
            <div className="input-wrapper">
              <input
                type="text"
                placeholder="Full Name e.g. Rahul"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="login-input"
                required
              />
            </div>
          )}

          <div className="input-wrapper">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              required
            />
          </div>

          <div className="input-wrapper">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={!isFormValid || loading}>
            {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Log In"}
          </button>
        </form>

        <div style={{ marginTop: 12, textAlign: "center", fontSize: 14 }}>
          <button
            style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
          >
            {isSignUp ? "Already have an account? Log In" : "Don't have an account? Sign Up"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.25)", borderRadius: 10, color: "#ff6b6b", fontSize: 13, textAlign: "center", width: "100%" }}>
            {error}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PickerScreen() {
  const username = useAppStore((state) => state.username);
  const token = useAppStore((state) => state.token);
  const setGroupId = useAppStore((state) => state.setGroupId);
  const setScreen = useAppStore((state) => state.setScreen);
  const resetSession = useAppStore((state) => state.resetSession);

  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [roomID, setRoomID] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [generatedID, setGeneratedID] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isCreatingRoom) {
      const generated = Math.floor(100 + Math.random() * 900).toString();
      setGeneratedID(generated);
    } else {
      setGeneratedID("");
    }
    setError(null);
  }, [isCreatingRoom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalRoomID = isCreatingRoom ? generatedID : roomID.trim();
    if (!finalRoomID || !roomPassword.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const host = import.meta.env.VITE_WS_HOST || window.location.host;
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      const endpoint = isCreatingRoom ? "/api/rooms" : "/api/rooms/join";
      
      const body = { id: finalRoomID, password: roomPassword };

      const response = await fetch(`${protocol}//${host}${endpoint}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || data.error || "Failed to process room request");
      }

      setGroupId(finalRoomID);
      setScreen("map");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = (isCreatingRoom ? generatedID : roomID.trim()) && roomPassword.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.4 }}
      className="picker-screen"
    >
      <div className="onboarding-card">
        <h2>Hi, {username}!</h2>
        <p style={{ marginBottom: 24, color: "var(--ink-soft)" }}>
          {isCreatingRoom 
            ? "Create a secure room with a 3-digit Room ID"
            : "Enter a Room ID and Password to join the session"}
        </p>

        <form onSubmit={handleSubmit}>
          {isCreatingRoom ? (
            <div className="input-wrapper" style={{ marginBottom: 16 }}>
              <input
                className="setup-input"
                value={`Room ID: ${generatedID}`}
                disabled
                style={{ opacity: 0.8, fontWeight: 700, textAlign: "center", background: "var(--bg-panel-strong)" }}
              />
            </div>
          ) : (
            <div className="input-wrapper">
              <input
                className="setup-input"
                placeholder="Enter Room ID"
                value={roomID}
                onChange={(e) => setRoomID(e.target.value)}
                required
              />
            </div>
          )}

          <div className="input-wrapper">
            <input
              type="password"
              className="setup-input"
              placeholder="Enter Room Password"
              value={roomPassword}
              onChange={(e) => setRoomPassword(e.target.value)}
              required
            />
          </div>

          <button
            className="continue-btn"
            type="submit"
            disabled={!isFormValid || loading}
          >
            {loading ? "Please wait..." : isCreatingRoom ? "Create Room & Start" : "Join Room & Start"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 14 }}>
          <button
            style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}
            onClick={() => setIsCreatingRoom(!isCreatingRoom)}
          >
            {isCreatingRoom ? "Already have a Room ID? Join Room" : "Need a new room? Create Room"}
          </button>
        </div>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          <button
            style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", textDecoration: "underline" }}
            onClick={() => resetSession()}
          >
            Log Out
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.25)", borderRadius: 8, color: "#ff6b6b", fontSize: 13, textAlign: "center" }}>
            {error}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff} seconds ago`;
  const mins = Math.floor(diff / 60);
  return `${mins}m ago`;
}

function MapScreen() {
  const username = useAppStore((state) => state.username);
  const userID = useAppStore((state) => state.userID);
  const groupId = useAppStore((state) => state.groupId);
  const location = useAppStore((state) => state.location);
  const peers = useAppStore((state) => state.peers);
  const setLocation = useAppStore((state) => state.setLocation);
  const upsertPeer = useAppStore((state) => state.upsertPeer);
  const removePeer = useAppStore((state) => state.removePeer);
  const clearLiveData = useAppStore((state) => state.clearLiveData);
  const setScreen = useAppStore((state) => state.setScreen);
  const token = useAppStore((state) => state.token);
  const sim = useAppStore((state) => state.sim);
  const startSim = useAppStore((state) => state.startSim);
  const stopSim = useAppStore((state) => state.stopSim);
  const setSimProgress = useAppStore((state) => state.setSimProgress);
  const trip = useAppStore((state) => state.trip);
  const setTrip = useAppStore((state) => state.setTrip);
  const setWs = useAppStore((state) => state.setWs);
  const setChatMessages = useAppStore((state) => state.setChatMessages);
  const appendChatMessage = useAppStore((state) => state.appendChatMessage);
  const fitBounds = useAppStore((state) => state.fitBounds);
  const requestFitBounds = useAppStore((state) => state.requestFitBounds);
  const routePreview = useAppStore((state) => state.routePreview);
  const setRoutePreview = useAppStore((state) => state.setRoutePreview);
  const alerts = useAppStore((state) => state.alerts);
  const activePeerAlerts = useMemo(() => {
    return Object.values(alerts).filter((a) => a.userID !== userID);
  }, [alerts, userID]);
  const isSelfAlerting = !!alerts[userID];

  const ws = useRef<WebSocket | null>(null);
  const [, setTick] = useState(0);
  const [view, setView] = useState<"globe" | "map">("globe");
  const [chatOpen, setChatOpen] = useState(true);
  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_STYLES>("dark");
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const [locatedPeers, setLocatedPeers] = useState<Record<string, boolean>>({});
  const [routePath, setRoutePath] = useState<LineCoordinate[]>([]);
  const [routePathStatus, setRoutePathStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [participantRoutes, setParticipantRoutes] = useState<Record<string, LineCoordinate[]>>({});
  const [hiddenParticipantRouteIds, setHiddenParticipantRouteIds] = useState<Set<string>>(new Set());
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const mapRef = useRef<Maplibregl.Map | null>(null);
  const hasPannedRef = useRef(false);
  const initialFixDoneRef = useRef(false);
  const initialLocationPublishedRef = useRef(false);
  const participantRoutesRef = useRef<Record<string, LineCoordinate[]>>({});
  const participantRouteStateRef = useRef<
    Record<string, {
      inFlight: boolean;
      lastFetchTime: number;
      lastFetchOrigin: { lat: number; lng: number } | null;
      lastDestKey: string;
    }>
  >({});

  const peerEntries = useMemo(() => Object.entries(peers), [peers]);
  const mapStyleItems: NavItem[] = useMemo(
    () => [
      { id: "dark", icon: Moon, label: "Dark" },
      { id: "light", icon: Sun, label: "Light" },
      { id: "voyager", icon: Compass, label: "Voyager" },
    ],
    []
  );
  const toggleSimulate = useCallback(
    (route: RouteType) => {
      if (sim.active) {
        stopSim();
      } else {
        startSim(route);
      }
      setShowRoutePicker(false);
    },
    [sim.active, startSim, stopSim]
  );

  const toggleSOS = useCallback(() => {
    sendWsMessage("alert", {
      alerting: !isSelfAlerting,
    });
  }, [isSelfAlerting]);

  const locatePeer = useCallback((peerId: string) => {
    setView("map");
    const peer = peers[peerId];
    if (peer) {
      if (alerts[peerId]) {
        setLocatedPeers((prev) => ({ ...prev, [peerId]: true }));
      }
      setTimeout(() => {
        const map = mapRef.current;
        if (map) {
          map.flyTo({
            center: [peer.lng, peer.lat],
            zoom: Math.max(map.getZoom(), 15),
            duration: 800,
          });
        }
      }, 150);
    }
  }, [peers, setView, alerts]);

  const handleGetRoute = useCallback(async (peerId: string) => {
    const peer = peers[peerId];
    if (!peer || !location) return;

    try {
      const route = await getRoute(
        [location.lat, location.lng],
        [peer.lat, peer.lng]
      );
      setRoutePreview({
        origin: [location.lat, location.lng],
        dest: [peer.lat, peer.lng],
        coordinates: route.coordinates,
        distance: route.distance,
        duration: route.duration,
        destName: peer.name || peerId,
        isSos: true,
      });
      requestFitBounds([
        [location.lat, location.lng],
        [peer.lat, peer.lng],
      ]);
    } catch (err) {
      console.error("Failed to get route to SOS peer:", err);
    }
  }, [peers, location, setRoutePreview, requestFitBounds]);

  useEffect(() => {
    setLocatedPeers((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key in next) {
        if (!alerts[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [alerts]);

  useEffect(() => {
    let isStale = false;

    if (!sim.active || !sim.route) {
      setRoutePath([]);
      setRoutePathStatus("idle");
      return () => {
        isStale = true;
      };
    }

    setRoutePathStatus("loading");

    fetchRoadRoute(sim.route.waypoints)
      .then((path) => {
        if (isStale) return;
        setRoutePath(path);
        setRoutePathStatus("ready");
      })
      .catch(() => {
        if (isStale) return;
        setRoutePath([]);
        setRoutePathStatus("error");
      });

    return () => {
      isStale = true;
    };
  }, [sim.active, sim.route?.id]);

  // Geolocation tracking
  useEffect(() => {
    if (sim.active) return;

    // ── DEMO FALLBACK START ──────────────────────────────────────────────────
    // Remove this block once HTTPS/domain is configured — geolocation will work natively.
    const setFallbackLocation = () => {
      // Random position within central Delhi bounds
      const DELHI_BOUNDS = {
        latMin: 28.5800, latMax: 28.6400,
        lngMin: 77.1850, lngMax: 77.2400,
      };
      const randomLat = DELHI_BOUNDS.latMin + Math.random() * (DELHI_BOUNDS.latMax - DELHI_BOUNDS.latMin);
      const randomLng = DELHI_BOUNDS.lngMin + Math.random() * (DELHI_BOUNDS.lngMax - DELHI_BOUNDS.lngMin);

      const fallback: LocationData = {
        userID: username,
        groupID: groupId,
        lat: parseFloat(randomLat.toFixed(5)),
        lng: parseFloat(randomLng.toFixed(5)),
        name: username,
        timestamp: Date.now(),
        speed: 0,
      };
      setLocation(fallback);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "location", payload: fallback }));
      }
    };
    // ── DEMO FALLBACK END ────────────────────────────────────────────────────

    // ── DEMO FALLBACK START ──────────────────────────────────────────────────
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported — using fallback location");
      setFallbackLocation();
      return;
    }
    // ── DEMO FALLBACK END ────────────────────────────────────────────────────

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc: LocationData = {
          userID: userID,
          groupID: groupId,
          lat: parseFloat(pos.coords.latitude.toFixed(5)),
          lng: parseFloat(pos.coords.longitude.toFixed(5)),
          name: username,
          timestamp: Date.now(),
          speed: pos.coords.speed || 0,
        };
        setLocation(newLoc);

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: "location", payload: newLoc }));
        }
      },
      (error) => {
        // ── DEMO FALLBACK START ──────────────────────────────────────────────
        console.warn("Geolocation error (likely non-HTTPS) — using fallback:", error.message);
        setFallbackLocation();
        // ── DEMO FALLBACK END ────────────────────────────────────────────────
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [username, userID, groupId, sim.active, setLocation]);

  const fallbackRouteLine = useMemo(() => {
    if (!sim.route) return [];
    return sim.route.waypoints.map(([lat, lng]) => [lng, lat] as LineCoordinate);
  }, [sim.route]);

  const routeLine = useMemo(() => {
    if (routePath.length >= 2) return routePath;
    return fallbackRouteLine;
  }, [routePath, fallbackRouteLine]);

  const routeLengthMeters = useMemo(() => {
    return getLineLengthMeters(routeLine);
  }, [routeLine]);

  const completedRouteLine = useMemo(() => {
    if (!sim.active || routeLine.length < 2) return [];
    return sliceLineByDistance(routeLine, sim.progress);
  }, [sim.active, routeLine, sim.progress]);

  const simProgressPct =
    sim.active && routeLengthMeters > 0
      ? ((sim.progress / routeLengthMeters) * 100).toFixed(0)
      : "0";
  const statusColor =
    wsStatus === "connected"
      ? "var(--status-good)"
      : wsStatus === "connecting"
        ? "var(--status-warn)"
        : "var(--status-bad)";

  const routeCoordinates = useMemo(() => {
    if (!sim.active || routeLine.length < 2) return [];
    return routeLine;
  }, [sim.active, routeLine]);

  const participantLocations = useMemo(() => {
    if (!trip) return [] as Array<{
      id: string;
      name: string;
      color: string;
      lat: number;
      lng: number;
      timestamp: number;
    }>;

    const ids = new Set(trip.participants);
    ids.add(userID);

    const next: Array<{
      id: string;
      name: string;
      color: string;
      lat: number;
      lng: number;
      timestamp: number;
    }> = [];

    ids.forEach((id) => {
      if (id === userID) {
        if (!location) return;
        next.push({
          id,
          name: username,
          color: SELF_ROUTE_COLOR,
          lat: location.lat,
          lng: location.lng,
          timestamp: location.timestamp,
        });
        return;
      }

      const peer = peers[id];
      if (!peer) return;
      if (Date.now() - peer.timestamp > 60000) return;
      next.push({
        id,
        name: peer.name,
        color: getHashColor(peer.name),
        lat: peer.lat,
        lng: peer.lng,
        timestamp: peer.timestamp,
      });
    });

    return next;
  }, [trip, username, userID, location, peers]);

  const participantRouteLocations = useMemo(() => {
    if (!trip) return [] as typeof participantLocations;
    return participantLocations.filter((participant) => participant.id !== trip.creatorID);
  }, [participantLocations, trip]);

  useEffect(() => {
    participantRoutesRef.current = participantRoutes;
  }, [participantRoutes]);

  useEffect(() => {
    if (!trip) {
      setParticipantRoutes({});
      participantRouteStateRef.current = {};
      return;
    }

    const dest = trip.dest;
    const now = Date.now();
    const destKey = `${dest[0].toFixed(5)},${dest[1].toFixed(5)}`;
    const activeIds = new Set(participantRouteLocations.map((p) => p.id));

    setParticipantRoutes((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (!activeIds.has(id)) delete next[id];
      });
      return next;
    });

    Object.keys(participantRouteStateRef.current).forEach((id) => {
      if (!activeIds.has(id)) delete participantRouteStateRef.current[id];
    });

    participantRouteLocations.forEach((p) => {
      const state = participantRouteStateRef.current[p.id] ?? {
        inFlight: false,
        lastFetchTime: 0,
        lastFetchOrigin: null,
        lastDestKey: "",
      };

      if (state.lastDestKey !== destKey) {
        state.lastDestKey = destKey;
        state.lastFetchOrigin = null;
        state.lastFetchTime = 0;
      }

      if (state.inFlight) return;
      if (now - state.lastFetchTime < ROUTE_FETCH_MIN_INTERVAL_MS) return;

      const movedMeters = state.lastFetchOrigin
        ? calculateDistance(
          state.lastFetchOrigin.lat,
          state.lastFetchOrigin.lng,
          p.lat,
          p.lng
        )
        : Infinity;

      if (movedMeters < ROUTE_FETCH_MIN_DISTANCE_METERS) return;

      state.inFlight = true;
      participantRouteStateRef.current[p.id] = state;

      getRoute([p.lat, p.lng], dest)
        .then((res) => {
          const coordinates = res.coordinates.map(
            ([lat, lng]) => [lng, lat] as LineCoordinate
          );
          setParticipantRoutes((prev) => ({ ...prev, [p.id]: coordinates }));
          const current = participantRouteStateRef.current[p.id];
          if (current) {
            current.lastFetchOrigin = { lat: p.lat, lng: p.lng };
            current.lastFetchTime = Date.now();
            current.lastDestKey = destKey;
          }
        })
        .catch(() => { })
        .finally(() => {
          const current = participantRouteStateRef.current[p.id];
          if (current) {
            current.inFlight = false;
          }
        });
    });
  }, [trip, participantRouteLocations]);

  // Simulation tick
  useEffect(() => {
    if (!sim.active || !sim.route) return;

    const totalDistance = routeLengthMeters || getRouteLengthMeters(sim.route);
    if (!totalDistance) return;
    const speedMs = CYCLING_SPEED_KMH / 3.6;
    const distancePerTick = speedMs * (TICK_INTERVAL_MS / 1000);

    const interval = setInterval(() => {
      const currentProgress = useAppStore.getState().sim.progress;
      let newDist = currentProgress + distancePerTick;

      if (newDist >= totalDistance) {
        newDist = 0;
      }

      setSimProgress(newDist);

      const pos =
        routeLine.length >= 2
          ? getLinePosition(routeLine, newDist)
          : getRoutePosition(sim.route!, newDist);
      const newLoc: LocationData = {
        userID: userID,
        groupID: groupId,
        lat: parseFloat(pos.lat.toFixed(5)),
        lng: parseFloat(pos.lng.toFixed(5)),
        name: username,
        timestamp: Date.now(),
        speed: speedMs,
      };
      setLocation(newLoc);

      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "location", payload: newLoc }));
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    sim.active,
    sim.route,
    routeLine,
    routeLengthMeters,
    username,
    userID,
    groupId,
    setLocation,
    setSimProgress,
  ]);

  // WebSocket connection
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const activeSocketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let isMounted = true;

    function connect() {
      if (!isMounted) return;
      if (activeSocketRef.current &&
        (activeSocketRef.current.readyState === WebSocket.CONNECTING ||
          activeSocketRef.current.readyState === WebSocket.OPEN)) {
        return;
      }
      setWsStatus("connecting");
      const socket = new WebSocket(buildWsUrl(groupId, token));
      ws.current = socket;
      activeSocketRef.current = socket;
      setWs(socket);

      socket.onopen = () => {
        if (!isMounted || activeSocketRef.current !== socket) return;
        setWsStatus("connected");
        reconnectAttempt.current = 0;

        fetchActiveTrip(groupId).then((tripData) => {
          if (!isMounted) return;
          const currentTrip = useAppStore.getState().trip;

          if (tripData) {
            const decoded: import("./store/useAppStore").TripData = {
              id: tripData.id,
              creatorID: tripData.creatorID,
              creatorName: tripData.creatorName,
              origin: [tripData.originLat, tripData.originLng],
              originName: tripData.originName,
              dest: [tripData.destLat, tripData.destLng],
              destName: tripData.destName,
              routeCoordinates: tripData.routeGeometry
                ? parseRouteCoordinates(tripData.routeGeometry)
                : [],
              distanceMeters: tripData.distanceMeters,
              durationSeconds: tripData.durationSeconds,
              status: tripData.status as import("./store/useAppStore").TripData["status"],
              participants: tripData.participants || [],
              startedAt: tripData.startedAt || null,
            };
            setTrip(decoded);
            useAppStore.getState().setRoutePreview(null);
            requestFitBounds([decoded.origin, decoded.dest]);
            if (tripData.creatorID !== username) {
              sendWsMessage("trip_join");
            }
          } else if (currentTrip) {
            sendWsMessage("trip_create", {
              id: currentTrip.id,
              originLat: currentTrip.origin[0],
              originLng: currentTrip.origin[1],
              originName: currentTrip.originName,
              destLat: currentTrip.dest[0],
              destLng: currentTrip.dest[1],
              destName: currentTrip.destName,
              routeGeometry: JSON.stringify(currentTrip.routeCoordinates),
              distanceMeters: currentTrip.distanceMeters,
              durationSeconds: currentTrip.durationSeconds,
            });
          }
        }).catch(() => { });
      };

      socket.onmessage = (event) => {
        if (!isMounted || activeSocketRef.current !== socket) return;
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type || "location";
          const data = msg.payload || msg;

          switch (type) {
            case "location":
              if (data.offline) {
                removePeer(data.userID);
              } else if (data.userID !== userID) {
                upsertPeer(data);
              }
              break;
            case "trip_create": {
              const tripData: import("./store/useAppStore").TripData = {
                id: data.id,
                creatorID: data.creatorID,
                creatorName: data.creatorName,
                origin: [data.originLat, data.originLng],
                originName: data.originName,
                dest: [data.destLat, data.destLng],
                destName: data.destName,
                routeCoordinates: parseRouteCoordinates(data.routeGeometry || ""),
                distanceMeters: data.distanceMeters,
                durationSeconds: data.durationSeconds,
                status: data.status,
                participants: data.participants || [],
                startedAt: data.startedAt || null,
              };
              const prev = useAppStore.getState().trip;
              if (prev && prev.id === tripData.id) {
                setTrip(mergeTripParticipants(prev, tripData));
              } else {
                setTrip(tripData);
              }
              useAppStore.getState().setRoutePreview(null);
              requestFitBounds([tripData.origin, tripData.dest]);
              if (data.creatorID !== userID) {
                sendWsMessage("trip_join");
              }
              break;
            }
            case "trip_join":
              if (data.participants) {
                const prev = useAppStore.getState().trip;
                if (prev) setTrip({ ...prev, participants: Array.from(new Set(data.participants)) });
              }
              break;
            case "trip_leave":
              if (data.participants) {
                const prev = useAppStore.getState().trip;
                if (prev) setTrip({ ...prev, participants: Array.from(new Set(data.participants)) });
              }
              break;
            case "trip_start": {
              const prev = useAppStore.getState().trip;
              if (prev) setTrip({ ...prev, status: "active", startedAt: data.startedAt || prev.startedAt });
              break;
            }
            case "trip_end":
              setTrip(null);
              break;
            case "chat_history": {
              const items: unknown[] = Array.isArray(data.items)
                ? (data.items as unknown[])
                : Array.isArray(data.messages)
                  ? (data.messages as unknown[])
                  : Array.isArray(data)
                    ? (data as unknown[])
                    : [];

              const messages: NonNullable<ReturnType<typeof normalizeChatMessage>>[] = [];
              for (const item of items) {
                const message = normalizeChatMessage(item);
                if (message) {
                  messages.push(message);
                }
              }
              setChatMessages(messages);
              break;
            }
            case "chat_message": {
              const message = normalizeChatMessage(data.payload || data);
              if (message) {
                appendChatMessage(message);
              }
              break;
            }
            case "alert": {
              const { userID, name, alerting, timestamp } = data;
              useAppStore.getState().setAlert(userID, name, alerting, timestamp);
              break;
            }
          }
        } catch (err) {
          console.error("Failed to parse websocket message", err);
        }
      };

      socket.onclose = () => {
        if (!isMounted || activeSocketRef.current !== socket) return;
        activeSocketRef.current = null;
        setWsStatus("disconnected");
        const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 16000);
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const sock = activeSocketRef.current;
      activeSocketRef.current = null;
      if (sock) sock.close();
      ws.current = null;
      setWs(null);
    };
  }, [groupId, username, userID]);

  // Tick timer for "time ago" updates
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  // Reset pan tracking when simulation toggles
  useEffect(() => {
    if (wsStatus !== "connected") {
      initialLocationPublishedRef.current = false;
      return;
    }

    if (initialLocationPublishedRef.current) return;
    if (!location || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    ws.current.send(JSON.stringify({ type: "location", payload: location }));
    initialLocationPublishedRef.current = true;
  }, [wsStatus, location]);

  useEffect(() => {
    if (sim.active) {
      initialFixDoneRef.current = false;
      hasPannedRef.current = false;
    }
  }, [sim.active]);

  const activePeers = peerEntries.filter(([, peer]) => Date.now() - peer.timestamp < 60000).length;
  const lastPulse = location ? formatTimeAgo(location.timestamp) : "awaiting GPS";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="map-screen"
    >
      <div className="map-glass-texture" />

      {activePeerAlerts.length > 0 && (
        <div className="sos-banner-container">
          {activePeerAlerts.map((alert) => (
            <div key={alert.userID} className="sos-alert-banner">
              <div className="sos-pulse-ring">
                <div className="sos-pulse-dot" />
              </div>
              <div className="sos-banner-content">
                <div className="sos-banner-title">Emergency SOS Alert</div>
                <div className="sos-banner-desc">
                  <strong>{alert.name || alert.userID}</strong> needs help!
                </div>
              </div>
              {locatedPeers[alert.userID] ? (
                <button
                  className="sos-banner-cancel"
                  onClick={() => handleGetRoute(alert.userID)}
                >
                  Get Route
                </button>
              ) : (
                <button
                  className="sos-banner-cancel"
                  onClick={() => locatePeer(alert.userID)}
                >
                  Locate
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {view === "map" && (
        <>
          <div className="map-top-bar">
            <div className="map-top-row">
              <div className="trip-chip">
                <span
                  className="live-dot"
                  style={{ backgroundColor: statusColor }}
                />
                <span>Room {groupId}</span>
                {sim.active && (
                  <>
                    <span className="chip-separator">|</span>
                    <span className="chip-accent">
                      SIM {simProgressPct}%
                    </span>
                  </>
                )}
                {sim.active && routePathStatus === "loading" && (
                  <>
                    <span className="chip-separator">|</span>
                    <span className="chip-muted">Routing...</span>
                  </>
                )}
                <span className="chip-separator">|</span>
                <span>{activePeers + 1} live</span>
              </div>

              <div className="map-style-inline">
                {MAP_STYLE_ORDER.map((styleKey, idx) => {
                  const Icon = mapStyleItems[idx]?.icon;
                  if (!Icon) return null;
                  const isActive = mapStyle === styleKey;
                  return (
                    <button
                      key={styleKey}
                      className={`map-style-btn ${isActive ? "map-style-btn-active" : ""}`}
                      onClick={() => setMapStyle(styleKey)}
                      title={mapStyleItems[idx]?.label}
                      aria-label={mapStyleItems[idx]?.label}
                    >
                      <Icon size={15} strokeWidth={2} />
                    </button>
                  );
                })}
              </div>

              <div className="top-actions">
                <button
                  className="crosshair-btn"
                  onClick={() => {
                    const map = mapRef.current;
                    if (location && map) {
                      map.flyTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
                      hasPannedRef.current = false;
                      initialFixDoneRef.current = true;
                    }
                  }}
                  title="Recenter on me"
                >
                  <Navigation size={18} />
                </button>
                <button
                  className={`map-pill-btn sos-btn ${isSelfAlerting ? "active" : ""}`}
                  onClick={toggleSOS}
                  title={isSelfAlerting ? "Cancel SOS Alert" : "Trigger SOS Alert"}
                >
                  <span className="sos-dot" />
                  {isSelfAlerting ? "SOS Active" : "SOS"}
                </button>
                <button
                  className="map-pill-btn"
                  onClick={() => {
                    if (groupId) {
                      navigator.clipboard.writeText(groupId).catch(() => undefined);
                    }
                  }}
                  title="Copy room code"
                >
                  <ClipboardCopy size={15} />
                  Room
                </button>
                <button
                  className={`map-pill-btn ${chatOpen ? "sim-active" : ""}`}
                  onClick={() => setChatOpen((value) => !value)}
                  title="Toggle chat panel"
                >
                  <MessageSquare size={14} />
                  Chat
                </button>
                <div className="sim-btn-wrap">
                  <button
                    className={`map-pill-btn ${sim.active ? "sim-active" : ""}`}
                    onClick={() => {
                      if (sim.active) {
                        stopSim();
                      } else {
                        setShowRoutePicker(!showRoutePicker);
                      }
                    }}
                  >
                    <Radio size={14} />
                    {sim.active ? "Stop" : "Sim"}
                  </button>
                  {showRoutePicker && !sim.active && (
                    <>
                      <div className="modal-backdrop" onClick={() => setShowRoutePicker(false)} />
                      <div className="route-picker">
                        <div className="route-picker-header">Choose a route</div>
                        {SIM_ROUTES.map((route) => (
                          <button
                            key={route.id}
                            className="route-option"
                            onClick={() => toggleSimulate(route)}
                          >
                            <Route size={14} />
                            <div className="route-option-info">
                              <span className="route-option-name">{route.name}</span>
                              <span className="route-option-dist">{route.distanceKm} km</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  className="map-pill-btn danger"
                  onClick={() => {
                    stopSim();
                    clearLiveData();
                    setScreen("picker");
                  }}
                >
                  Leave
                </button>
              </div>
            </div>
          </div>

          <DestinationSearch />

        </>
      )}

      <div className="map-wrapper" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          {view === "globe" ? (
            <motion.div
              key="globe-view"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.7 }}
              style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg-main)" }}
            >
              <div style={{ width: "100%", maxWidth: "600px", padding: "20px" }}>
                <GlobeAnalytics
                  onZoomIn={() => setView("map")}
                  speed={0.005}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="map-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7 }}
              style={{ width: "100%", height: "100%" }}
            >
              <MapView
                center={[77.2090, 28.6139]}
                zoom={13}
                theme={mapStyle === "dark" ? "dark" : "light"}
                styles={{
                  dark: MAP_STYLES.dark,
                  light: mapStyle === "voyager" ? MAP_STYLES.voyager : MAP_STYLES.light,
                }}
                className="w-full h-full"
                onViewportChange={() => { }}
                ref={(map) => { mapRef.current = map; }}
              >
                <MapControls position="bottom-right" showZoom={false} />

                <MapBehaviorOnMount
                  location={location}
                  hasPannedRef={hasPannedRef}
                  initialFixDoneRef={initialFixDoneRef}
                  mapRef={mapRef}
                  fitBounds={fitBounds}
                />

                {sim.active && routeCoordinates.length >= 2 && (
                  <>
                    <MapRoute
                      id="sim-route-dashed"
                      coordinates={routeCoordinates}
                      color={ROUTE_COLOR}
                      width={4}
                      opacity={0.4}
                      dashArray={[2, 8]}
                      interactive={false}
                    />
                    {completedRouteLine.length >= 2 && (
                      <MapRoute
                        id="sim-route-complete"
                        coordinates={completedRouteLine}
                        color={ROUTE_COLOR}
                        width={5}
                        opacity={0.95}
                        interactive={false}
                      />
                    )}
                  </>
                )}

                {routePreview && (routePreview.isSos || !trip) && routePreview.coordinates.length >= 2 && (
                  <>
                    <MapRoute
                      id="preview-route"
                      coordinates={routePreview.coordinates.map(([lat, lng]) => [lng, lat] as [number, number])}
                      color={routePreview.isSos ? "#EF4444" : ROUTE_COLOR}
                      width={5}
                      opacity={routePreview.isSos ? 0.95 : 0.8}
                      interactive={false}
                    />
                    <MapMarker
                      longitude={routePreview.origin[1]}
                      latitude={routePreview.origin[0]}
                      anchor="center"
                    >
                      <MarkerContent>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#4CAF50", border: "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }} />
                      </MarkerContent>
                    </MapMarker>
                    <MapMarker
                      longitude={routePreview.dest[1]}
                      latitude={routePreview.dest[0]}
                      anchor="center"
                    >
                      <MarkerContent>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#EF5350", border: "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }} />
                      </MarkerContent>
                    </MapMarker>
                  </>
                )}

                {trip && participantRouteLocations.map((participant) => {
                  const coordinates = participantRoutes[participant.id];
                  if (!coordinates || coordinates.length < 2) return null;
                  if (hiddenParticipantRouteIds.has(participant.id)) return null;
                  return (
                    <MapRoute
                      key={`participant-route-${participant.id}`}
                      id={`participant-route-${participant.id}`}
                      coordinates={coordinates}
                      color={participant.color}
                      width={3}
                      opacity={0.55}
                      interactive={false}
                    />
                  );
                })}

                {trip && trip.routeCoordinates.length > 0 && (
                  <>
                    <MapRoute
                      id="trip-route"
                      coordinates={trip.routeCoordinates.map(([lat, lng]) => [lng, lat] as [number, number])}
                      color="#42A5F5"
                      width={5}
                      opacity={0.8}
                      interactive={false}
                    />
                    <MapMarker
                      longitude={trip.origin[1]}
                      latitude={trip.origin[0]}
                      anchor="center"
                    >
                      <MarkerContent>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#4CAF50", border: "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }} />
                      </MarkerContent>
                    </MapMarker>
                    <MapMarker
                      longitude={trip.dest[1]}
                      latitude={trip.dest[0]}
                      anchor="center"
                    >
                      <MarkerContent>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#EF5350", border: "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }} />
                      </MarkerContent>
                    </MapMarker>
                  </>
                )}

                {location && (
                  <MapMarker
                    longitude={location.lng}
                    latitude={location.lat}
                    anchor="bottom"
                    offset={[0, -20]}
                  >
                    <MarkerContent>
                      <div className={`custom-marker ${isSelfAlerting ? "alerting" : ""}`} style={{ borderColor: isSelfAlerting ? "var(--status-bad)" : SELF_COLOR }}>
                        {isSelfAlerting && <div className="marker-sos-ring" />}
                        <div className="custom-marker-inner" style={{ backgroundColor: isSelfAlerting ? "var(--status-bad)" : SELF_COLOR }}>
                          {getInitials(username)}
                        </div>
                      </div>
                    </MarkerContent>
                    <MarkerPopup offset={24} className="dark-popup">
                      <div className="popup-content">
                        <div className="popup-header">
                          <div className="avatar" style={{ backgroundColor: SELF_COLOR }}>{getInitials(username)}</div>
                          <div className="popup-title">
                            <h4>{username} (You)</h4>
                            <p><span className="live-dot" /> Live &middot; just now</p>
                          </div>
                        </div>
                        <div className="popup-row">
                          <span className="popup-label">Coordinates</span>
                          <span className="popup-value coord-value">
                            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    </MarkerPopup>
                  </MapMarker>
                )}

                {peerEntries.map(([peerId, peerData], index) => {
                  let dist = 0;
                  if (location) {
                    dist = calculateDistance(
                      location.lat,
                      location.lng,
                      peerData.lat,
                      peerData.lng
                    );
                  }
                  const distText =
                    dist > 1000
                      ? (dist / 1000).toFixed(2) + " km"
                      : Math.round(dist) + " m";

                  const timeSince = Date.now() - peerData.timestamp;
                  const isActive = timeSince < 60000;
                  const isPeerAlerting = !!alerts[peerId];

                  return (
                    <MapMarker
                      key={peerId || `peer-${peerData.name || "unknown"}-${peerData.timestamp}-${index}`}
                      longitude={peerData.lng}
                      latitude={peerData.lat}
                      anchor="bottom"
                      offset={[0, -20]}
                    >
                      <MarkerContent>
                        <div
                          className={`custom-marker ${isPeerAlerting ? "alerting" : ""}`}
                          style={{ borderColor: isPeerAlerting ? "var(--status-bad)" : (isActive ? getHashColor(peerData.name) : "var(--status-muted)") }}
                        >
                          {isPeerAlerting && <div className="marker-sos-ring" />}
                          <div
                            className="custom-marker-inner"
                            style={{ backgroundColor: isPeerAlerting ? "var(--status-bad)" : (isActive ? getHashColor(peerData.name) : "var(--status-muted)") }}
                          >
                            {getInitials(peerData.name)}
                          </div>
                        </div>
                      </MarkerContent>
                      <MarkerPopup offset={24} className="dark-popup">
                        <div className="popup-content">
                          <div className="popup-header">
                            <div className="avatar" style={{ backgroundColor: getHashColor(peerData.name) }}>
                              {getInitials(peerData.name)}
                            </div>
                            <div className="popup-title">
                              <h4>{peerData.name}</h4>
                              <p>
                                <span
                                  className="live-dot"
                                  style={{ backgroundColor: isActive ? "var(--status-good)" : "var(--status-muted)" }}
                                />
                                {isActive ? "Live" : "Offline"} &middot; {formatTimeAgo(peerData.timestamp)}
                              </p>
                            </div>
                          </div>
                          <div className="popup-row">
                            <span className="popup-label">Coordinates</span>
                            <span className="popup-value coord-value">
                              {peerData.lat.toFixed(5)}, {peerData.lng.toFixed(5)}
                            </span>
                          </div>
                          <div className="popup-row">
                            <span className="popup-label">Distance</span>
                            <span className="popup-value">{distText}</span>
                          </div>
                          <div className="popup-row">
                            <span className="popup-label">Last active</span>
                            <span className="popup-value">{formatTimeAgo(peerData.timestamp)}</span>
                          </div>
                          {peerData.speed !== undefined && (
                            <div className="popup-row">
                              <span className="popup-label">Speed</span>
                              <span className="popup-value">{(peerData.speed * 3.6).toFixed(1)} km/h</span>
                            </div>
                          )}
                        </div>
                      </MarkerPopup>
                    </MapMarker>
                  );
                })}
              </MapView>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {view === "map" && trip && (
        <div
          style={{
            position: "absolute",
            top: 90,
            left: 16,
            zIndex: 3,
            background: "rgba(10, 14, 18, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 12,
            padding: "10px 12px",
            backdropFilter: "blur(6px)",
            color: "#E8EEF6",
            fontSize: 12,
          }}
        >
          {(() => {
            const allSelected = hiddenParticipantRouteIds.size === 0;
            return (
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setHiddenParticipantRouteIds(new Set());
                    } else {
                      setHiddenParticipantRouteIds(new Set(participantRouteLocations.map((p) => p.id)));
                    }
                  }}
                  style={{ accentColor: "#42A5F5" }}
                />
                <span>All participant routes</span>
              </label>
            );
          })()}

          {participantRouteLocations.length > 0 && (
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {participantRouteLocations.map((participant) => {
                const isVisible = !hiddenParticipantRouteIds.has(participant.id);
                return (
                  <label
                    key={`legend-${participant.id}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={(e) => {
                        setHiddenParticipantRouteIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            next.delete(participant.id);
                          } else {
                            next.add(participant.id);
                          }
                          return next;
                        });
                      }}
                      style={{ accentColor: participant.color }}
                    />
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: participant.color,
                        boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.12)",
                        flex: "0 0 auto",
                      }}
                    />
                    <span style={{ opacity: 0.9 }}>{participant.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === "map" && !trip && (
        <div className="users-panel">
          <div className="drag-handle" />
          <div className="panel-head">
            <span>Last sync: {lastPulse}</span>
            <span>Active {activePeers + 1}</span>
          </div>

          <div
            className={`user-item ${isSelfAlerting ? "user-alerting" : ""}`}
            onClick={() => {
              setView("map");
              setTimeout(() => {
                const map = mapRef.current;
                if (location && map) {
                  map.flyTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
                  hasPannedRef.current = false;
                  initialFixDoneRef.current = true;
                }
              }, 150);
            }}
            style={{ cursor: "pointer" }}
          >
            <div className="avatar" style={{ backgroundColor: isSelfAlerting ? "var(--status-bad)" : SELF_COLOR }}>{getInitials(username)}</div>
            <div className="user-info">
              <div className="user-name flex items-center gap-2">
                {username} (You)
                {isSelfAlerting && <span className="sos-badge">SOS</span>}
              </div>
              <div className="user-status">{isSelfAlerting ? "🚨 PANIC ALERT ACTIVE" : "0m away · just now"}</div>
            </div>
            {isSelfAlerting ? (
              <div className="sos-pulse-small" />
            ) : (
              <div className="live-dot" />
            )}
          </div>

          {peerEntries.map(([peerId, peerData], index) => {
            let dist = 0;
            if (location) {
              dist = calculateDistance(
                location.lat,
                location.lng,
                peerData.lat,
                peerData.lng
              );
            }
            const distText =
              dist > 1000
                ? (dist / 1000).toFixed(2) + " km"
                : Math.round(dist) + " m";
            const timeSince = Date.now() - peerData.timestamp;
            const isActive = timeSince < 60000;
            const isPeerAlerting = !!alerts[peerId];

            return (
              <div
                className={`user-item ${isPeerAlerting ? "user-alerting" : ""}`}
                key={peerId || `peer-${peerData.name || "unknown"}-${peerData.timestamp}-${index}`}
                onClick={() => locatePeer(peerId)}
                style={{ cursor: "pointer" }}
              >
                <div className="avatar" style={{ backgroundColor: isPeerAlerting ? "var(--status-bad)" : (isActive ? getHashColor(peerData.name) : "var(--status-muted)") }}>
                  {getInitials(peerData.name)}
                </div>
                <div className="user-info">
                  <div className="user-name flex items-center gap-2">
                    {peerData.name}
                    {isPeerAlerting && <span className="sos-badge">SOS</span>}
                  </div>
                  <div className="user-status">
                    {isPeerAlerting ? "🚨 IN TROUBLE / SOS ACTIVE" : `${distText} away · ${formatTimeAgo(peerData.timestamp)}`}
                  </div>
                </div>
                {isPeerAlerting ? (
                  <div className="sos-pulse-small" />
                ) : (
                  <div
                    className="live-dot"
                    style={{ backgroundColor: isActive ? "var(--status-good)" : "var(--status-warn)" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === "map" && trip && (
        <TripPanel />
      )}

      {view === "map" && (
        <GroupChatPanel
          isOpen={chatOpen}
          onToggle={() => setChatOpen((value) => !value)}
        />
      )}
    </motion.div>
  );
}

function MapBehaviorOnMount({
  location,
  hasPannedRef,
  initialFixDoneRef,
  mapRef,
  fitBounds,
}: {
  location: LocationData | null;
  hasPannedRef: React.MutableRefObject<boolean>;
  initialFixDoneRef: React.MutableRefObject<boolean>;
  mapRef: React.MutableRefObject<Maplibregl.Map | null>;
  fitBounds: import("./store/useAppStore").FitBounds | null;
}) {
  const { map } = useMap();
  const prevFitKeyRef = useRef(0);

  useEffect(() => {
    if (!map) return;

    const handleDragStart = () => { hasPannedRef.current = true; };
    const handleZoomStart = () => { hasPannedRef.current = true; };

    map.on("dragstart", handleDragStart);
    map.on("zoomstart", handleZoomStart);

    return () => {
      map.off("dragstart", handleDragStart);
      map.off("zoomstart", handleZoomStart);
    };
  }, [map, hasPannedRef]);

  // Auto-fly to location on first fix
  useEffect(() => {
    if (location && !initialFixDoneRef.current && map) {
      map.flyTo({ center: [location.lng, location.lat], zoom: 16, duration: 800 });
      initialFixDoneRef.current = true;
    }
  }, [location, map, initialFixDoneRef]);

  // Sync mapRef for recenter button
  useEffect(() => {
    if (map) {
      mapRef.current = map;
    }
  }, [map, mapRef]);

  useEffect(() => {
    if (fitBounds && fitBounds.key !== prevFitKeyRef.current && map) {
      prevFitKeyRef.current = fitBounds.key;
      if (fitBounds.points.length >= 2) {
        const bounds = new Maplibregl.LngLatBounds();
        fitBounds.points.forEach((p) => bounds.extend([p[1], p[0]]));
        map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 800 });
        hasPannedRef.current = true;
      }
    }
  }, [fitBounds, map, hasPannedRef]);

  return null;
}
