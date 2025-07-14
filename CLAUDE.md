# BoostAfterBoost - IRC to Nostr Bridge

## Repository Information
- **Purpose**: Monitor BoostAfterBoost bot messages in #BowlAfterBowl IRC channel and forward to Nostr
- **IRC Server**: irc.zeronode.net
- **Channel**: #BowlAfterBowl only
- **Target Bot**: BoostAfterBoost

## Bot Configuration
- **Read-only IRC**: Only monitors messages, never posts to IRC
- **Monitors specific bot**: Only processes messages from BoostAfterBoost bot
- **Posts to Nostr**: Forwards monitored messages to Nostr relays
- **Runs on port 3334**: Separate from other bots

## Nostr Configuration
- **Environment Variable**: `NOSTR_NSEC`
- **Default Relays**: relay.damus.io, relay.nostr.band, nostr.mom, relay.primal.net
- **Post Format**: Direct message forwarding with BowlAfterBowl hashtags

## Key Features
- IRC message monitoring for specific bot
- Read-only IRC connection (no posting to IRC)
- Selective message filtering (BoostAfterBoost bot only)
- Automatic Nostr forwarding
- Health monitoring and status endpoints

## Bot Management Commands

### Starting the Bot
```bash
cd /home/server/bots/LIT_Bot/BoostAfterBoost
npm start
```

### Environment Variables Needed
```bash
# Required
NOSTR_NSEC=your_nostr_private_key  # Your Nostr private key

# IRC Configuration (pre-configured)
IRC_SERVER=irc.zeronode.net
IRC_PORT=6667
IRC_CHANNEL=#BowlAfterBowl
IRC_NICKNAME=BoostAfterBoost_Reader
TARGET_BOT=BoostAfterBoost

# Optional
PORT=3334              # Default port
TEST_MODE=false        # Set to true for testing without posting
```

### Checking Bot Status
```bash
# Check if bot is running
ps aux | grep -v grep | grep boost-after-boost

# Health check
curl http://localhost:3334/health

# Status info
curl http://localhost:3334/status
```

### Stopping the Bot
```bash
# Find running processes
ps aux | grep -v grep | grep boost-after-boost

# Kill specific processes (replace PID with actual process ID)
kill [PID]
```

## Important Notes
- **Read-only IRC**: Bot never posts to IRC, only monitors
- **Single channel**: Only connects to #BowlAfterBowl
- **Specific bot monitoring**: Only processes BoostAfterBoost messages
- **Nostr forwarding**: All monitored messages forwarded to Nostr
- **Port 3334**: Runs on separate port to avoid conflicts

## Development Workflow

### Safe Development Process
1. **Test Mode**: Set `TEST_MODE=true` to log without posting to Nostr
2. **Monitor Logs**: Watch console for IRC messages
3. **Test with Live Messages**: Verify forwarding works

### Test Mode Setup
```bash
# Set test environment variable
export TEST_MODE=true

# Start bot in test mode
TEST_MODE=true npm start
```

### Post Format
When BoostAfterBoost posts to IRC, the bot forwards to Nostr:
```
[Original message from BoostAfterBoost]

#BowlAfterBowl #BoostAfterBoost
```

## Technical Details
- **IRC Monitoring**: Connects to single channel and filters by bot name
- **Message Filtering**: Only processes messages from BoostAfterBoost
- **Nostr Publishing**: Direct message forwarding with hashtags
- **Duplicate Prevention**: Basic message handling to avoid spam
- **Health Endpoints**: /health and /status for monitoring