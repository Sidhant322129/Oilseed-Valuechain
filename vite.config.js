import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function expressBackendPlugin() {
  let backendProcess = null;

  return {
    name: 'express-backend-autostart',
    configureServer(server) {
      // Check if Express backend is already running on port 5000
      const socket = new net.Socket();
      socket.setTimeout(800);

      socket.on('connect', () => {
        console.log('\n[backend-autostart] ✅ Express backend is already running on port 5000\n');
        socket.destroy();
      });

      socket.on('error', () => {
        socket.destroy();
        console.log('\n[backend-autostart] 🚀 Express backend not detected on port 5000. Auto-starting backend...\n');
        backendProcess = spawn(process.execPath || 'node', ['src/server.js'], {
          cwd: path.resolve(__dirname, 'backend'),
          stdio: 'inherit',
          shell: false,
        });

        backendProcess.on('error', (err) => {
          console.error('[backend-autostart] ❌ Failed to start Express backend:', err);
        });
      });

      socket.connect(5000, '127.0.0.1');

      const cleanup = () => {
        if (backendProcess) {
          backendProcess.kill();
          backendProcess = null;
        }
      };

      server.httpServer?.on('close', cleanup);
      process.on('exit', cleanup);
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    },
  };
}

export default defineConfig({
  plugins: [react(), expressBackendPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 3000,
    allowedHosts: ['polo-tsunami-admitted-thomson.trycloudflare.com'],
    open: true,
    watch: {
      ignored: ['**/backend/**', '**/data/**', '**/*.json'],
    },
    proxy: {
      // Proxy all /api requests to the Express backend — eliminates CORS preflight in dev
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        timeout: 180000,      // 3 min — AGMARKNET ingestion can take 60–90 s
        proxyTimeout: 180000,
      },
    },
  },
});
