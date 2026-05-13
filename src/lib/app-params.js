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

const getAppParams = () => {
  if (getAppParamValue('clear_api_key') === 'true') {
    storage.removeItem('kimi_api_key');
  }
  return {
    apiKey: getAppParamValue('api_key', { removeFromUrl: true }),
    apiBaseUrl: getAppParamValue('api_base_url', { defaultValue: import.meta.env.VITE_KIMI_K26_API_BASE_URL || (isNode ? '' : window.location.origin) }),
    fromUrl: getAppParamValue('from_url', { defaultValue: isNode ? '' : window.location.href }),
  };
};

export const appParams = {
  ...getAppParams(),
};
