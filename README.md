# BoostAfterBoost - IRC to Nostr Bridge

BoostAfterBoost monitors messages from the BoostAfterBoost bot in the #BowlAfterBowl IRC channel and forwards them to Nostr.

## Features

- 🔍 **Selective Monitoring** - Only monitors messages from the BoostAfterBoost bot
- 📖 **Read-Only IRC** - Never posts to IRC, only monitors
- 📱 **Nostr Integration** - Forwards all monitored messages to Nostr
- 🛡️ **Single Channel Focus** - Dedicated to #BowlAfterBowl channel only
- ⚡ **Real-time Forwarding** - Messages appear on Nostr immediately
- 🔧 **Easy Setup** - Simple configuration with environment variables

## Quick Start

1. **Clone and Install**
   ```bash
   git clone [your-repo-url]
   cd BoostAfterBoost
   npm install
   ```

2. **Generate Nostr Key**
   ```bash
   # Install noscl if needed
   go install github.com/fiatjaf/noscl@latest
   
   # Generate key pair
   noscl key-gen
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your NOSTR_NSEC
   ```

4. **Run BoostAfterBoost**
   ```bash
   npm start
   ```

## Configuration

Create a `.env` file with:

```bash
# Required: Your Nostr private key
NOSTR_NSEC=your_nostr_private_key_here

# IRC Configuration (pre-configured)
IRC_SERVER=irc.zeronode.net
IRC_PORT=6667
IRC_CHANNEL=#BowlAfterBowl
IRC_NICKNAME=BoostAfterBoost_Reader
TARGET_BOT=BoostAfterBoost

# Optional: Port (default: 3335)
PORT=3335

# Optional: Test mode
TEST_MODE=false
```

## How It Works

1. **IRC Connection** - Connects to irc.zeronode.net and joins #BowlAfterBowl
2. **Message Monitoring** - Listens to all messages in the channel
3. **Bot Filtering** - Only processes messages from the BoostAfterBoost bot
4. **Nostr Forwarding** - Forwards filtered messages to configured Nostr relays
5. **Read-Only Operation** - Never sends messages to IRC, only monitors

## Post Format

When BoostAfterBoost posts to IRC, the bot forwards to Nostr:

```
[Original message from BoostAfterBoost]

#BowlAfterBowl #BoostAfterBoost
```

## Commands

```bash
npm start          # Start BoostAfterBoost bridge
npm run dev        # Start with file watching
npm run health     # Check if running
npm run status     # Get status info
npm run pm2:start  # Start with PM2 process manager
npm run pm2:logs   # View PM2 logs
```

## Technical Details

- **Built with**: Node.js, Express, nostr-tools, irc
- **IRC Server**: irc.zeronode.net (hardcoded)
- **Channel**: #BowlAfterBowl only
- **Target Bot**: BoostAfterBoost
- **Relays**: relay.damus.io, relay.nostr.band, nostr.mom, relay.primal.net
- **Port**: 3335 (configurable)
- **Operation**: Read-only IRC connection

## Development

1. **Test Mode**: Set `TEST_MODE=true` to log without posting to Nostr
2. **Local Testing**: Bot runs on `http://localhost:3335`
3. **Health Check**: `curl http://localhost:3335/health`
4. **Status**: `curl http://localhost:3335/status`
5. **Logs**: Check `logs/` directory or use `npm run pm2:logs`

## Production Deployment

### Using PM2
```bash
# Start with PM2
npm run pm2:start

# View logs
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

### Manual Process Management
```bash
# Check if running
ps aux | grep -v grep | grep boost-after-boost

# Kill process (replace PID)
kill [PID]
```

## Important Notes

- 📖 **Read-Only**: This bot NEVER posts to IRC
- 🎯 **Single Purpose**: Only monitors BoostAfterBoost bot messages
- 📍 **Single Channel**: Only connects to #BowlAfterBowl
- 🔒 **Security**: `.env` file is gitignored to protect your nsec
- ⚠️ **Port Conflict**: Runs on port 3335 to avoid conflicts with other bots

## About BowlAfterBowl

BowlAfterBowl is an IRC channel on irc.zeronode.net where the BoostAfterBoost bot operates. This bridge ensures that all BoostAfterBoost messages are also available on Nostr for wider distribution and archival.

## License

MIT