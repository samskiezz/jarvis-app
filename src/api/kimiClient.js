import { appParams } from '@/lib/app-params';

const request = async (path, options = {}) => {
  const url = `${appParams.apiBaseUrl}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
};

const entityProxy = (entityName) => ({
  list: (params = {}) => request(`/entities/${entityName}`, { method: 'POST', body: JSON.stringify(params) }),
  get: (id) => request(`/entities/${entityName}/${id}`),
  create: (payload) => request(`/entities/${entityName}`, { method: 'PUT', body: JSON.stringify(payload) }),
  update: (id, payload) => request(`/entities/${entityName}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (id) => request(`/entities/${entityName}/${id}`, { method: 'DELETE' }),
});

export const kimiClient = {
  request,
  functions: new Proxy({}, {
    get: (_, fnName) => (payload = {}) => request(`/functions/${String(fnName)}`, { method: 'POST', body: JSON.stringify(payload) }),
  }),
  entities: new Proxy({}, {
    get: (_, entityName) => entityProxy(String(entityName)),
  }),
  auth: {
    async me() {
      if (!appParams.apiKey) throw new Error('No API key configured');
      return { role: 'admin', provider: 'kimi-k2.6', authenticated: true };
    },
    logout() {
      localStorage.removeItem('kimi_api_key');
    },
    redirectToLogin() {
      window.location.href = '/';
    },
  },
};

