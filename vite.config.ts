import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // На GitHub Pages сайт живёт в подпапке /<репозиторий>/, поэтому пути к ассетам
  // задаёт workflow через BASE_PATH. Локально и на других хостингах это корень.
  base: process.env.BASE_PATH ?? '/',
})
