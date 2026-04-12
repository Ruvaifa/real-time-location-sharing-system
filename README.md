# Real-Time Location-Sharing System

An interactive real-time location sharing platform with a React/Leaflet frontend and a Go WebSocket backend. Visualize live physical movement across groups using device GPS and concurrent server synchronization.

## Features

- **Interactive Maps**: Choose between multiple map styles (Monochrome, Terra, Standard, Satellite) powered by React-Leaflet.
- **Real-Time Tracking**: Uses the HTML5 `navigator.geolocation.watchPosition` API for live geographical updates.
- **Group Synchronization**: Go-based WebSocket Hub manages concurrent connections via channels, allowing peers to broadcast coordinates in isolated groups.
- **Haversine Distance**: Calculates real-world distance between users using the Haversine formula.
- **Mobile Optimized**: Native-app-like UI built with Framer Motion, optimized for mobile viewports.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (for the frontend)
- [Go](https://go.dev/) 1.23+ (for the backend)

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env and set ALLOWED_ORIGINS, VITE_WS_HOST, etc.
```

### 2. Start the Go Backend

```bash
cd backend
make dev
# or: go run ./cmd/server
```

The backend listens on `:8080` by default (configurable via `PORT` env var).

### 3. Start the React Frontend

```bash
npm install
npm run dev
```

The frontend runs on `:5173` and connects to the backend via the `VITE_WS_HOST` env var.

## Project Structure

```
├── backend/
│   ├── cmd/server/          # Entrypoint with graceful shutdown
│   ├── internal/
│   │   ├── config/          # Environment-based configuration
│   │   ├── handler/         # HTTP/WebSocket handlers (chi router)
│   │   ├── middleware/      # CORS middleware with configurable origins
│   │   ├── model/           # Data types (LocationMessage, HubMessage)
│   │   ├── validate/        # Coordinate and input validation
│   │   └── websocket/       # Hub + Client with rate limiting
│   ├── pkg/apierr/          # JSON error response helper
│   ├── Dockerfile           # Multi-stage Alpine build
│   └── Makefile             # build, dev, test, lint
├── src/
│   ├── App.jsx              # React app with map + picker screens
│   ├── main.jsx             # Entry point
│   └── styles.css           # UI styling
├── .env.example             # Environment variable template
└── package.json
```

## Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Map Rendering**: [Leaflet](https://leafletjs.com/) & [React-Leaflet](https://react-leaflet.js.org/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Backend**: [Go](https://go.dev/) + [Chi Router](https://github.com/go-chi/chi) + [Gorilla WebSockets](https://github.com/gorilla/websocket)

## Architecture

- **Go Channel Concurrency**: The backend uses idiomatic Go channels and a centralized select loop in the Hub to safely register users, manage groups, and broadcast coordinates — no mutexes needed.
- **In-Memory Caching**: The server caches the last known position of every user. Late joiners get all active markers replayed automatically.
- **Server-Trusted Identity**: The backend overwrites `userID`, `groupID`, and `timestamp` from the authenticated socket, never from the raw payload — preventing spoofing.
- **Rate Limiting**: Each client is rate-limited to prevent abuse (configurable via `MAX_MSG_RATE`).
- **Input Validation**: Coordinates are bounds-checked, names are length-capped, and NaN/Inf values are rejected before broadcast.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Backend listen port |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS/WebSocket origin whitelist |
| `APP_ENV` | `development` | Runtime environment |
| `MAX_GROUP_SIZE` | `64` | Max clients per group |
| `MAX_MSG_RATE` | `10` | Max messages per second per client |
| `VITE_WS_HOST` | `localhost:8080` | WebSocket host for the frontend |

## License

MIT
