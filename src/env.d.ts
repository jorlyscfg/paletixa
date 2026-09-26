/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_INSFORGE_URL: string
  readonly VITE_INSFORGE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
