# Graph Report - .  (2026-06-22)

## Corpus Check
- 78 files · ~163,722 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 511 nodes · 724 edges · 47 communities (32 shown, 15 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend UI Components & Store|Frontend UI Components & Store]]
- [[_COMMUNITY_Map rendering & layout layers|Map rendering & layout layers]]
- [[_COMMUNITY_Frontend Package Configuration|Frontend Package Configuration]]
- [[_COMMUNITY_Backend API Routing & Server|Backend API Routing & Server]]
- [[_COMMUNITY_Auth & Data Validation Cache|Auth & Data Validation Cache]]
- [[_COMMUNITY_WebSocket Event Hub & Trips|WebSocket Event Hub & Trips]]
- [[_COMMUNITY_Chat Store Mock Tests|Chat Store Mock Tests]]
- [[_COMMUNITY_Rate Limiter & WS Client|Rate Limiter & WS Client]]
- [[_COMMUNITY_Postgres Storage & Database Operations|Postgres Storage & Database Operations]]
- [[_COMMUNITY_Frontend TypeScript Config|Frontend TypeScript Config]]
- [[_COMMUNITY_OSRM Router & Server Startup|OSRM Router & Server Startup]]
- [[_COMMUNITY_Frontend Components & Tailwind Setup|Frontend Components & Tailwind Setup]]
- [[_COMMUNITY_Chat Media Architecture & Uploads|Chat Media Architecture & Uploads]]
- [[_COMMUNITY_Frontend UI Layout & Navigation|Frontend UI Layout & Navigation]]
- [[_COMMUNITY_Nominatim Geocoding Services|Nominatim Geocoding Services]]
- [[_COMMUNITY_Frontend TSConfig Node|Frontend TSConfig Node]]
- [[_COMMUNITY_Map Interactive controls|Map Interactive controls]]
- [[_COMMUNITY_Frontend Error Boundary Entry|Frontend Error Boundary Entry]]
- [[_COMMUNITY_OSRM Routing API Handler|OSRM Routing API Handler]]
- [[_COMMUNITY_Limelight Navbar Demo|Limelight Navbar Demo]]
- [[_COMMUNITY_Geocoding API Handler|Geocoding API Handler]]
- [[_COMMUNITY_Backend API Error Handling|Backend API Error Handling]]
- [[_COMMUNITY_Docker Services Infrastructure|Docker Services Infrastructure]]
- [[_COMMUNITY_Trip API Handler|Trip API Handler]]
- [[_COMMUNITY_UI Button Component|UI Button Component]]
- [[_COMMUNITY_Map Marker Context & Tooltips|Map Marker Context & Tooltips]]
- [[_COMMUNITY_Chat History API Handler|Chat History API Handler]]
- [[_COMMUNITY_OSRM Route Cache|OSRM Route Cache]]
- [[_COMMUNITY_Go Chat Validation Tests|Go Chat Validation Tests]]
- [[_COMMUNITY_Routing Interface|Routing Interface]]
- [[_COMMUNITY_Ponytail Customization Rules|Ponytail Customization Rules]]
- [[_COMMUNITY_WebSocket Message Envelopes|WebSocket Message Envelopes]]
- [[_COMMUNITY_Geocoder Structures|Geocoder Structures]]
- [[_COMMUNITY_Chat Database Models|Chat Database Models]]
- [[_COMMUNITY_Location Message Models|Location Message Models]]
- [[_COMMUNITY_Product Design Principles|Product Design Principles]]
- [[_COMMUNITY_Trip Database Models|Trip Database Models]]
- [[_COMMUNITY_Go Package Metadata|Go Package Metadata]]
- [[_COMMUNITY_Brand Personality|Brand Personality]]
- [[_COMMUNITY_Product User Target Profiles|Product User Target Profiles]]
- [[_COMMUNITY_README Features Outline|README Features Outline]]
- [[_COMMUNITY_Haversine Distance Formula|Haversine Distance Formula]]

## God Nodes (most connected - your core abstractions)
1. `Hub` - 26 edges
2. `cn()` - 20 edges
3. `compilerOptions` - 20 edges
4. `PostgresStore` - 16 edges
5. `fakeChatStore` - 15 edges
6. `useAppStore` - 15 edges
7. `Context` - 13 edges
8. `Handler` - 13 edges
9. `Context` - 13 edges
10. `Client` - 12 edges

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
- **Chat Specifications Flow** — frontend_readme_backend_chat_schema, frontend_readme_backend_chat_history_api, frontend_readme_backend_chat_websocket, readme_chat_media_architecture [INFERRED 0.85]
- **Docker Infrastructure Stack** — docker_compose_db, docker_compose_migrate, docker_compose_backend, docker_compose_frontend [EXTRACTED 1.00]

## Communities (47 total, 15 thin omitted)

### Community 0 - "Frontend UI Components & Store"
Cohesion: 0.06
Nodes (53): DestinationSearch(), GroupChatPanel(), GroupChatPanelProps, TripPanel(), ChatMessage, chatMessageKey(), ChatMessageKind, ChatMessageStatus (+45 more)

### Community 1 - "Map rendering & layout layers"
Cohesion: 0.05
Nodes (27): DEFAULT_ARC_LAYOUT, DEFAULT_ARC_PAINT, defaultStyles, MapArcDatum, MapArcEvent, MapArcLineLayout, MapArcLinePaint, MapArcProps (+19 more)

### Community 2 - "Frontend Package Configuration"
Cohesion: 0.06
Nodes (31): author, dependencies, class-variance-authority, clsx, cobe, framer-motion, lucide-react, maplibre-gl (+23 more)

### Community 3 - "Backend API Routing & Server"
Cohesion: 0.10
Nodes (19): Geocoder, Handler, Hub, Request, ResponseWriter, Router, TokenManager, Handler (+11 more)

### Community 4 - "Auth & Data Validation Cache"
Cohesion: 0.09
Nodes (18): NewTokenManager(), Claims, TokenManager, Duration, RWMutex, Time, ChatMessage, LocationMessage (+10 more)

### Community 5 - "WebSocket Event Hub & Trips"
Cohesion: 0.20
Nodes (10): Client, LocationMessage, RawMessage, Trip, Store, Hub, generateID(), NewHub() (+2 more)

### Community 6 - "Chat Store Mock Tests"
Cohesion: 0.15
Nodes (11): ChatMessage, Context, LocationMessage, Request, T, Trip, chatRequest(), TestGetGroupMessagesRejectsInvalidLimit() (+3 more)

### Community 7 - "Rate Limiter & WS Client"
Cohesion: 0.12
Nodes (16): Duration, Handler, Request, RWMutex, Time, Hub, Conn, Limit (+8 more)

### Community 8 - "Postgres Storage & Database Operations"
Cohesion: 0.16
Nodes (10): ChatMessage, Context, LocationMessage, Trip, DB, NullString, NewPostgresStore(), nullString() (+2 more)

### Community 9 - "Frontend TypeScript Config"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+15 more)

### Community 10 - "OSRM Router & Server Startup"
Cohesion: 0.13
Nodes (17): Cache, Client, Context, RouteRequest, Context, Duration, Config, envOrDefault() (+9 more)

### Community 11 - "Frontend Components & Tailwind Setup"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 12 - "Chat Media Architecture & Uploads"
Cohesion: 0.13
Nodes (16): Academic Building 1 Chat Attachment, Handler, Request, ResponseWriter, Context, Handler, TokenManager, Chat History HTTP REST API (+8 more)

### Community 13 - "Frontend UI Layout & Navigation"
Cohesion: 0.21
Nodes (13): cn(), BottomNavBar(), BottomNavBarProps, NavItem, Card(), CardAction(), CardContent(), CardDescription() (+5 more)

### Community 14 - "Nominatim Geocoding Services"
Cohesion: 0.26
Nodes (9): Cache, Client, Context, Time, NewNominatimGeocoder(), NominatimGeocoder, nominatimResult, Mutex (+1 more)

### Community 15 - "Frontend TSConfig Node"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include

### Community 16 - "Map Interactive controls"
Cohesion: 0.22
Nodes (9): MapBehaviorOnMount(), CompassButton(), MapArc(), MapClusterLayer(), MapControls(), MapMarker(), MapPopup(), MapRoute() (+1 more)

### Community 17 - "Frontend Error Boundary Entry"
Cohesion: 0.29
Nodes (3): ErrorBoundary, Props, State

### Community 18 - "OSRM Routing API Handler"
Cohesion: 0.43
Nodes (6): Request, ResponseWriter, Router, Handler, NewHandler(), parseCoord()

### Community 19 - "Limelight Navbar Demo"
Cohesion: 0.38
Nodes (4): navItems, LimelightNav(), LimelightNavProps, NavItem

### Community 20 - "Geocoding API Handler"
Cohesion: 0.47
Nodes (5): Geocoder, Request, ResponseWriter, Handler, NewHandler()

### Community 21 - "Backend API Error Handling"
Cohesion: 0.50
Nodes (4): Render(), envelope, errorBody, ResponseWriter

### Community 22 - "Docker Services Infrastructure"
Cohesion: 0.50
Nodes (5): Go Backend Service, Postgres Database Service, React Frontend Service, Database Migration Service, Frontend Root Entry Element

### Community 23 - "Trip API Handler"
Cohesion: 0.50
Nodes (3): Handler, Request, ResponseWriter

### Community 24 - "UI Button Component"
Cohesion: 0.50
Nodes (3): Button, ButtonProps, buttonVariants

### Community 25 - "Map Marker Context & Tooltips"
Cohesion: 0.50
Nodes (4): MarkerContent(), MarkerPopup(), MarkerTooltip(), useMarkerContext()

### Community 29 - "Routing Interface"
Cohesion: 1.00
Nodes (3): Router, RouteRequest, RouteResult

## Knowledge Gaps
- **192 isolated node(s):** `location-sharing-backend`, `RegisteredClaims`, `ChatMessage`, `LocationMessage`, `Request` (+187 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `New()` connect `Auth & Data Validation Cache` to `OSRM Router & Server Startup`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `main()` connect `OSRM Router & Server Startup` to `Postgres Storage & Database Operations`, `Auth & Data Validation Cache`, `WebSocket Event Hub & Trips`, `Nominatim Geocoding Services`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `NewHandler()` connect `Backend API Routing & Server` to `Auth & Data Validation Cache`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `location-sharing-backend`, `RegisteredClaims`, `ChatMessage` to the rest of the system?**
  _196 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend UI Components & Store` be split into smaller, more focused modules?**
  _Cohesion score 0.05575065847234416 - nodes in this community are weakly interconnected._
- **Should `Map rendering & layout layers` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `Frontend Package Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._