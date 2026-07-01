import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatMessage } from "../lib/chat";

export type Screen = "login" | "picker" | "map";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
}

export interface LocationData {
  userID: string;
  groupID: string;
  lat: number;
  lng: number;
  name: string;
  timestamp: number;
  speed?: number;
}

export interface AlertData {
  userID: string;
  name: string;
  timestamp: number;
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

export interface RoutePreviewData {
  origin: [number, number];
  dest: [number, number];
  coordinates: [number, number][];
  distance: number;
  duration: number;
  destName: string;
  isSos?: boolean;
}

const sessionStorageName = "rtls-session";

interface AppStore {
  screen: Screen;
  email: string;
  username: string;
  userID: string;
  groupId: string;
  location: LocationData | null;
  peers: Record<string, LocationData>;
  token: string;
  user: UserProfile | null;
  sim: SimState;
  trip: TripData | null;
  ws: WebSocket | null;
  fitBounds: FitBounds | null;
  routePreview: RoutePreviewData | null;
  chatMessages: ChatMessage[];
  alerts: Record<string, AlertData>;
  setScreen: (screen: Screen) => void;
  setEmail: (email: string) => void;
  setUsername: (username: string) => void;
  setUserID: (userID: string) => void;
  setGroupId: (groupId: string) => void;
  setToken: (token: string) => void;
  setUser: (user: UserProfile | null) => void;
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
  setRoutePreview: (preview: RoutePreviewData | null) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  appendChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;
  requestFitBounds: (points: [number, number][]) => void;
  clearFitBounds: () => void;
  setAlert: (userID: string, name: string, alerting: boolean, timestamp: number) => void;
  clearAlerts: () => void;
}

function chatMessageKey(message: ChatMessage): string {
  return (
    message.clientMessageId ||
    message.messageID ||
    `${message.userID}:${message.timestamp}:${message.text}`
  );
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      screen: "login",
      email: "",
      username: "",
      userID: "",
      groupId: "",
      location: null,
      peers: {},
      token: "",
      user: null,
      sim: { active: false, route: null, progress: 0 },
      trip: null,
      ws: null,
      fitBounds: null,
      routePreview: null,
      chatMessages: [],
      alerts: {},
      setScreen: (screen) => set({ screen }),
      setEmail: (email) => set({ email }),
      setUsername: (username) => set({ username }),
      setUserID: (userID) => set({ userID }),
      setGroupId: (groupId) => set({ groupId }),
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
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
      clearLiveData: () => set({ location: null, peers: {}, trip: null, routePreview: null, chatMessages: [], alerts: {} }),
      resetSession: () =>
        set({
          screen: "login",
          email: "",
          username: "",
          userID: "",
          groupId: "",
          location: null,
          peers: {},
          token: "",
          user: null,
          sim: { active: false, route: null, progress: 0 },
          trip: null,
          routePreview: null,
          chatMessages: [],
          alerts: {},
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
      setRoutePreview: (routePreview) => set({ routePreview }),
      setChatMessages: (messages) =>
        set((state) => {
          const incomingKeys = new Set(messages.map(chatMessageKey));
          const pendingOrNew = state.chatMessages.filter(
            (msg) => msg.status === "sending" || !incomingKeys.has(chatMessageKey(msg))
          );
          const combined = [...messages, ...pendingOrNew].sort((a, b) => a.timestamp - b.timestamp);
          return { chatMessages: combined };
        }),
      appendChatMessage: (message) =>
        set((state) => {
          const key = chatMessageKey(message);
          const existingIndex = state.chatMessages.findIndex((item) => chatMessageKey(item) === key);

          if (existingIndex === -1) {
            return { chatMessages: [...state.chatMessages, message] };
          }

          const next = [...state.chatMessages];
          next[existingIndex] = { ...next[existingIndex], ...message };
          return { chatMessages: next };
        }),
      clearChatMessages: () => set({ chatMessages: [] }),
      requestFitBounds: (points) =>
        set((state) => ({
          fitBounds: { points, key: (state.fitBounds?.key || 0) + 1 },
        })),
      clearFitBounds: () => set({ fitBounds: null }),
      setAlert: (userID, name, alerting, timestamp) =>
        set((state) => {
          const next = { ...state.alerts };
          if (alerting) {
            next[userID] = { userID, name, timestamp };
          } else {
            delete next[userID];
          }
          return { alerts: next };
        }),
      clearAlerts: () => set({ alerts: {} }),
    }),
    {
      name: sessionStorageName,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        screen: state.screen,
        email: state.email,
        username: state.username,
        userID: state.userID,
        groupId: state.groupId,
        token: state.token,
        user: state.user,
      }),
    }
  )
);

// Standalone — reads ws from store at call time, avoids set() side-effects
export function sendWsMessage(type: string, payload: Record<string, unknown> = {}) {
  const ws = useAppStore.getState().ws;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}
