import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 3000,
  },
  ssr: {
    // Keep Clerk in the SSR graph so `setErrorThrowerOptions` from
    // `@clerk/react/internal` is not dropped from the Netlify function bundle.
    noExternal: ['@clerk/tanstack-react-start', '@clerk/react'],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    netlify({
      // SSR deploys as a Netlify Function. Local Edge emulation crashes Vite:
      // Deno 2.9 rejects `eval --allow-scripts` used by @netlify/edge-functions-dev.
      dev: {
        edgeFunctions: { enabled: false },
      },
    }),
    viteReact(),
  ],
})
