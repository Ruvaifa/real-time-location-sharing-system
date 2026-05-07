import { create } from "zustand";

const MAP_STYLES = [
  {
    id: "monochrome",
    name: "Monochrome",
    bg: "#b8b8b8",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    preview: "https://a.basemaps.cartocdn.com/light_all/10/163/395.png",
  },
  {
    id: "terra",
    name: "Terra",
    bg: "#898e79",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    preview:
      "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/6/24/17",
  },
  {
    id: "standard",
    name: "Standard",
    bg: "#2B5278",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    preview: "https://a.tile.openstreetmap.org/10/163/395.png",
  },
  {
    id: "satellite",
    name: "Satellite",
    bg: "#445946",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    preview:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/2",
  },
];

const useAppStore = create((set, get) => ({
  // --- UI navigation ---
  screen: "picker", // "picker" | "map"
  setScreen: (screen) => set({ screen }),

  // --- Map style ---
  mapStyles: MAP_STYLES,
  selectedStyle: "standard",
  setSelectedStyle: (id) => set({ selectedStyle: id }),
  getTileUrl: () => {
    const { mapStyles, selectedStyle } = get();
    const active = mapStyles.find((s) => s.id === selectedStyle);
    return active?.url || MAP_STYLES[2].url;
  },

  // --- User identity ---
  username: "",
  setUsername: (username) => set({ username }),
  groupId: "",
  setGroupId: (groupId) => set({ groupId }),
  token: "",
  setToken: (token) => set({ token }),

  // --- Pause toggle ---
  isPaused: false,
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  // --- Validation + screen transition ---
  joinGroup: async () => {
    const { username, groupId, setScreen, setToken } = get();
    const name = username.trim();
    const group = groupId.trim();
    if (!name || !group) {
      alert("Please enter a Username and Group ID to start.");
      return false;
    }

    try {
      // Fetch JWT token from backend
      const host = import.meta.env.VITE_WS_HOST || "localhost:8080";
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      const response = await fetch(`${protocol}//${host}/login?username=${encodeURIComponent(name)}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to authenticate with backend");
      }

      const data = await response.json();
      setToken(data.token);
      setScreen("map");
      return true;
    } catch (err) {
      console.error("Auth error:", err);
      alert("Could not connect to the server. Is the backend running?");
      return false;
    }
  },
}));

export default useAppStore;
