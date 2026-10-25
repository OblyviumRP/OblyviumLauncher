import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// CSP só no build: o servidor de dev do Vite precisa de scripts inline.
// Imagens remotas: arte da distribuição, ícones do Modrinth, cabeças (minotar) e texturas de skin.
// connect-src cobre o fetch do renderer (API de skins); o resto da rede sai pelo Node.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: file: https: http://textures.minecraft.net",
  "font-src 'self' data:",
  "connect-src 'self' https://api.minecraftservices.com https://textures.minecraft.net",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'oblyvium-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
  }
}

// base './' para o build abrir via file:// dentro do Electron.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    target: 'chrome130',
    chunkSizeWarningLimit: 1200,
  },
})
