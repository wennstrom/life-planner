/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('Netlify TanStack Start hosting', () => {
  it('publishes the Vite client output and builds without the local nvm wrapper', () => {
    const toml = readFileSync(resolve(root, 'netlify.toml'), 'utf8')
    expect(toml).toMatch(/publish\s*=\s*"dist\/client"/)
    expect(toml).toMatch(/command\s*=\s*"vite build"/)
  })

  it('registers the official Netlify TanStack Start Vite plugin', () => {
    const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')
    expect(config).toContain("from '@netlify/vite-plugin-tanstack-start'")
    expect(config).toMatch(/netlify\(\)/)
  })
})
