import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],test:{environment:'jsdom',include:['tests/ui.test.jsx','tests/supabase-client.test.js','tests/nearby-hook.test.jsx','tests/nearby-client.test.js','tests/socket-geofence.test.js'],setupFiles:['tests/ui.setup.js'],testTimeout:15000,fileParallelism:false}});
