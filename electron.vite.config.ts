import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/** Shared '@shared' alias so main, preload and renderer import the same types/constants. */
const sharedAlias = {
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: { alias: sharedAlias },
    plugins: [react()]
  }
})
