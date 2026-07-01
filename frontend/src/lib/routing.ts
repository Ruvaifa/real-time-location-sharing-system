import { useAppStore } from "../store/useAppStore";

export interface RouteResult {
  geometry: string;
  coordinates: [number, number][];
  distance: number;
  duration: number;
}

export async function getRoute(
  origin: [number, number],
  dest: [number, number]
): Promise<RouteResult> {
  const token = useAppStore.getState().token;
  const res = await fetch(`/api/route?origin=${origin[0]},${origin[1]}&dest=${dest[0]},${dest[1]}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Routing failed: ${res.status}`);
  }
  return res.json();
}

export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result >> 1;
    lat += dlat & 1 ? ~dlat : dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result >> 1;
    lng += dlng & 1 ? ~dlng : dlng;

    coords.push([lat / 1e5, lng / 1e5]);
  }

  return coords;
}
