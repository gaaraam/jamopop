import vinext from 'vinext';
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      inspectorPort: false,
      config: {
        name: process.env.WORKER_NAME || 'jamopop-local',
        main: './build/cloudflare-worker.ts',
        compatibility_date: '2026-05-15',
        compatibility_flags: ['nodejs_compat'],
        workers_dev: true,
        preview_urls: false,
        d1_databases: [
          {
            binding: 'DB',
            database_name: process.env.D1_DATABASE_NAME || 'jamopop-local',
            database_id: process.env.D1_DATABASE_ID || '00000000-0000-4000-8000-000000000000',
          },
        ],
        vars: { MIGRATION_LOCK: 'open' },
        triggers: { crons: ['17 18 * * *'] },
        observability: {
          enabled: true,
          head_sampling_rate: 0.1,
          logs: { enabled: true, invocation_logs: false },
        },
      },
    }),
  ],
});
