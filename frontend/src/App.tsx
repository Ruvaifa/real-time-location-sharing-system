import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap, useMapEvents, Popup } from "react-leaflet";
import { Moon, Sun, Compass, Radio, Navigation, Route, Flag } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import "./styles.css";
import { BottomNavBar, NavItem } from "./components/ui/bottom-nav-bar";
import { GlobeAnalytics } from "./components/ui/cobe-globe-analytics";
import { DestinationSearch } from "./components/DestinationSearch";
import { TripPanel } from "./components/TripPanel";
import { LocationData, Route as RouteType, useAppStore, sendWsMessage } from "./store/useAppStore";
import { decodePolyline } from "./lib/routing";
import { fetchActiveTrip, parseRouteCoordinates } from "./lib/trip";

function buildWsUrl(groupId: string, token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = import.meta.env.VITE_WS_HOST || window.location.host;
  return `${protocol}//${host}/ws/${groupId}?token=${token}`;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-shadow.png",
});

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

const COLORS = ["#5C6BC0", "#EC407A", "#FFCA28", "#26A69A", "#42A5F5"];
const MAP_STYLES = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  voyager: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
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

function createCustomIcon(name: string, isYou: boolean, isActive: boolean) {
  const color = isYou ? "#42A5F5" : isActive ? getHashColor(name) : "#888888";
  const initials = getInitials(name);

  const html = `
    <div class="custom-marker" style="border-color: ${color}">
      <div class="custom-marker-inner" style="background-color: ${color}">
        ${initials}
      </div>
    </div>
  `;

  return L.divIcon({
    className: "custom-marker-wrapper",
    html,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });
}

export default function App() {
  const screen = useAppStore((state) => state.screen);
  const setScreen = useAppStore((state) => state.setScreen);

  return (
    <div className="mobile-app-container">
      <AnimatePresence mode="wait">
        {screen === "login" && (
          <LoginScreen
            key="login"
            onContinue={() => setScreen("picker")}
          />
        )}
        {screen === "picker" && <PickerScreen key="picker" />}
        {screen === "map" && <MapScreen key="map" />}
      </AnimatePresence>
    </div>
  );
}

function LoginScreen({ onContinue }: { onContinue: () => void }) {
  const email = useAppStore((state) => state.email);
  const setEmail = useAppStore((state) => state.setEmail);

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
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM18.9 16.4L15.3 12H18C18 8.68 15.32 6 12 6C8.68 6 6 8.68 6 12C6 15.32 8.68 18 12 18V20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12H21.5L18.9 16.4Z" fill="black" />
            <path fillRule="evenodd" clipRule="evenodd" d="M14.6152 7.02558C17.4764 8.24357 18.9248 11.9686 17.29 14.8698C15.6552 17.7711 12.3902 18.0698 10.3709 15.5392L8.25752 12.8711C6.73145 10.9419 7.42063 8.01633 9.71261 7.21447L12.3683 6.27964C13.1256 6.01258 13.9168 6.27964 14.6152 7.02558Z" fill="black" />
          </svg>
        </div>

        <h1 className="login-title">ParkQ Live</h1>
        <p className="login-subtitle">Move together, track together.</p>

        <div className="input-wrapper">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input"
          />
          {email && (
            <button className="clear-input" onClick={() => setEmail("")}>
              &times;
            </button>
          )}
        </div>

        <button className="btn-primary" onClick={onContinue} disabled={!email.trim()}>
          Continue
        </button>

        <div className="divider">
          <span>or</span>
        </div>

        <button className="btn-secondary" onClick={onContinue}>
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        <button className="btn-secondary" onClick={onContinue}>
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.365 14.502c-0.015-3.66 2.971-5.412 3.109-5.495-1.698-2.483-4.321-2.819-5.249-2.863-2.236-0.225-4.364 1.317-5.513 1.317-1.135 0-2.88-1.282-4.707-1.246-2.404 0.035-4.636 1.398-5.875 3.551-2.527 4.372-0.645 10.846 1.815 14.398 1.192 1.733 2.628 3.668 4.492 3.593 1.782-0.078 2.457-1.155 4.606-1.155 2.133 0 2.76 1.155 4.638 1.121 1.93-0.04 3.167-1.745 4.343-3.469 1.36-1.996 1.921-3.927 1.95-4.027-0.04-0.018-3.593-1.378-3.609-5.725zM15.422 4.298c0.973-1.177 1.624-2.803 1.446-4.432-1.392 0.057-3.136 0.927-4.148 2.102-0.898 1.05-1.677 2.716-1.463 4.305 1.554 0.12 3.149-0.781 4.165-1.975z" fill="black" />
          </svg>
          Continue with Apple
        </button>
      </div>
    </motion.div>
  );
}

function PickerScreen() {
  const username = useAppStore((state) => state.username);
  const groupId = useAppStore((state) => state.groupId);
  const setUsername = useAppStore((state) => state.setUsername);
  const setGroupId = useAppStore((state) => state.setGroupId);
  const setScreen = useAppStore((state) => state.setScreen);
  const setToken = useAppStore((state) => state.setToken);

  const canStart = username.trim() && groupId.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.4 }}
      className="picker-screen"
    >
      <div className="onboarding-card">
        <h2>Join or create a room</h2>
        <p>Share the room name with your group</p>

        <input
          className="setup-input"
          placeholder="Your name e.g. Rahul"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="setup-input"
          placeholder="Room ID e.g. goa-trip-20"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        />

        <button
          className="continue-btn"
          onClick={async () => {
            if (!canStart) {
              alert("Please enter a Username and Room ID to start.");
              return;
            }
            try {
              const host = import.meta.env.VITE_WS_HOST || window.location.host;
              const protocol = window.location.protocol === "https:" ? "https:" : "http:";
              const response = await fetch(`${protocol}//${host}/login?username=${encodeURIComponent(username)}`, {
                method: "POST",
              });
              if (!response.ok) throw new Error("Auth failed");
              const data = await response.json();
              setToken(data.token);
              setScreen("map");
            } catch (err) {
              console.error(err);
              alert("Could not connect to the server.");
            }
          }}
          disabled={!canStart}
        >
          Start sharing location &rarr;
        </button>
        <div className="onboarding-footer">
          No account needed &middot; end-to-end ephemeral
        </div>
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
  const updateTripParticipants = useAppStore((state) => state.updateTripParticipants);
  const setTripStatus = useAppStore((state) => state.setTripStatus);
  const setWs = useAppStore((state) => state.setWs);
  const fitBounds = useAppStore((state) => state.fitBounds);
  const requestFitBounds = useAppStore((state) => state.requestFitBounds);

  const ws = useRef<WebSocket | null>(null);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<"globe" | "map">("globe");
  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_STYLES>("dark");
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const recenterRef = useRef<() => void>(() => {});

  const peerEntries = useMemo(() => Object.entries(peers), [peers]);
  const mapStyleItems: NavItem[] = useMemo(
    () => [
      { id: "dark", icon: Moon, label: "Dark" },
      { id: "light", icon: Sun, label: "Light" },
      { id: "voyager", icon: Compass, label: "Voyager" },
    ],
    []
  );
  const activeStyleIndex = MAP_STYLE_ORDER.indexOf(mapStyle);

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

  useEffect(() => {
    if (sim.active) return;

    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc: LocationData = {
          userID: username,
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
        console.error("Geolocation error: ", error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [username, groupId, sim.active, setLocation]);

  useEffect(() => {
    if (!sim.active || !sim.route) return;

    const totalDistance = getRouteLengthMeters(sim.route);
    const speedMs = CYCLING_SPEED_KMH / 3.6;
    const distancePerTick = speedMs * (TICK_INTERVAL_MS / 1000);

    const interval = setInterval(() => {
      const currentProgress = useAppStore.getState().sim.progress;
      let newDist = currentProgress + distancePerTick;

      if (newDist >= totalDistance) {
        newDist = 0;
      }

      setSimProgress(newDist);

      const pos = getRoutePosition(sim.route!, newDist);
      const newLoc: LocationData = {
        userID: username,
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
  }, [sim.active, sim.route, username, groupId, setLocation, setSimProgress]);

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    let isMounted = true;

    function connect() {
      if (!isMounted) return;
      setWsStatus("connecting");
      const socket = new WebSocket(buildWsUrl(groupId, token));
      ws.current = socket;
      setWs(socket);

      socket.onopen = () => {
        if (!isMounted) return;
        setWsStatus("connected");
        reconnectAttempt.current = 0;

        fetchActiveTrip(groupId).then((tripData) => {
          if (!isMounted || !tripData) return;
          const currentTrip = useAppStore.getState().trip;
          if (currentTrip) return;
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
          requestFitBounds([decoded.origin, decoded.dest]);
          if (tripData.creatorID !== username) {
            sendWsMessage("trip_join");
          }
        }).catch(() => {});
      };

      socket.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type || "location";
          const data = msg.payload || msg;
          console.log("[WS RECV]", type, data);

          switch (type) {
            case "location":
              if (data.offline) {
                removePeer(data.userID);
              } else if (data.userID !== username) {
                upsertPeer(data);
              }
              break;
            case "trip_created": {
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
              setTrip(tripData);
              requestFitBounds([tripData.origin, tripData.dest]);
              if (data.creatorID !== username) {
                sendWsMessage("trip_join");
              }
              break;
            }
            case "trip_joined":
              if (data.participants) {
                const prev = useAppStore.getState().trip;
                if (prev) setTrip({ ...prev, participants: data.participants });
              }
              break;
            case "trip_left":
              if (data.participants) {
                const prev = useAppStore.getState().trip;
                if (prev) setTrip({ ...prev, participants: data.participants });
              }
              break;
            case "trip_started": {
              const prev = useAppStore.getState().trip;
              if (prev) setTrip({ ...prev, status: "active", startedAt: data.startedAt || prev.startedAt });
              break;
            }
            case "trip_ended":
              setTrip(null);
              break;
          }
        } catch (err) {
          console.error("Failed to parse websocket message", err);
        }
      };

      socket.onclose = () => {
        if (!isMounted) return;
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
      ws.current?.close();
      setWs(null);
    };
  }, [groupId, username, upsertPeer, removePeer, setTrip, updateTripParticipants, setTripStatus, setWs]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const activePeers = peerEntries.filter(([, peer]) => Date.now() - peer.timestamp < 60000).length;
  const lastPulse = location ? formatTimeAgo(location.timestamp) : "awaiting GPS";

  const simProgressPct =
    sim.active && sim.route
      ? ((sim.progress / getRouteLengthMeters(sim.route)) * 100).toFixed(0)
      : "0";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="map-screen"
    >
      <div className="map-glass-texture" />

      {view === "map" && (
        <>
          <div className="map-top-bar">
            <div className="trip-chip">
              <span
                className="live-dot"
                style={{
                  backgroundColor:
                    wsStatus === "connected" ? "#4CAF50" :
                      wsStatus === "connecting" ? "#FFCA28" : "#EF5350"
                }}
              />
              <span>Room {groupId}</span>
              {sim.active && (
                <>
                  <span className="chip-separator">|</span>
                  <span style={{ color: "#FF9800", fontWeight: 700 }}>
                    SIM {simProgressPct}%
                  </span>
                </>
              )}
              <span className="chip-separator">|</span>
              <span>{activePeers + 1} live</span>
            </div>
            <div className="top-actions">
              <button
                className="map-pill-btn"
                onClick={() => {
                  if (groupId) {
                    navigator.clipboard.writeText(groupId).catch(() => undefined);
                  }
                }}
              >
                Copy room
              </button>
              <button
                className="crosshair-btn"
                onClick={() => recenterRef.current()}
                title="Recenter on me"
              >
                <Navigation size={18} />
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
                  <Radio size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                  {sim.active ? "Stop Sim" : "Sim Route"}
                </button>
                {showRoutePicker && !sim.active && (
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

          <div className="map-style-switcher-wrap" style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'auto', marginTop: '24px' }}>
            <BottomNavBar
              key={mapStyle}
              items={mapStyleItems}
              defaultActiveIndex={activeStyleIndex < 0 ? 0 : activeStyleIndex}
              onTabChange={(index) => {
                const nextStyle = MAP_STYLE_ORDER[index];
                if (nextStyle) {
                  setMapStyle(nextStyle);
                }
              }}
            />
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
              style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a0a" }}
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
              <MapContainer
                center={[28.6139, 77.2090]}
                zoom={13}
                zoomControl={false}
                style={{ width: "100%", height: "100%", backgroundColor: "#1e1e1e" }}
              >
                <TileLayer url={MAP_STYLES[mapStyle]} />
                <MapBehavior
                  location={location}
                  simActive={sim.active}
                  fitBounds={fitBounds}
                  onRecenterRef={recenterRef}
                />

                {sim.active && sim.route && (
                  <Polyline
                    positions={sim.route.waypoints}
                    pathOptions={{
                      color: "#FF9800",
                      weight: 4,
                      opacity: 0.7,
                      dashArray: "8 6",
                    }}
                  />
                )}

                {trip && trip.routeCoordinates.length > 0 && (
                  <>
                    <Polyline
                      positions={trip.routeCoordinates}
                      pathOptions={{
                        color: "#42A5F5",
                        weight: 5,
                        opacity: 0.8,
                      }}
                    />
                    <CircleMarker
                      center={trip.origin}
                      radius={7}
                      pathOptions={{ color: "#4CAF50", fillColor: "#4CAF50", fillOpacity: 1 }}
                    >
                      <Popup><strong>Start</strong></Popup>
                    </CircleMarker>
                    <CircleMarker
                      center={trip.dest}
                      radius={7}
                      pathOptions={{ color: "#EF5350", fillColor: "#EF5350", fillOpacity: 1 }}
                    >
                      <Popup><strong>{trip.destName || "Destination"}</strong></Popup>
                    </CircleMarker>
                  </>
                )}

                {location && (
                  <Marker
                    position={[location.lat, location.lng]}
                    icon={createCustomIcon(username, true, true)}
                  >
                    <Popup className="dark-popup">
                      <div className="popup-content">
                        <div className="popup-header">
                          <div className="avatar" style={{ backgroundColor: "#42A5F5" }}>{getInitials(username)}</div>
                          <div className="popup-title">
                            <h4>{username} (You)</h4>
                            <p><span className="live-dot" /> Live &middot; just now</p>
                          </div>
                        </div>
                        <div className="popup-row">
                          <span>Coordinates</span>
                          <span>{location.lat}, {location.lng}</span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {peerEntries.map(([peerId, peerData]) => {
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

                  return (
                    <Marker
                      key={peerId}
                      position={[peerData.lat, peerData.lng]}
                      icon={createCustomIcon(peerData.name, false, isActive)}
                    >
                      <Popup className="dark-popup">
                        <div className="popup-content">
                          <div className="popup-header">
                            <div className="avatar" style={{ backgroundColor: getHashColor(peerData.name) }}>
                              {getInitials(peerData.name)}
                            </div>
                            <div className="popup-title">
                              <h4>{peerData.name}</h4>
                              <p><span className="live-dot" style={{ backgroundColor: isActive ? '#4CAF50' : '#888' }} /> {isActive ? 'Live' : 'Offline'} &middot; {formatTimeAgo(peerData.timestamp)}</p>
                            </div>
                          </div>
                          <div className="popup-row">
                            <span>Coordinates</span>
                            <span>{peerData.lat.toFixed(5)}, {peerData.lng.toFixed(5)}</span>
                          </div>
                          <div className="popup-row">
                            <span>Distance from you</span>
                            <span>{distText}</span>
                          </div>
                          <div className="popup-row">
                            <span>Last active</span>
                            <span>{formatTimeAgo(peerData.timestamp)}</span>
                          </div>
                          {peerData.speed !== undefined && (
                            <div className="popup-row">
                              <span>Speed</span>
                              <span>{(peerData.speed * 3.6).toFixed(1)} km/h</span>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {view === "map" && (
        <div className="users-panel" style={{ zIndex: 10 }}>
          <div className="drag-handle" />
          <div className="panel-head">
            <span>Last update: {lastPulse}</span>
            <span>Tick {tick}</span>
          </div>

          <div className="user-item">
            <div className="avatar" style={{ backgroundColor: "#42A5F5" }}>{getInitials(username)}</div>
            <div className="user-info">
              <div className="user-name">{username} (You)</div>
              <div className="user-status">0m away &middot; just now</div>
            </div>
            <div className="live-dot" />
          </div>

          {peerEntries.map(([peerId, peerData]) => {
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

            return (
              <div className="user-item" key={peerId}>
                <div className="avatar" style={{ backgroundColor: isActive ? getHashColor(peerData.name) : "#888" }}>
                  {getInitials(peerData.name)}
                </div>
                <div className="user-info">
                  <div className="user-name">{peerData.name}</div>
                  <div className="user-status">{distText} away &middot; {formatTimeAgo(peerData.timestamp)}</div>
                </div>
                <div className="live-dot" style={{ backgroundColor: isActive ? '#4CAF50' : '#FFC107' }} />
              </div>
            );
          })}
        </div>
      )}

      {view === "map" && trip && (
        <TripPanel />
      )}
    </motion.div>
  );
}

function MapBehavior({
  location,
  simActive,
  fitBounds,
  onRecenterRef,
}: {
  location: LocationData | null;
  simActive: boolean;
  fitBounds: import("./store/useAppStore").FitBounds | null;
  onRecenterRef: React.MutableRefObject<() => void>;
}) {
  const map = useMap();
  const hasPannedRef = useRef(false);
  const initialFixDoneRef = useRef(false);
  const prevSimActiveRef = useRef(simActive);
  const prevFitKeyRef = useRef(0);

  useMapEvents({
    dragstart: () => { hasPannedRef.current = true; },
    zoomstart: () => { hasPannedRef.current = true; },
  });

  useEffect(() => {
    if (simActive && !prevSimActiveRef.current) {
      initialFixDoneRef.current = false;
      hasPannedRef.current = false;
    }
    prevSimActiveRef.current = simActive;
  }, [simActive]);

  useEffect(() => {
    if (location && !initialFixDoneRef.current) {
      map.flyTo([location.lat, location.lng], 16, { duration: 0.8 });
      initialFixDoneRef.current = true;
    }
  }, [location, map]);

  useEffect(() => {
    if (fitBounds && fitBounds.key !== prevFitKeyRef.current) {
      prevFitKeyRef.current = fitBounds.key;
      if (fitBounds.points.length >= 2) {
        const bounds = L.latLngBounds(fitBounds.points);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, duration: 0.8 });
        hasPannedRef.current = true;
      }
    }
  }, [fitBounds, map]);

  useEffect(() => {
    onRecenterRef.current = () => {
      if (location) {
        map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 15), {
          duration: 0.8,
        });
        hasPannedRef.current = false;
        initialFixDoneRef.current = true;
      }
    };
  }, [location, map, onRecenterRef]);

  return null;
}
