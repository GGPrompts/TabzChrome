/**
 * PM2 Ecosystem Configuration for TabzChrome Backend
 *
 * Usage:
 *   pm2 start ecosystem.config.js           # Start the server
 *   pm2 start ecosystem.config.js --env development  # Start in dev mode
 *   pm2 reload ecosystem.config.js          # Zero-downtime reload
 *   pm2 stop tabz-backend                   # Stop the server
 *   pm2 delete tabz-backend                 # Remove from PM2
 *   pm2 logs tabz-backend                   # View logs
 *   pm2 monit                               # Monitor in terminal
 *
 * Startup on boot:
 *   pm2 startup                             # Generate startup script
 *   pm2 save                                # Save current process list
 *
 * =============================================================================
 * LOG ROTATION (via pm2-logrotate module)
 * =============================================================================
 *
 * Install pm2-logrotate (one-time setup):
 *   pm2 install pm2-logrotate
 *
 * Configure log rotation settings:
 *   pm2 set pm2-logrotate:max_size 10M       # Rotate when file reaches 10MB
 *   pm2 set pm2-logrotate:retain 7           # Keep 7 rotated files
 *   pm2 set pm2-logrotate:compress true      # Compress rotated files (gzip)
 *   pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss  # Timestamp format
 *   pm2 set pm2-logrotate:rotateModule true  # Also rotate PM2 module logs
 *   pm2 set pm2-logrotate:workerInterval 30  # Check interval in seconds
 *   pm2 set pm2-logrotate:rotateInterval 0 0 * * *  # Daily rotation at midnight (cron)
 *
 * Verify configuration:
 *   pm2 conf pm2-logrotate                   # Show current settings
 *
 * Alternative: Linux logrotate (if not using PM2)
 * Create /etc/logrotate.d/tabz-backend:
 *   /home/<user>/projects/TabzChrome/backend/logs/*.log {
 *     daily
 *     rotate 7
 *     compress
 *     delaycompress
 *     missingok
 *     notifempty
 *     create 644 <user> <user>
 *     copytruncate
 *   }
 * =============================================================================
 */

module.exports = {
  apps: [{
    name: 'tabz-backend',
    script: 'server.js',
    cwd: __dirname,

    // Environment
    env: {
      NODE_ENV: 'production',
      PORT: 8129,
      LOG_LEVEL: 3,  // info level
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 8129,
      LOG_LEVEL: 5,  // debug level
    },

    // Process management
    instances: 1,  // Single instance (terminals are stateful)
    exec_mode: 'fork',  // Required for node-pty

    // Graceful shutdown
    kill_timeout: 5000,  // Match gracefulShutdown timeout
    wait_ready: true,
    listen_timeout: 10000,

    // Restart behavior
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 1000,

    // Watch for file changes (disabled in production)
    watch: false,
    ignore_watch: ['node_modules', 'logs', '*.log'],

    // Logging
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,  // Prefix logs with timestamp
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // Resource limits
    max_memory_restart: '500M',

    // Node.js options
    node_args: '--max-old-space-size=512',

    // Health check (PM2 Plus feature, optional)
    // Alternatively use: pm2 set pm2:probe:custom_health_endpoint /api/health
  }]
};
