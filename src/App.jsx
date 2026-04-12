import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Pause, Phone, Navigation, Globe2, Battery } from "lucide-react";
import "./styles.css";

import useAppStore from "./store/useAppStore";
import useLocationStore from "./store/useLocationStore";

// Fix Leaflet's default icon path (runs once at module load).
let leafletFixed = false;
if (!leafletFixed) {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
  leafletFixed = true;
}

// ---------- Haversine distance (metres) ----------
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- Root ----------
export default function App() {
  const screen = useAppStore((s) => s.screen);
  const tileUrl = useAppStore((s) => s.getTileUrl());

  return (
    <div className="mobile-app-container">
      <AnimatePresence mode="wait">
        {screen === "picker" && <PickerScreen key="picker" />}
        {screen === "map" && <MapScreen key="map" tileUrl={tileUrl} />}
      </AnimatePresence>
    </div>
  );
}

// ---------- Picker Screen ----------
function PickerScreen() {
  const mapStyles = useAppStore((s) => s.mapStyles);
  const selectedStyle = useAppStore((s) => s.selectedStyle);
  const setSelectedStyle = useAppStore((s) => s.setSelectedStyle);
  const username = useAppStore((s) => s.username);
  const setUsername = useAppStore((s) => s.setUsername);
  const groupId = useAppStore((s) => s.groupId);
  const setGroupId = useAppStore((s) => s.setGroupId);
  const joinGroup = useAppStore((s) => s.joinGroup);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.4 }}
      className="picker-screen"
    >
      <div className="globe-bg-element"></div>

      <div className="picker-header">
        <div className="pagination-dots">
          <span></span>
          <span className="active"></span>
          <span></span>
          <span></span>
        </div>
        <h1 className="title">Setup Location 🅿️</h1>
        <p className="subtitle">
          Choose a map style, enter your name, and join a group for real-time
          location sharing.
        </p>
      </div>

      <div className="setup-form">
        <input
          className="setup-input"
          placeholder="Your Name (e.g. Alice)"
          value={username}
          maxLength={32}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="setup-input"
          placeholder="Group ID (e.g. squad-1)"
          value={groupId}
          maxLength={64}
          onChange={(e) => setGroupId(e.target.value)}
        />
      </div>

      <div className="picker-grid">
        {mapStyles.map((style) => (
          <div
            key={style.id}
            className={`map-card ${selectedStyle === style.id ? "selected" : ""}`}
            onClick={() => setSelectedStyle(style.id)}
            style={{
              background: style.bg,
              backgroundImage: `url('${style.preview}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {selectedStyle === style.id && <div className="card-border" />}
            <span className="card-label">{style.name}</span>
          </div>
        ))}
      </div>

      <div className="picker-controls">
        <button className="continue-btn" onClick={joinGroup}>
          Join Group & Connect
        </button>
      </div>

      <div className="picker-footer">
        <div className="footer-logo">LiveTrack</div>
        <div className="footer-credits">Real-Time Location</div>
      </div>
    </motion.div>
  );
}

// ---------- Location Panner ----------
function LocationPanner({ location }) {
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

// ---------- Map Screen ----------
function MapScreen({ tileUrl }) {
  const username = useAppStore((s) => s.username);
  const groupId = useAppStore((s) => s.groupId);
  const isPaused = useAppStore((s) => s.isPaused);
  const togglePause = useAppStore((s) => s.togglePause);
  const setScreen = useAppStore((s) => s.setScreen);

  const location = useLocationStore((s) => s.location);
  const setLocation = useLocationStore((s) => s.setLocation);
  const peers = useLocationStore((s) => s.peers);
  const setPeer = useLocationStore((s) => s.setPeer);
  const removePeer = useLocationStore((s) => s.removePeer);
  const clearPeers = useLocationStore((s) => s.clearPeers);

  const ws = useRef(null);
  const isPausedRef = useRef(isPaused);

  // Keep ref in sync so the geo callback reads the latest without restarting.
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // 1. Geolocation — stable deps, reads isPaused via ref.
  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (isPausedRef.current) return;

        const newLoc = {
          lat: parseFloat(pos.coords.latitude.toFixed(5)),
          lng: parseFloat(pos.coords.longitude.toFixed(5)),
        };
        setLocation(newLoc);

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(
            JSON.stringify({
              userID: username,
              groupID: groupId,
              name: username,
              lat: newLoc.lat,
              lng: newLoc.lng,
              timestamp: Date.now(),
            })
          );
        }
      },
      (err) => console.error("Geolocation error:", err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [username, groupId, setLocation]);

  // 2. WebSocket — env-aware URL, clears peers on reconnect.
  useEffect(() => {
    clearPeers();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = import.meta.env.VITE_WS_HOST || "localhost:8080";
    const qs = new URLSearchParams({ userID: username, name: username });
    const socket = new WebSocket(
      `${protocol}//${host}/ws/${encodeURIComponent(groupId)}?${qs}`
    );
    ws.current = socket;

    socket.onopen = () => console.log("Connected to backend");

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.offline) {
          removePeer(data.userID);
        } else {
          setPeer(data.userID, {
            lat: data.lat,
            lng: data.lng,
            timestamp: data.timestamp,
            name: data.name,
          });
        }
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    socket.onclose = () => console.log("Disconnected from backend");

    return () => socket.close();
  }, [groupId, username, clearPeers, setPeer, removePeer]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="map-screen"
    >
      <div className="map-view-container">
        <MapContainer
          center={[37.7749, -122.4194]}
          zoom={3}
          zoomControl={false}
          style={{ width: "100%", height: "100%", zIndex: 0 }}
        >
          <TileLayer url={tileUrl} />
          <LocationPanner location={location} />

          {/* Own marker */}
          {location && (
            <Marker position={[location.lat, location.lng]}>
              <Popup>
                <div style={{ textAlign: "center" }}>
                  <strong>{username} (You)</strong>
                  <br />
                  Lat: {location.lat}, Lng: {location.lng}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Peer markers */}
          {Object.entries(peers).map(([peerId, peer]) => {
            let dist = 0;
            if (location) {
              dist = calculateDistance(
                location.lat,
                location.lng,
                peer.lat,
                peer.lng
              );
            }
            const distText =
              dist > 1000
                ? (dist / 1000).toFixed(2) + " km"
                : Math.round(dist) + " m";
            const secsAgo = peer.timestamp
              ? Math.round((Date.now() - peer.timestamp) / 1000)
              : null;
            const lastSeen =
              secsAgo !== null
                ? secsAgo < 60
                  ? `${secsAgo}s ago`
                  : `${Math.round(secsAgo / 60)}m ago`
                : "Unknown";

            return (
              <Marker key={peerId} position={[peer.lat, peer.lng]}>
                <Popup>
                  <div>
                    <strong>{peer.name || peerId}</strong>
                    <br />
                    Coords: {peer.lat}, {peer.lng}
                    <br />
                    Distance: {distText} away
                    <br />
                    Last Seen: {lastSeen}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className="map-ui-layer">
        {/* Top Left */}
        <div className="controls-left">
          <button
            className={`island-btn ${isPaused ? "active" : ""}`}
            onClick={togglePause}
            title="Pause Location Sharing"
          >
            <Pause fill="currentColor" size={20} />
          </button>
        </div>

        {/* Top Right */}
        <div className="controls-right">
          <div className="vertical-capsule">
            <button className="nav-btn">
              <Phone fill="currentColor" size={18} />
            </button>
            <button className="nav-btn primary">
              <Navigation fill="currentColor" size={20} />
            </button>
            <button className="nav-btn" onClick={() => setScreen("picker")}>
              <Globe2 size={20} />
            </button>
            <button className="nav-btn">
              <Battery size={18} />
            </button>
          </div>
        </div>

        {/* Bottom Panel */}
        <div className="bottom-panel">
          <div className="apple-maps-branding">
            <span className="apple-logo">Connected</span>
            <span className="legal">Group: {groupId}</span>
          </div>
          <div className="panel-stats">
            <div className="stat-block left">
              <span className="stat-label">Active Users</span>
              <div className="stat-value">
                <strong>{Object.keys(peers).length + 1}</strong>
              </div>
            </div>
            <div className="stat-block right">
              <span className="stat-label">Current Lat,Lng</span>
              <div className="stat-value">
                <span style={{ fontSize: "14px" }}>
                  {location
                    ? `${location.lat}, ${location.lng}`
                    : "Polling GPS..."}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
