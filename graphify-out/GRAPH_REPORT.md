# Graph Report - .  (2026-07-01)

## Corpus Check
- 80 files · ~165,330 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 289 nodes · 303 edges · 61 communities (21 shown, 40 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Backend Routing & Middleware|Core Backend Routing & Middleware]]
- [[_COMMUNITY_Frontend TSConfig|Frontend TSConfig]]
- [[_COMMUNITY_Frontend Shadcn & Styling|Frontend Shadcn & Styling]]
- [[_COMMUNITY_Frontend Package Manifest|Frontend Package Manifest]]
- [[_COMMUNITY_Cache & Validation Service|Cache & Validation Service]]
- [[_COMMUNITY_IP Rate Limiting Middleware|IP Rate Limiting Middleware]]
- [[_COMMUNITY_WebSocket clientserver|WebSocket client/server]]
- [[_COMMUNITY_Nominatim Geocoding Service|Nominatim Geocoding Service]]
- [[_COMMUNITY_Frontend Third-party Dependencies|Frontend Third-party Dependencies]]
- [[_COMMUNITY_OSRM Routing Engine|OSRM Routing Engine]]
- [[_COMMUNITY_Frontend TSConfig Node|Frontend TSConfig Node]]
- [[_COMMUNITY_Backend Logger Middleware|Backend Logger Middleware]]
- [[_COMMUNITY_System Architecture Docs|System Architecture Docs]]
- [[_COMMUNITY_JWT Token & Authentication|JWT Token & Authentication]]
- [[_COMMUNITY_Routing HTTP Handler|Routing HTTP Handler]]
- [[_COMMUNITY_Geocoding HTTP Handler|Geocoding HTTP Handler]]
- [[_COMMUNITY_Docker Compose Infrastructure|Docker Compose Infrastructure]]
- [[_COMMUNITY_Routing Cache|Routing Cache]]
- [[_COMMUNITY_Abstract Routing Router|Abstract Routing Router]]
- [[_COMMUNITY_Chat Validation Tests|Chat Validation Tests]]
- [[_COMMUNITY_Agentic Customizations & Rules|Agentic Customizations & Rules]]
- [[_COMMUNITY_Geocoding Interface|Geocoding Interface]]
- [[_COMMUNITY_Chat Message Models|Chat Message Models]]
- [[_COMMUNITY_Product Design Principles|Product Design Principles]]
- [[_COMMUNITY_Chat Message Types|Chat Message Types]]
- [[_COMMUNITY_Chat Message Key Types|Chat Message Key Types]]
- [[_COMMUNITY_Chat Message Kind Types|Chat Message Kind Types]]
- [[_COMMUNITY_Chat Message Status Types|Chat Message Status Types]]
- [[_COMMUNITY_Fetch Group Chat History Utility|Fetch Group Chat History Utility]]
- [[_COMMUNITY_Normalize Chat Message Utility|Normalize Chat Message Utility]]
- [[_COMMUNITY_Search Places Geocoding Utility|Search Places Geocoding Utility]]
- [[_COMMUNITY_Search Result Model|Search Result Model]]
- [[_COMMUNITY_Decode Polyline Utility|Decode Polyline Utility]]
- [[_COMMUNITY_Get Route Utility|Get Route Utility]]
- [[_COMMUNITY_Route Result Model|Route Result Model]]
- [[_COMMUNITY_Fetch Active Trip Utility|Fetch Active Trip Utility]]
- [[_COMMUNITY_Parse Route Coordinates Utility|Parse Route Coordinates Utility]]
- [[_COMMUNITY_Trip Data Model|Trip Data Model]]
- [[_COMMUNITY_Class Variance Authority Utility|Class Variance Authority Utility]]
- [[_COMMUNITY_Trip Model|Trip Model]]
- [[_COMMUNITY_Backend Go Module Definition|Backend Go Module Definition]]
- [[_COMMUNITY_Product Brand Personality Requirements|Product Brand Personality Requirements]]
- [[_COMMUNITY_Product User Profiles|Product User Profiles]]
- [[_COMMUNITY_Product Features Spec|Product Features Spec]]
- [[_COMMUNITY_Haversine Distance Spec|Haversine Distance Spec]]
- [[_COMMUNITY_Calculate Distance Utility|Calculate Distance Utility]]
- [[_COMMUNITY_App Store Alert Data Model|App Store Alert Data Model]]
- [[_COMMUNITY_App Store Fit Bounds Utility|App Store Fit Bounds Utility]]
- [[_COMMUNITY_App Store Location Data Model|App Store Location Data Model]]
- [[_COMMUNITY_App Store Route Model|App Store Route Model]]
- [[_COMMUNITY_App Store Route Preview Model|App Store Route Preview Model]]
- [[_COMMUNITY_App Store Screen State|App Store Screen State]]
- [[_COMMUNITY_App Store Send WS Message Utility|App Store Send WS Message Utility]]
- [[_COMMUNITY_App Store Trip Data Model|App Store Trip Data Model]]
- [[_COMMUNITY_Bottom Navigation Bar UI Component|Bottom Navigation Bar UI Component]]
- [[_COMMUNITY_Bottom Navigation Bar Item UI Component|Bottom Navigation Bar Item UI Component]]
- [[_COMMUNITY_Button Component Props|Button Component Props]]
- [[_COMMUNITY_Limelight Navigation Item UI Component|Limelight Navigation Item UI Component]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `Handler` - 13 edges
3. `IPRateLimiter` - 10 edges
4. `Render()` - 10 edges
5. `NominatimGeocoder` - 9 edges
6. `Client` - 8 edges
7. `Config` - 7 edges
8. `NewHandler()` - 7 edges
9. `RateLimit()` - 7 edges
10. `Cache` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Academic Building 1 Chat Attachment` --conceptually_related_to--> `Real-Time Chat & Media Architecture`  [INFERRED]
  backend/uploads/1/e71432a1dadf9ad00cb2bbefadb90cca.jpg → README.md
- `Chat History HTTP REST API` --conceptually_related_to--> `Real-Time Chat & Media Architecture`  [INFERRED]
  frontend/README_BACKEND_CHAT.md → README.md
- `Chat Messages Schema Design` --conceptually_related_to--> `Real-Time Chat & Media Architecture`  [INFERRED]
  frontend/README_BACKEND_CHAT.md → README.md
- `WebSocket Chat Integration Design` --conceptually_related_to--> `Real-Time Chat & Media Architecture`  [INFERRED]
  frontend/README_BACKEND_CHAT.md → README.md
- `Frontend Root Entry Element` --conceptually_related_to--> `React Frontend Service`  [INFERRED]
  frontend/index.html → docker-compose.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Docker Infrastructure Stack** — docker_compose_db, docker_compose_migrate, docker_compose_backend, docker_compose_frontend [EXTRACTED 1.00]
- **Chat Specifications Flow** — frontend_readme_backend_chat_schema, frontend_readme_backend_chat_history_api, frontend_readme_backend_chat_websocket, readme_chat_media_architecture [INFERRED 0.85]
- **Chat Specifications Flow** — frontend_readme_backend_chat_schema, frontend_readme_backend_chat_history_api, frontend_readme_backend_chat_websocket, readme_chat_media_architecture [INFERRED 0.85]
- **Docker Infrastructure Stack** — docker_compose_db, docker_compose_migrate, docker_compose_backend, docker_compose_frontend [EXTRACTED 1.00]

## Communities (61 total, 40 thin omitted)

### Community 0 - "Core Backend Routing & Middleware"
Cohesion: 0.08
Nodes (26): Render(), envelope, errorBody, Handler, Request, ResponseWriter, Geocoder, Handler (+18 more)

### Community 1 - "Frontend TSConfig"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+15 more)

### Community 2 - "Frontend Shadcn & Styling"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 3 - "Frontend Package Manifest"
Cohesion: 0.10
Nodes (19): author, description, devDependencies, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom, typescript (+11 more)

### Community 4 - "Cache & Validation Service"
Cohesion: 0.15
Nodes (12): Duration, RWMutex, Time, Cache, New(), Cache[V], entry, LocationMessage (+4 more)

### Community 5 - "IP Rate Limiting Middleware"
Cohesion: 0.19
Nodes (12): Duration, Handler, Request, RWMutex, Time, Limit, Limiter, IPRateLimiter (+4 more)

### Community 6 - "WebSocket client/server"
Cohesion: 0.17
Nodes (9): Hub, Config, envOrDefault(), envOrDefaultInt(), Load(), Conn, Once, main() (+1 more)

### Community 7 - "Nominatim Geocoding Service"
Cohesion: 0.26
Nodes (9): Cache, Client, Context, Time, NewNominatimGeocoder(), NominatimGeocoder, nominatimResult, Mutex (+1 more)

### Community 8 - "Frontend Third-party Dependencies"
Cohesion: 0.17
Nodes (12): dependencies, class-variance-authority, clsx, cobe, framer-motion, lucide-react, maplibre-gl, @radix-ui/react-slot (+4 more)

### Community 9 - "OSRM Routing Engine"
Cohesion: 0.29
Nodes (8): Cache, Client, Context, RouteRequest, RouteResult, NewOSRMRouter(), osrmGeoJSONResponse, OSRMRouter

### Community 10 - "Frontend TSConfig Node"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include

### Community 11 - "Backend Logger Middleware"
Cohesion: 0.32
Nodes (6): Handler, Request, LogEntry, LogFormatter, LoggerWithFormatter(), SanitizedLogFormatter

### Community 12 - "System Architecture Docs"
Cohesion: 0.29
Nodes (7): Academic Building 1 Chat Attachment, Chat History HTTP REST API, Chat Messages Schema Design, WebSocket Chat Integration Design, System Architecture, Real-Time Chat & Media Architecture, Real-Time Tracking

### Community 13 - "JWT Token & Authentication"
Cohesion: 0.38
Nodes (4): NewTokenManager(), Claims, TokenManager, RegisteredClaims

### Community 14 - "Routing HTTP Handler"
Cohesion: 0.43
Nodes (6): Request, ResponseWriter, Router, Handler, NewHandler(), parseCoord()

### Community 15 - "Geocoding HTTP Handler"
Cohesion: 0.47
Nodes (5): Geocoder, Request, ResponseWriter, Handler, NewHandler()

### Community 16 - "Docker Compose Infrastructure"
Cohesion: 0.50
Nodes (5): Go Backend Service, Postgres Database Service, React Frontend Service, Database Migration Service, Frontend Root Entry Element

### Community 18 - "Abstract Routing Router"
Cohesion: 1.00
Nodes (3): Router, RouteRequest, RouteResult

## Knowledge Gaps
- **157 isolated node(s):** `location-sharing-backend`, `RegisteredClaims`, `Handler`, `ResponseWriter`, `Request` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `WebSocket client/server` to `OSRM Routing Engine`, `Cache & Validation Service`, `Nominatim Geocoding Service`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `Handler` connect `Core Backend Routing & Middleware` to `WebSocket client/server`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `Render()` connect `Core Backend Routing & Middleware` to `IP Rate Limiting Middleware`, `Routing HTTP Handler`, `Geocoding HTTP Handler`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `Render()` (e.g. with `.Search()` and `.GetActiveTrip()`) actually correct?**
  _`Render()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `location-sharing-backend`, `RegisteredClaims`, `Handler` to the rest of the system?**
  _161 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Backend Routing & Middleware` be split into smaller, more focused modules?**
  _Cohesion score 0.08095238095238096 - nodes in this community are weakly interconnected._
- **Should `Frontend TSConfig` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._