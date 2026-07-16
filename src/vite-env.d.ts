/// <reference types="vite/client" />

// Compile-time constants injected by vite.config.ts define{}. __APP_VERSION__ is
// major.minor.<git-commit-count>; __APP_BUILD__ is the short SHA + commit date (tooltip).
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
