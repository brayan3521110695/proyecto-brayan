import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Todo lo que empiece con /api se envía al backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
        // opcional si tu backend no usa rutas absolutas:
        // , rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
