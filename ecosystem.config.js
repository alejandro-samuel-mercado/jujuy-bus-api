module.exports = {
  apps: [
    {
      name: 'jujuy-bus-api',
      script: './dist/index.js',
      instances: 1, // Cambiado a 1 temporalmente porque Socket.io requiere Redis para funcionar en múltiples núcleos
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
