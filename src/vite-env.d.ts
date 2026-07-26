/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional override for the API base. Leave unset to use the relative `/api/v1` default, which
   * the Vite dev proxy forwards to the local backend. Never set this to a local filesystem path.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
