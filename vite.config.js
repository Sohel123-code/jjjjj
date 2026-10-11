import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { setupSocketServer } from './src/server/socketHandler.js';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'socket-io-plugin',
      configureServer(server) {
        if (server.httpServer) {
          setupSocketServer(server.httpServer);
        }
      }
    }
  ],
  server: {
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' }
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/]@?firebase/ },
            { name: 'react', test: /node_modules[\\/]react/ }
          ]
        }
      }
    }
  }
});

