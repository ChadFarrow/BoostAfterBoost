module.exports = {
  apps: [{
    name: 'BoostAfterBoost',
    script: 'boost-after-boost.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3335
    },
    error_file: './logs/boost-after-boost-error.log',
    out_file: './logs/boost-after-boost-out.log',
    log_file: './logs/boost-after-boost-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    kill_timeout: 3000,
    listen_timeout: 8000,
    shutdown_with_message: true,
    restart_delay: 2000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
}