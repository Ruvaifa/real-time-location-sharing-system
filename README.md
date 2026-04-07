# 🅿️ ParkQ: Real-Time Location-Sharing System

Welcome to the **ParkQ Location-Sharing System**! This repository includes an interactive frontend built with React, Vite, and Leaflet, and a robust real-time backend powered by Golang WebSockets. Together, they visualize live physical movement across groups using real-time Geolocation tracking and concurrent server synchronization.

## ✨ Features

- **🗺️ Interactive Maps**: Choose between multiple map styles (Monochrome, Terra, Standard, Satellite) powered by React-Leaflet.
- **📍 Real-Time Tracking**: Polling real device GPS via the HTML5 `navigator.geolocation.watchPosition` API to ensure live geographical updates accurately.
- **👥 Group Synchronization**: Uses a Go-based WebSocket Hub to manage concurrent connections cleanly via channels, allowing peers to share and broadcast their coordinates instantly in individual groups.
- **🧮 Haversine Proximity**: Accurately calculates the real-world distance between users mathematically using the Haversine formula.
- **📱 Mobile Optimized**: Clean, native-app-like UI built with Framer Motion, fully optimized for mobile viewports (`100dvh`).

## 🚀 Getting Started

To run the application locally, you will need to run both the React Frontend and the Go Backend simultaneously.

### Prerequisites

- [Node.js](https://nodejs.org/) (for the frontend)
- [Go](https://go.dev/) 1.21+ (for the backend)

### 1. Start the Go Backend

The backend is a lightweight in-memory switchboard running on port `:8080`.

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Run the server:
   ```bash
   go run .
   ```

### 2. Start the React Frontend

The frontend runs using Vite, typically on port `:5173`. 

1. Open a **new terminal window** and navigate to the project root directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## 🛠️ Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Map Rendering**: [Leaflet](https://leafletjs.com/) & [React-Leaflet](https://react-leaflet.js.org/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Backend Hub**: [Go](https://go.dev/) (pure channels, no mutexes) + [Gorilla WebSockets](https://github.com/gorilla/websocket)

## 📝 Architecture Notes

- **Go Channel Concurrency**: The backend entirely avoids traditional memory `mutexes`. Instead, it uses idiomatic Go channels and a centralized select loop within `hub.go` to safely register users, delete empty groups, and broadcast coordinates across peers.
- **In-Memory Caching**: The server inherently caches the *last known* position of every user. If someone joins a group late or refreshes their page, the Go server automatically replays all active cached markers so they aren't looking at an empty map.
- **Production Integration**: The client is fully hardwired into the production backend endpoint (`ws://localhost:8080/ws/{groupID}`) eliminating all mock simulated environments.

---
*Built for the ParkQ Smart Parking Initiative.*
