/// <reference types="vite/client" />

// Variables Vite injects at build time. Only VITE_* names reach browser code, so no secret ever uses that prefix.
interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
