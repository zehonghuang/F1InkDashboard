import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import Inspector from 'unplugin-vue-dev-locator/vite'
import traeBadgePlugin from 'vite-plugin-trae-solo-badge'

// https://vite.dev/config/
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

  return {
    build: {
      sourcemap: 'hidden',
    },
    plugins: [
      vue(),
      Inspector(),
      traeBadgePlugin({
        variant: 'dark',
        position: 'bottom-right',
        prodOnly: true,
        clickable: true,
        clickUrl: 'https://www.trae.ai/solo?showJoin=1',
        autoTheme: true,
        autoThemeTarget: '#app',
      }),
    ],
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
