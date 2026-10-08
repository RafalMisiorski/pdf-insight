import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from https://rafalmisiorski.github.io/pdf-insight/,
  // so every asset URL in the build must start with /pdf-insight/.
  base: '/pdf-insight/',
  plugins: [react()],
})
