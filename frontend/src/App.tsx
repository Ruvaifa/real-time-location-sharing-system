import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapContainer, TileLayer, Marker, useMap, Popup } from "react-leaflet";
import { Moon, Sun, Compass } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import "./styles.css";
import { BottomNavBar, NavItem } from "./components/ui/bottom-nav-bar";
import { GlobeAnalytics } from "./components/ui/cobe-globe-analytics";
import { LocationData, useAppStore } from "./store/useAppStore";

// Fix Leaflet's default icon rendering issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function calculateDistance(
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
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM18.9 16.4L15.3 12H18C18 8.68 15.32 6 12 6C8.68 6 6 8.68 6 12C6 15.32 8.68 18 12 18V20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12H21.5L18.9 16.4Z" fill="black"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M14.6152 7.02558C17.4764 8.24357 18.9248 11.9686 17.29 14.8698C15.6552 17.7711 12.3902 18.0698 10.3709 15.5392L8.25752 12.8711C6.73145 10.9419 7.42063 8.01633 9.71261 7.21447L12.3683 6.27964C13.1256 6.01258 13.9168 6.27964 14.6152 7.02558Z" fill="black"/>
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
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        
        <button className="btn-secondary" onClick={onContinue}>
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.365 14.502c-0.015-3.66 2.971-5.412 3.109-5.495-1.698-2.483-4.321-2.819-5.249-2.863-2.236-0.225-4.364 1.317-5.513 1.317-1.135 0-2.88-1.282-4.707-1.246-2.404 0.035-4.636 1.398-5.875 3.551-2.527 4.372-0.645 10.846 1.815 14.398 1.192 1.733 2.628 3.668 4.492 3.593 1.782-0.078 2.457-1.155 4.606-1.155 2.133 0 2.76 1.155 4.638 1.121 1.93-0.04 3.167-1.745 4.343-3.469 1.36-1.996 1.921-3.927 1.95-4.027-0.04-0.018-3.593-1.378-3.609-5.725zM15.422 4.298c0.973-1.177 1.624-2.803 1.446-4.432-1.392 0.057-3.136 0.927-4.148 2.102-0.898 1.05-1.677 2.716-1.463 4.305 1.554 0.12 3.149-0.781 4.165-1.975z" fill="black"/>
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
          onClick={() => {
            if (!canStart) {
              alert("Please enter a Username and Room ID to start.");
              return;
            }
            setScreen("map");
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

function LocationPanner({ location }: { location: LocationData | null }) {
  const map = useMap();
  const initiallyPanned = useRef(false);

  useEffect(() => {
    if (location && !initiallyPanned.current) {
      map.flyTo([location.lat, location.lng], 16);
      initiallyPanned.current = true;
    }
  }, [location, map]);

  return null;
}

function RecenterMap({ trigger, location }: { trigger: number; location: LocationData | null }) {
  const map = useMap();

  useEffect(() => {
    if (!location) return;
    map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 15));
  }, [trigger, location, map]);

  return null;
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
  const clearLiveData = useAppStore((state) => state.clearLiveData);
  const setScreen = useAppStore((state) => state.setScreen);

  const ws = useRef<WebSocket | null>(null);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<"globe" | "map">("globe");
  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_STYLES>("dark");
  const [recenterTrigger, setRecenterTrigger] = useState(0);

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

  useEffect(() => {
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
          ws.current.send(JSON.stringify(newLoc));
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
  }, [username, groupId]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/ws/${groupId}?userID=${username}&name=${username}`
    );
    ws.current = socket;

    socket.onmessage = (event) => {
      try {
        const data: LocationData = JSON.parse(event.data);

        if (data.userID !== username) {
          upsertPeer(data);
        }
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    return () => {
      socket.close();
    };
  }, [groupId, username, upsertPeer]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

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

      {view === "map" && (
        <>
          <div className="map-top-bar">
            <div className="trip-chip">
              <span className="live-dot" />
              <span>Room {groupId}</span>
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
              <button className="crosshair-btn" onClick={() => setRecenterTrigger((v) => v + 1)}>
                &oplus;
              </button>
              <button
                className="map-pill-btn danger"
                onClick={() => {
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
                center={[37.7749, -122.4194]}
                zoom={3}
                zoomControl={false}
                style={{ width: "100%", height: "100%", backgroundColor: "#1e1e1e" }}
              >
                <TileLayer url={MAP_STYLES[mapStyle]} />
                <LocationPanner location={location} />
                <RecenterMap trigger={recenterTrigger} location={location} />

                {location && (
                  <Marker
                    position={[location.lat, location.lng]}
                    icon={createCustomIcon(username, true, true)}
                  >
                    <Popup className="dark-popup">
                      <div className="popup-content">
                        <div className="popup-header">
                           <div className="avatar" style={{backgroundColor: "#42A5F5"}}>{getInitials(username)}</div>
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
                            <div className="avatar" style={{backgroundColor: getHashColor(peerData.name)}}>
                              {getInitials(peerData.name)}
                            </div>
                            <div className="popup-title">
                              <h4>{peerData.name}</h4>
                              <p><span className="live-dot" style={{backgroundColor: isActive ? '#4CAF50' : '#888'}} /> {isActive ? 'Live' : 'Offline'} &middot; {formatTimeAgo(peerData.timestamp)}</p>
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

      {/* Users list panel */}
      {view === "map" && (
        <div className="users-panel" style={{ zIndex: 10 }}>
          <div className="drag-handle" />
          <div className="panel-head">
            <span>Last update: {lastPulse}</span>
            <span>Tick {tick}</span>
          </div>
          
          <div className="user-item">
          <div className="avatar" style={{backgroundColor: "#42A5F5"}}>{getInitials(username)}</div>
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
              <div className="avatar" style={{backgroundColor: isActive ? getHashColor(peerData.name) : "#888"}}>
                {getInitials(peerData.name)}
              </div>
              <div className="user-info">
                <div className="user-name">{peerData.name}</div>
                <div className="user-status">{distText} away &middot; {formatTimeAgo(peerData.timestamp)}</div>
              </div>
              <div className="live-dot" style={{backgroundColor: isActive ? '#4CAF50' : '#FFC107'}} />
            </div>
           );
        })}
        </div>
      )}
    </motion.div>
  );
}