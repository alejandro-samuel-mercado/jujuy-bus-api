module.exports = {
  apps: [
    {
      name: 'jujuy-bus-api',
      script: './dist/index.js',
      instances: 'max', // Utilizar todos los núcleos disponibles (útil para balanceo de carga)
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5055
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5055
      }
    }
  ]
};
