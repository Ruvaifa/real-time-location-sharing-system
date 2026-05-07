import { create } from "zustand";

const useLocationStore = create((set) => ({
  // --- User's own GPS position ---
  location: null,
  setLocation: (location) => set({ location }),

  // --- Connected peers: { [userID]: { lat, lng, name, timestamp } } ---
  peers: {},
  setPeer: (userID, data) =>
    set((state) => ({
      peers: { ...state.peers, [userID]: data },
    })),
  removePeer: (userID) =>
    set((state) => {
      const next = { ...state.peers };
      delete next[userID];
      return { peers: next };
    }),
  clearPeers: () => set({ peers: {} }),
}));

export default useLocationStore;
