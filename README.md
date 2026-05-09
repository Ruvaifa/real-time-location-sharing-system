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
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended for the full stack)

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env and set ALLOWED_ORIGINS, VITE_WS_HOST, etc.
```

### 2. Run with Docker (Recommended)

This runs the frontend, backend, Postgres, and the migration container.

```bash
docker compose up --build
```

Next runs do not require rebuilds unless you changed Dockerfiles or dependencies:

```bash
docker compose up
```

Open:
- Frontend: http://localhost:5173
- Backend health: http://localhost:8080/health

To inspect database records:

```bash
docker compose exec db psql -U app -d location_share
```

Example queries:

```sql
SELECT * FROM users ORDER BY created_at DESC LIMIT 10;
SELECT * FROM locations ORDER BY created_at DESC LIMIT 20;
```

You can also use the helper script (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-db.ps1
```

### 3. Run Locally (Without Docker)

### 3.1 Start the Go Backend

```bash
cd backend
make dev
# or: go run ./cmd/server
```

The backend listens on `:8080` by default (configurable via `PORT` env var).

### 3.2 Start the React Frontend

```bash
npm install
npm run dev
```

The frontend runs on `:5173` and connects to the backend via the `VITE_WS_HOST` env var.

If running locally without Docker, you'll also need Postgres and the migrations in `backend/migrations`.

## Project Structure

```
├── backend/
│   ├── cmd/server/          # Entrypoint with graceful shutdown
│   ├── internal/
│   │   ├── config/          # Environment-based configuration
│   │   ├── handler/         # HTTP/WebSocket handlers (chi router)
│   │   ├── middleware/      # CORS middleware with configurable origins
│   │   ├── model/           # Data types (LocationMessage, HubMessage)
│   │   ├── storage/          # Postgres store and retention pruner
│   │   ├── validate/        # Coordinate and input validation
│   │   └── websocket/       # Hub + Client with rate limiting
│   ├── migrations/           # Database schema migrations
│   ├── pkg/apierr/          # JSON error response helper
│   ├── Dockerfile           # Multi-stage Alpine build
│   ├── Dockerfile.dev       # Development Dockerfile
│   └── Makefile             # build, dev, test, lint
├── scripts/
│   └── check-db.ps1          # Query recent DB records
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
| `VITE_BACKEND_HTTP` | `http://localhost:8080` | HTTP base URL used by Vite proxy |
| `DB_HOST` | `localhost` | Postgres host |
| `DB_PORT` | `5432` | Postgres port |
| `DB_USER` | `app` | Postgres username |
| `DB_PASSWORD` | `app123` | Postgres password |
| `DB_NAME` | `location_share` | Postgres database name |
| `DB_SSLMODE` | `disable` | Postgres SSL mode |
| `LOCATION_RETENTION_DAYS` | `7` | Days to retain location history |

## License

MIT
