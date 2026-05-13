import { getJarvisTerminalData } from './backendFunctions';
import { sanitizeIntelPayload } from '../lib/sanitizeIntel';

const FIELD_ALLOWLIST = {
  analyst: ['id', 'label', 'type', 'mark', 'conf', 'x', 'y', 'linked', 'props'],
  operator: ['id', 'label', 'type', 'mark', 'conf', 'x', 'y', 'linked'],
  viewer: ['id', 'label', 'type', 'mark', 'x', 'y', 'linked'],
};

function applyRoleFilter(data, role = 'viewer') {
  const fields = FIELD_ALLOWLIST[role] || FIELD_ALLOWLIST.viewer;
  return {
    ...data,
    objects: (data.objects || []).map((obj) =>
      Object.fromEntries(Object.entries(obj).filter(([k]) => fields.includes(k)))
    ),
  };
}

export async function loadJarvisTerminalData({ role = 'viewer', tenant = 'default', clearance = 'standard' } = {}) {
  const raw = await getJarvisTerminalData({ role, tenant, clearance });
  const filtered = applyRoleFilter(raw || {}, role);
  return sanitizeIntelPayload(filtered);
}
