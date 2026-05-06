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

interface AppStore {
  screen: Screen;
  email: string;
  username: string;
  groupId: string;
  location: LocationData | null;
  peers: Record<string, LocationData>;
  setScreen: (screen: Screen) => void;
  setEmail: (email: string) => void;
  setUsername: (username: string) => void;
  setGroupId: (groupId: string) => void;
  setLocation: (location: LocationData | null) => void;
  upsertPeer: (peer: LocationData) => void;
  clearLiveData: () => void;
  resetSession: () => void;
  removePeer: (userID: string) => void
}

export const useAppStore = create<AppStore>((set) => ({
  screen: "login",
  email: "",
  username: "",
  groupId: "",
  location: null,
  peers: {},
  setScreen: (screen) => set({ screen }),
  setEmail: (email) => set({ email }),
  setUsername: (username) => set({ username }),
  setGroupId: (groupId) => set({ groupId }),
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
    }),
}));