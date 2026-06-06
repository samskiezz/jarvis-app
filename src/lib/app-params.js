const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
  if (isNode) return defaultValue;
  const storageKey = `kimi_${toSnakeCase(paramName)}`;
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get(paramName);
  if (removeFromUrl) {
    urlParams.delete(paramName);
    const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);
  }
  if (searchParam) {
    storage.setItem(storageKey, searchParam);
    return searchParam;
  }
  if (defaultValue) {
    storage.setItem(storageKey, defaultValue);
    return defaultValue;
  }
  const storedValue = storage.getItem(storageKey);
  return storedValue || null;
};

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

// Prefer an explicit VITE_API_BASE_URL. Otherwise derive the backend from the page's
// OWN host — so an app served from http://<server>:5173 talks to http://<server>:8000,
// not the viewer's localhost (the reason a deployed build showed all zeros). Only
// fall back to localhost for Node/SSR where there is no window.
const deriveFromLocation = () => {
  if (typeof window === 'undefined' || !window.location) return 'http://localhost:8000';
  const { protocol, hostname } = window.location;
  const port = env.VITE_API_PORT || '8000';
  return `${protocol}//${hostname}:${port}`;
};
const defaultApiBaseUrl =
  env.VITE_API_BASE_URL ||
  env.VITE_KIMI_K26_API_BASE_URL ||
  deriveFromLocation();

// Default to the backend's own default key ("dev-key") so a fresh self-hosted
// deploy authenticates out of the box; override with VITE_API_KEY in production.
const defaultApiKey = env.VITE_API_KEY || env.VITE_KIMI_K26_API_KEY || 'dev-key';

const getAppParams = () => {
  if (getAppParamValue('clear_api_key') === 'true') {
    storage.removeItem('kimi_api_key');
  }
  return {
    apiKey: getAppParamValue('api_key', { defaultValue: defaultApiKey, removeFromUrl: true }),
    apiBaseUrl: getAppParamValue('api_base_url', { defaultValue: defaultApiBaseUrl }),
    fromUrl: getAppParamValue('from_url', { defaultValue: isNode ? '' : window.location.href }),
  };
};

export const appParams = {
  ...getAppParams(),
};
