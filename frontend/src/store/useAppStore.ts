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

interface AppStore {
  screen: Screen;
  email: string;
  username: string;
  groupId: string;
  location: LocationData | null;
  peers: Record<string, LocationData>;
  token: string;
  sim: SimState;
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
  clearLiveData: () => set({ location: null, peers: {} }),
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
    }),
  startSim: (route) =>
    set({ sim: { active: true, route, progress: 0 } }),
  stopSim: () =>
    set({ sim: { active: false, route: null, progress: 0 } }),
  setSimProgress: (progress) =>
    set((state) => ({ sim: { ...state.sim, progress } })),
}));
