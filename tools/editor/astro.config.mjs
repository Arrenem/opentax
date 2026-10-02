import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
export default defineConfig({ integrations: [react(), keystatic()], server: { host: '127.0.0.1', port: 4321 } });
