import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Pause,
  Volume2,
  Phone,
  Navigation,
  Globe2,
  Battery
} from "lucide-react";
import "./styles.css";

// Fix Leaflet's default icon rendering issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MAP_STYLES = [
  { 
    id: "monochrome", 
    name: "Monochrome", 
    bg: "#b8b8b8", 
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    preview: "https://a.basemaps.cartocdn.com/light_all/10/163/395.png"
  },
  { 
    id: "terra", 
    name: "Terra", 
    bg: "#898e79", 
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    preview: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/6/24/17"
  },
  { 
    id: "standard", 
    name: "Standard", 
    bg: "#2B5278", 
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    preview: "https://a.tile.openstreetmap.org/10/163/395.png"
  },
  { 
    id: "satellite", 
    name: "Satellite", 
    bg: "#445946", 
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    preview: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/2"
  },
];

// Mathematical Implementation: Haversine Formula connecting React and coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in metres
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // output in metres
}

export default function App() {
  const [screen, setScreen] = useState("picker"); 
  const [selectedStyle, setSelectedStyle] = useState("standard");
  const [username, setUsername] = useState("");
  const [groupId, setGroupId] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  const activeStyle = MAP_STYLES.find(s => s.id === selectedStyle);
  const tileUrl = activeStyle?.url || MAP_STYLES[2].url;

  return (
    <div className="mobile-app-container">
      <AnimatePresence mode="wait">
        {screen === "picker" && (
          <PickerScreen
            key="picker"
            selectedStyle={selectedStyle}
            setSelectedStyle={setSelectedStyle}
            username={username}
            setUsername={setUsername}
            groupId={groupId}
            setGroupId={setGroupId}
            onContinue={() => {
              if(!username.trim() || !groupId.trim()) {
                alert("Please enter a Username and Group ID to start.");
                return;
              }
              setScreen("map");
            }}
          />
        )}
        {screen === "map" && (
          <MapScreen
            key="map"
            tileUrl={tileUrl}
            isPaused={isPaused}
            setIsPaused={setIsPaused}
            onOpenPicker={() => setScreen("picker")}
            username={username}
            groupId={groupId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PickerScreen({ selectedStyle, setSelectedStyle, username, setUsername, groupId, setGroupId, onContinue }) {
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
        <h1 className="title">Setup ParkQ 🅿️</h1>
        <p className="subtitle">
          Choose a map style, enter your name, and join a group for real-time location sharing.
        </p>
      </div>

      <div className="setup-form">
        <input 
          className="setup-input" 
          placeholder="Your Name (e.g. Alice)" 
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input 
          className="setup-input" 
          placeholder="Group ID (e.g. squad-1)" 
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        />
      </div>

      <div className="picker-grid">
        {MAP_STYLES.map((style) => (
          <div
            key={style.id}
            className={`map-card ${selectedStyle === style.id ? "selected" : ""}`}
            onClick={() => setSelectedStyle(style.id)}
            style={{
              background: style.bg,
              backgroundImage: `url('${style.preview}')`,
              backgroundSize: "cover",
              backgroundPosition: "center"
            }}
          >
            {selectedStyle === style.id && <div className="card-border" />}
            <span className="card-label">{style.name}</span>
          </div>
        ))}
      </div>

      <div className="picker-controls">
        <button className="continue-btn" onClick={onContinue}>
          Join Group & Connect
        </button>
      </div>
      
      <div className="picker-footer">
        <div className="footer-logo">ParkQ</div>
        <div className="footer-credits">Smart Parking</div>
      </div>
    </motion.div>
  );
}

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

function MapScreen({ tileUrl, isPaused, setIsPaused, onOpenPicker, username, groupId }) {
  const [location, setLocation] = useState(null);
  const [peers, setPeers] = useState({});
  const ws = useRef(null);

  // 1. REAL Geolocation Tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (isPaused) return;
        
        const newLoc = {
          lat: parseFloat(pos.coords.latitude.toFixed(5)),
          lng: parseFloat(pos.coords.longitude.toFixed(5)),
        };
        setLocation(newLoc);

        // Send broadcast to real websocket
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            userID: username,
            groupID: groupId,
            name: username,
            lat: newLoc.lat,
            lng: newLoc.lng,
            timestamp: Date.now()
          }));
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
  }, [username, groupId, isPaused]);

  // 2. REAL WebSocket Connection Configuration
  useEffect(() => {
    // Connect mapping to our brand new Go Backend endpoint
    const socket = new WebSocket(`ws://localhost:8080/ws/${groupId}?userID=${username}&name=${username}`);
    ws.current = socket;

    socket.onopen = () => {
      console.log("Connected to Real-time Backend!");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // data matches LocationMessage struct: {userID, groupID, lat, lng, name, timestamp}
        setPeers(prev => ({
          ...prev,
          [data.userID]: { lat: data.lat, lng: data.lng, timestamp: data.timestamp, name: data.name }
        }));
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    socket.onclose = () => {
      console.log("Disconnected from backend");
    };

    return () => {
      socket.close();
    };
  }, [groupId, username]);

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
          center={[37.7749, -122.4194]} // Default fallback
          zoom={3} 
          zoomControl={false}
          style={{ width: "100%", height: "100%", zIndex: 0 }}
        >
          <TileLayer url={tileUrl} />
          
          <LocationPanner location={location} />

          {/* User's own marker */}
          {location && (
            <Marker position={[location.lat, location.lng]}>
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>{username} (You)</strong><br/>
                  Locating... Lat: {location.lat}, Lng: {location.lng}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Connected Group Peer Markers with Enhanced Popups */}
          {Object.entries(peers).map(([peerName, peerData]) => {
            let dist = 0;
            if(location) {
               dist = calculateDistance(location.lat, location.lng, peerData.lat, peerData.lng);
            }
            const distText = dist > 1000 ? (dist/1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
            const lastSeen = peerData.timestamp ? new Date(peerData.timestamp).toLocaleTimeString() : 'Unknown';

            return (
              <Marker key={peerName} position={[peerData.lat, peerData.lng]}>
                <Popup>
                  <div>
                    <strong>{peerName}</strong><br/>
                    Coords: {peerData.lat}, {peerData.lng}<br/>
                    Distance: {distText} away<br/>
                    Last Seen: {lastSeen}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className="map-ui-layer">
        {/* Top Left Controls */}
        <div className="controls-left">
          <button 
            className={`island-btn ${isPaused ? 'active' : ''}`}
            onClick={() => setIsPaused(!isPaused)}
            title="Pause Location Sharing"
          >
            <Pause fill="currentColor" size={20} />
          </button>
        </div>

        {/* Top Right Controls */}
        <div className="controls-right">
          <div className="vertical-capsule">
            <button className="nav-btn"><Phone fill="currentColor" size={18} /></button>
            <button className="nav-btn primary"><Navigation fill="currentColor" size={20} /></button>
            <button className="nav-btn" onClick={onOpenPicker}><Globe2 size={20} /></button>
            <button className="nav-btn"><Battery size={18} /></button>
          </div>
        </div>

        {/* Bottom Panel */}
        <div className="bottom-panel">
          <div className="apple-maps-branding">
            <span className="apple-logo">ParkQ Connected</span> 
            <span className="legal">Group: {groupId}</span>
          </div>
          <div className="panel-stats">
            <div className="stat-block left">
              <span className="stat-label">Active Users</span>
              <div className="stat-value"><strong>{Object.keys(peers).length + 1}</strong></div>
            </div>
            <div className="stat-block right">
              <span className="stat-label">Current Lat,Lng</span>
              <div className="stat-value">
                <span style={{fontSize: "14px"}}>
                  {location ? `${location.lat}, ${location.lng}` : "Polling GPS..."}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
