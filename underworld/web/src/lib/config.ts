export const API_BASE_URL =
  (import.meta.env.VITE_UNDERWORLD_API_URL as string | undefined) || "http://localhost:8000";

const STORAGE_KEY = "underworld_api_key";

export function getApiKey(): string {
  const url = new URLSearchParams(window.location.search);
  const fromUrl = url.get("api_key");
  if (fromUrl) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    url.delete("api_key");
    const next = `${window.location.pathname}${url.toString() ? `?${url.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, next);
    return fromUrl;
  }
  return (
    localStorage.getItem(STORAGE_KEY) ||
    (import.meta.env.VITE_UNDERWORLD_API_KEY as string | undefined) ||
    ""
  );
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}
