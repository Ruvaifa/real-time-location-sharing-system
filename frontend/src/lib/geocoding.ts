import { useAppStore } from "../store/useAppStore";

export interface SearchResult {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const token = useAppStore.getState().token;
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }
  return res.json();
}
