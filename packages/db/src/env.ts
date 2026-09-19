import fs from 'node:fs'
import path from 'node:path'

/**
 * Load the repository root `.env` into process.env (without overriding existing values).
 * Walks up from `startDir` until it finds a `pnpm-workspace.yaml` next to a `.env`.
 */
export function loadEnv(startDir: string = process.cwd()): string | undefined {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 8; i++) {
    const envPath = path.join(dir, '.env')
    const isRoot = fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))
    if (isRoot) {
      if (fs.existsSync(envPath)) {
        const before = { ...process.env }
        process.loadEnvFile(envPath)
        for (const [k, v] of Object.entries(before)) if (v !== undefined) process.env[k] = v
        return envPath
      }
      return undefined
    }
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}
