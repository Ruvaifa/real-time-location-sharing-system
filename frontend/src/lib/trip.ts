import { decodePolyline } from "./routing";

export interface TripData {
  id: string;
  creatorID: string;
  creatorName: string;
  originLat: number;
  originLng: number;
  originName: string;
  destLat: number;
  destLng: number;
  destName: string;
  routeGeometry: string;
  distanceMeters: number;
  durationSeconds: number;
  status: string;
  participants: string[];
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
}

export function parseRouteCoordinates(routeGeometry: string): [number, number][] {
  if (!routeGeometry) return [];
  try {
    const parsed = JSON.parse(routeGeometry);
    if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
      return parsed as [number, number][];
    }
  } catch {}
  return decodePolyline(routeGeometry);
}

export async function fetchActiveTrip(groupID: string): Promise<TripData | null> {
  const res = await fetch(`/api/trip/${encodeURIComponent(groupID)}`);
  if (!res.ok) return null;
  const text = await res.text();
  if (text === "null" || !text) return null;
  return JSON.parse(text);
}
