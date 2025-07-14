# BoostAfterBoost - Production Setup

## 24/7 Operation Setup

### Quick Setup
```bash
# One-command setup for 24/7 operation
npm run setup-service
```

### Manual Setup
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
npm run pm2:start

# Save PM2 configuration
pm2 save

# Setup auto-start on system reboot
pm2 startup
```

## Management Commands

### PM2 Process Management
```bash
npm run pm2:start     # Start the bot
npm run pm2:stop      # Stop the bot  
npm run pm2:restart   # Restart the bot
npm run pm2:delete    # Remove from PM2
npm run pm2:logs      # View logs
npm run pm2:monit     # Real-time monitoring
```

### Health Monitoring
```bash
npm run health        # Quick health check
npm run status        # Detailed status
pm2 status           # PM2 process status
```

## Production Features

### ✅ **Auto-Restart**
- Crashes: Automatically restarts on failure
- Memory: Restarts if memory usage exceeds 500MB
- System reboot: Starts automatically after server restart

### ✅ **Logging**
- Error logs: `./logs/boost-after-boost-error.log`
- Output logs: `./logs/boost-after-boost-out.log`
- Combined: `./logs/boost-after-boost-combined.log`

### ✅ **Monitoring**
- Real-time: `pm2 monit`
- Web status: http://localhost:3335/status
- Health check: http://localhost:3335/health

### ✅ **Resilience**
- IRC reconnection (up to 10 attempts)
- Graceful shutdown handling
- Rate limiting protection
- Error boundary protection

## Log Management

### View Logs
```bash
pm2 logs BoostAfterBoost          # Live logs
pm2 logs BoostAfterBoost --lines 100  # Last 100 lines
tail -f logs/boost-after-boost-combined.log  # Direct file
```

### Clear Logs
```bash
pm2 flush BoostAfterBoost         # Clear PM2 logs
rm -f logs/*.log                  # Clear application logs
```

## Troubleshooting

### Check Status
```bash
pm2 status                        # Process status
curl http://localhost:3335/health # Health endpoint
netstat -tlnp | grep 3335        # Port check
```

### Common Issues
1. **Port in use**: Change PORT in ecosystem.config.js
2. **Permission denied**: Run with sudo or check file permissions
3. **IRC connection**: Check network/firewall settings
4. **Memory leaks**: Monitor with `pm2 monit`

### Restart After Config Changes
```bash
npm run pm2:restart               # Restart with new config
# or
npm run pm2:delete && npm run pm2:start  # Full restart
```

## Security Notes
- .env file is protected by .gitignore
- Process runs as current user (not root)
- Rate limiting prevents spam
- Input sanitization for IRC messages
- Security headers on web endpoints