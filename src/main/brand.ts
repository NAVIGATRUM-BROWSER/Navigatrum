/**
 * Resolves bundled brand artwork relative to the compiled module, so it
 * works in dev mode and in a packaged app alike.
 */
import { fileURLToPath } from 'node:url'

export function brandAsset(name: string): string {
  return fileURLToPath(new URL(`../../assets/brand/${name}`, import.meta.url))
}
