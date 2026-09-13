# BoostAfterBoost - IRC to Nostr Bridge

> **Archived 2026-09-13 — this code moved.** It now lives in
> [ChadFarrow/thelounge-candr](https://github.com/ChadFarrow/thelounge-candr) under
> `bots/src/boost-after-boost`, and is built and deployed from there. Make changes there, not here.
> This repository is kept read-only for its history.

BoostAfterBoost monitors messages from the BoostAfterBoost bot in the #BowlAfterBowl IRC channel and forwards them to Nostr.

## Features

- 🔍 **Selective Monitoring** - Only monitors messages from the BoostAfterBoost bot
- 📖 **Read-Only IRC** - Never posts to IRC, only monitors
- 📱 **Nostr Integration** - Forwards all monitored messages to Nostr
- 🛡️ **Single Channel Focus** - Dedicated to #BowlAfterBowl channel only
- ⚡ **Real-time Forwarding** - Messages appear on Nostr immediately
- 🏷️ **Boost Tags** - Each boost carries NIP-73 show and episode identifiers, its amount in millisats, the boost topic tags, and the app it was sent from, so boost indexers count it
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

#bowlafterbowl #boostafterboost #bowloftrust
```

Tags on the event, for a line like `🎳 [Show] [Episode] Alice boosted 333 sats saying "hi" @0:10:36 via Fountain`:

| Tag | Value | When |
|---|---|---|
| `client` | `BoostAfterBoost` | always: the software that published the note |
| `t` | `bowlafterbowl`, `boostafterboost`, `bowloftrust` | always |
| `i` + `k` | `podcast:guid:<feed guid>` | the show title matches exactly one Podcast Index feed |
| `i` + `k` | `podcast:item:guid:<item guid>` | that feed has exactly one episode with the bracketed title |
| `amount` | `333000` (millisats) | the line says `boosted N sats` |
| `t` | `boost`, `boostagram`, `value4value` | same: the note is a boost |
| `app` | `Fountain` | the line ends `via <App>`: the app the listener boosted from |

The identifiers are only ever emitted on an exact, unambiguous match; anything doubtful posts without them. The `amount` and topic tags are what a boost indexer needs to count the note at all, and they need no API key.

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