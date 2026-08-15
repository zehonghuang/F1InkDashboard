import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = (env.VITE_DEV_PROXY_TARGET || env.VITE_API_BASE || 'http://127.0.0.1:8008')
    .trim()
    .replace(/\/+$/, '')
  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    'winpc-f1admin.normal-person.icu',
    ...String(env.VITE_ALLOWED_HOSTS || '')
      .split(',')
      .map((it) => it.trim())
      .filter(Boolean),
  ]

  const appBase = (env.VITE_APP_BASE || '/admin-v2/').trim().replace(/\/+$/, '/') || '/'
  return {
    base: appBase,
    build: {
      sourcemap: 'hidden',
    },
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      allowedHosts,
      proxy: {
        '/api': { target, changeOrigin: true, ws: true },
        '/ws': { target, changeOrigin: true, ws: true },
        '/static': { target, changeOrigin: true },
        '/update': { target, changeOrigin: true },
        '/swagger': { target, changeOrigin: true },
      },
    },
  }
})
