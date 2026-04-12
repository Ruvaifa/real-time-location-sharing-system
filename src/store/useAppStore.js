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

  // --- Pause toggle ---
  isPaused: false,
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  // --- Validation + screen transition ---
  joinGroup: () => {
    const { username, groupId, setScreen } = get();
    const name = username.trim();
    const group = groupId.trim();
    if (!name || !group) {
      alert("Please enter a Username and Group ID to start.");
      return false;
    }
    if (name.length > 32) {
      alert("Username must be 32 characters or less.");
      return false;
    }
    if (group.length > 64) {
      alert("Group ID must be 64 characters or less.");
      return false;
    }
    setScreen("map");
    return true;
  },
}));

export default useAppStore;
