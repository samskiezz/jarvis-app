import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId: "69b445adac1132cc6bc54ec6",
  token,
  functionsVersion,
  requiresAuth: false,
  appBaseUrl
});
