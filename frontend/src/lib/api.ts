export function backendHost(): string {
  const raw = import.meta.env.VITE_WS_HOST || window.location.host;
  return raw.replace(/^https?:\/\//, "").replace(/^wss?:\/\//, "").replace(/\/$/, "");
}

export function apiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_BACKEND_HTTP;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${backendHost()}`;
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function wsUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${backendHost()}${path.startsWith("/") ? path : `/${path}`}`;
}
