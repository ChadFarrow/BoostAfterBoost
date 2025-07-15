# ZNC Connection Issue - Troubleshooting Guide

## Problem
BoostAfterBoost bot stops receiving IRC messages because ZNC bouncer is not running.

## Symptoms
- Bot logs show "Connecting to ZNC bouncer..." but no "Successfully connected"
- Status endpoint shows `"connected": false`
- No boost messages are being processed
- `nc -zv localhost 6697` fails with "Connection refused"

## Root Cause
ZNC bouncer stops running due to:
1. **System restart/reboot** (ZNC service disabled)
2. **Process crash** (OOM killer, segfault, etc.)
3. **Manual termination** (killed by user/system)
4. **Resource exhaustion** (memory, file descriptors)

## Quick Fix
```bash
# 1. Check if ZNC is running
ps aux | grep znc

# 2. Test ZNC connectivity
nc -zv localhost 6697

# 3. Start ZNC using auto-start script
/home/server/bots/BoostAfterBoost/start-znc.sh

# 4. OR start ZNC manually
znc --datadir=/home/server/.znc &

# 5. Restart the bot
pm2 restart BoostAfterBoost
```

## Automatic Recovery (Implemented)
The bot now includes automatic ZNC recovery:
- **Health Checks**: Every 2 minutes
- **Auto-Restart**: Automatically restarts ZNC if it stops
- **Startup Check**: Ensures ZNC is running before connecting
- **Logging**: All operations logged to `logs/znc.log`

## ZNC Configuration
- **Config**: `/home/server/.znc/configs/znc.conf`
- **User**: `ircbots`
- **Password**: `[see .env file IRC_PASSWORD]`
- **Network**: `zeronode` (irc.zeronode.net)
- **Channel**: `#BowlAfterBowl`
- **Port**: 6697 (SSL)

## Verification Steps
1. **Check ZNC Process**: `ps aux | grep znc`
2. **Test Connection**: `nc -zv localhost 6697`
3. **Check Bot Status**: `curl http://localhost:3335/status`
4. **View ZNC Logs**: `tail -f /home/server/bots/BoostAfterBoost/logs/znc.log`
5. **View Bot Logs**: `tail -f /home/server/bots/BoostAfterBoost/logs/boost-after-boost-out.log`

## Prevention
- **Use systemd service**: `sudo systemctl enable znc && sudo systemctl start znc`
- **Monitor logs**: Regular checking of ZNC and bot logs
- **Resource monitoring**: Watch memory usage, file descriptors
- **Automatic restart**: Bot now handles this automatically

## Files Changed for Fix
- `lib/irc-client.js`: Added ZNC health checking and auto-recovery
- `boost-after-boost.js`: Updated to handle async ZNC connection
- `start-znc.sh`: New auto-start script for ZNC
- `CLAUDE.md`: Updated documentation with ZNC management
- `.env`: Added IRC_PASSWORD configuration

## Last Occurrence
- **Date**: July 15, 2025
- **Issue**: ZNC stopped overnight (service disabled, not auto-starting)
- **Fix**: Manual restart + implemented auto-recovery system
- **Resolution**: Bot now automatically restarts ZNC when it stops

## Related Commands
```bash
# Check ZNC config
cat /home/server/.znc/configs/znc.conf

# View ZNC certificate
openssl x509 -in /home/server/.znc/znc.pem -text -noout

# Kill ZNC process
pkill -f "znc --datadir=/home/server/.znc"

# Start ZNC with debugging
znc --datadir=/home/server/.znc --debug

# Check port usage
netstat -tlnp | grep 6697
```

## Prevention Checklist
- [ ] ZNC auto-recovery system active
- [ ] Bot health monitoring enabled
- [ ] Logs being written to znc.log
- [ ] systemd service configured (optional)
- [ ] Resource monitoring in place
- [ ] Regular status checks scheduled