#!/bin/bash

# BoostAfterBoost - 24/7 Service Setup Script

echo "🚀 Setting up BoostAfterBoost for 24/7 operation..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Stop any existing instance
echo "🛑 Stopping existing instances..."
pm2 stop BoostAfterBoost 2>/dev/null || true
pm2 delete BoostAfterBoost 2>/dev/null || true

# Start with PM2
echo "▶️ Starting BoostAfterBoost with PM2..."
pm2 start ecosystem.config.cjs

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Setup PM2 startup script for system reboots
echo "🔄 Setting up auto-start on system reboot..."
pm2 startup

echo ""
echo "✅ BoostAfterBoost is now configured for 24/7 operation!"
echo ""
echo "📊 Management commands:"
echo "  pm2 status           - View status"
echo "  pm2 logs BoostAfterBoost - View logs"
echo "  pm2 restart BoostAfterBoost - Restart"
echo "  pm2 stop BoostAfterBoost - Stop"
echo "  pm2 monit            - Real-time monitoring"
echo ""
echo "🌐 Web interfaces:"
echo "  Status: http://localhost:3335/status"
echo "  Health: http://localhost:3335/health"
echo ""