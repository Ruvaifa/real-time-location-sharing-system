import { create } from "zustand";

export type Screen = "login" | "picker" | "map";

export interface LocationData {
  userID: string;
  groupID: string;
  lat: number;
  lng: number;
  name: string;
  timestamp: number;
  speed?: number;
}

export interface Route {
  id: string;
  name: string;
  distanceKm: number;
  waypoints: [number, number][];
}

interface SimState {
  active: boolean;
  route: Route | null;
  progress: number;
}

export interface TripData {
  id: string;
  creatorID: string;
  creatorName: string;
  origin: [number, number];
  originName: string;
  dest: [number, number];
  destName: string;
  routeCoordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  status: "planning" | "active" | "completed";
  participants: string[];
  startedAt: number | null;
}

export interface FitBounds {
  points: [number, number][];
  key: number;
}

interface AppStore {
  screen: Screen;
  email: string;
  username: string;
  groupId: string;
  location: LocationData | null;
  peers: Record<string, LocationData>;
  token: string;
  sim: SimState;
  trip: TripData | null;
  ws: WebSocket | null;
  fitBounds: FitBounds | null;
  setScreen: (screen: Screen) => void;
  setEmail: (email: string) => void;
  setUsername: (username: string) => void;
  setGroupId: (groupId: string) => void;
  setToken: (token: string) => void;
  setLocation: (location: LocationData | null) => void;
  upsertPeer: (peer: LocationData) => void;
  clearLiveData: () => void;
  resetSession: () => void;
  removePeer: (userID: string) => void;
  startSim: (route: Route) => void;
  stopSim: () => void;
  setSimProgress: (progress: number) => void;
  setTrip: (trip: TripData | null) => void;
  updateTripParticipants: (participants: string[]) => void;
  setTripStatus: (status: TripData["status"]) => void;
  setWs: (ws: WebSocket | null) => void;
  requestFitBounds: (points: [number, number][]) => void;
  clearFitBounds: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  screen: "login",
  email: "",
  username: "",
  groupId: "",
  location: null,
  peers: {},
  token: "",
  sim: { active: false, route: null, progress: 0 },
  trip: null,
  ws: null,
  fitBounds: null,
  setScreen: (screen) => set({ screen }),
  setEmail: (email) => set({ email }),
  setUsername: (username) => set({ username }),
  setGroupId: (groupId) => set({ groupId }),
  setToken: (token) => set({ token }),
  setLocation: (location) => set({ location }),
  upsertPeer: (peer) =>
    set((state) => ({
      peers: {
        ...state.peers,
        [peer.userID]: peer,
      },
    })),
  removePeer: (userID) =>
    set((state) => {
      const next = { ...state.peers };
      delete next[userID];
      return { peers: next };
    }),
  clearLiveData: () => set({ location: null, peers: {}, trip: null }),
  resetSession: () =>
    set({
      screen: "login",
      email: "",
      username: "",
      groupId: "",
      location: null,
      peers: {},
      token: "",
      sim: { active: false, route: null, progress: 0 },
      trip: null,
    }),
  startSim: (route) =>
    set({ sim: { active: true, route, progress: 0 } }),
  stopSim: () =>
    set({ sim: { active: false, route: null, progress: 0 } }),
  setSimProgress: (progress) =>
    set((state) => ({ sim: { ...state.sim, progress } })),
  setTrip: (trip) => set({ trip }),
  updateTripParticipants: (participants) =>
    set((state) => {
      if (!state.trip) return {};
      return { trip: { ...state.trip, participants } };
    }),
  setTripStatus: (status) =>
    set((state) => {
      if (!state.trip) return {};
      return { trip: { ...state.trip, status } };
    }),
  setWs: (ws) => set({ ws }),
  requestFitBounds: (points) =>
    set((state) => ({
      fitBounds: { points, key: (state.fitBounds?.key || 0) + 1 },
    })),
  clearFitBounds: () => set({ fitBounds: null }),
}));

// Standalone — reads ws from store at call time, avoids set() side-effects
export function sendWsMessage(type: string, payload: Record<string, unknown> = {}) {
  const ws = useAppStore.getState().ws;
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log("[WS SEND]", type, payload);
    ws.send(JSON.stringify({ type, payload }));
  } else {
    console.warn("[WS SEND] socket not open, dropping:", type);
  }
}
