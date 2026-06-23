// PM2 process definitions for the unified JARVIS · PALANTIR surface.
// Kept SEPARATE from the main ecosystem.config.cjs (which manages the other
// 24 Jarvis processes) so this is purely additive — start with:
//   pm2 start /opt/jarvis-app-1/palantir/ecosystem.palantir.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'jarvis-palantir',
      cwd: '/opt/jarvis-app-1/palantir',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: '3000' },
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '700M',
    },
    {
      name: 'jarvis-palantir-intel',
      cwd: '/opt/jarvis-app-1/palantir/intel',
      script: 'server.js',
      interpreter: 'node',
      env: { NODE_ENV: 'production', INTEL_PORT: '4000' },
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '400M',
    },
  ],
};
