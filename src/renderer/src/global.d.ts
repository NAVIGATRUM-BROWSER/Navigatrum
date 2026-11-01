/**
 * Declares `window.navigatrum`, the only bridge into the main process.
 */
import type { NaviApi } from '@shared/types'

declare global {
  interface Window {
    navigatrum: NaviApi
  }
}

export {}
