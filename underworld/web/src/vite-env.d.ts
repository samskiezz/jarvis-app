/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UNDERWORLD_API_URL?: string;
  readonly VITE_UNDERWORLD_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css";
