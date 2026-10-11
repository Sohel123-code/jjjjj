import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.polygon.community',
  appName: 'Polygon',
  webDir: 'dist',
  server: {
    // During development, point to your Vite dev server (uncomment and adjust IP):
    // url: 'http://192.168.1.100:5173',
    // cleartext: true,
  },
  plugins: {},
};

export default config;
