/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('Netlify TanStack Start hosting', () => {
  it('publishes the Vite client output and uses a Node-aware build command', () => {
    const toml = readFileSync(resolve(root, 'netlify.toml'), 'utf8')
    const build = readFileSync(resolve(root, 'scripts/netlify-build.sh'), 'utf8')
    expect(toml).toMatch(/publish\s*=\s*"dist\/client"/)
    expect(toml).toMatch(/command\s*=\s*"scripts\/netlify-build\.sh"/)
    expect(toml).toMatch(/NODE_VERSION\s*=\s*"22"/)
    expect(build).toContain('scripts/with-node.sh')
    expect(build).toContain('./node_modules/.bin/vite build')
    expect(build).toContain('Missing VITE_CONVEX_URL')
    expect(build).toContain('Building against Convex:')
  })

  it('keeps the Netlify Dev proxy off Vite’s port', () => {
    const toml = readFileSync(resolve(root, 'netlify.toml'), 'utf8')
    expect(toml).toMatch(/targetPort\s*=\s*3000/)
    expect(toml).toMatch(/port\s*=\s*8888/)
    expect(toml).not.toMatch(/\[dev\][\s\S]*^\s*port\s*=\s*3000/m)
  })

  it('starts local Vite through the nvm wrapper so Netlify CLI Node 20 is not used', () => {
    const toml = readFileSync(resolve(root, 'netlify.toml'), 'utf8')
    expect(toml).toMatch(
      /command\s*=\s*"scripts\/with-node\.sh \.\/node_modules\/\.bin\/vite dev"/,
    )
  })

  it('registers the official Netlify TanStack Start Vite plugin', () => {
    const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')
    expect(config).toContain("from '@netlify/vite-plugin-tanstack-start'")
    expect(config).toMatch(/netlify\(/)
    expect(config).toMatch(/edgeFunctions:\s*\{\s*enabled:\s*false/)
    expect(config).toMatch(/noExternal:\s*\[[^\]]*@clerk\/tanstack-react-start/)
    expect(config).toMatch(/noExternal:\s*\[[^\]]*@clerk\/react/)
  })
})
