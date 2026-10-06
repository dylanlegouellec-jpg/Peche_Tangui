/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __BUILD_TIME__: string
declare const __COMMIT__: string
declare const __CODE_STATS__: { files: number; lines: number; byType: Record<string, number>; top: { path: string; lines: number }[] }
