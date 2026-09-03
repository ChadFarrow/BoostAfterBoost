# BoostAfterBoost - IRC to Nostr Bridge

## Repository Information
- **Purpose**: Monitor BoostAfterBoost bot messages in #BowlAfterBowl IRC channel and forward to Nostr
- **IRC Server**: irc.zeronode.net
- **Channel**: #BowlAfterBowl only
- **Target Bot**: BoostAfterBoost

## Bot Configuration
- **Read-only IRC**: Only monitors messages, never posts to IRC
- **Uses ZNC bouncer**: Connects through ZNC on localhost:6697 for reliability
- **Monitors specific bot**: Only processes messages from BoostAfterBoost bot
- **Posts to Nostr**: Forwards monitored messages to Nostr relays
- **Runs on port 3335**: Separate from other bots
- **Auto-recovery**: Automatically restarts ZNC if it stops

## Nostr Configuration
- **Environment Variable**: `NOSTR_NSEC`
- **Default Relays**: relay.damus.io, nos.lol, nostr.mom, relay.primal.net
  (relay.nostr.band was removed: it resolves but TCP 443 never opens from this host)
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
sudo systemctl start boostafterboost     # systemd owns this service
```

### ZNC Management
```bash
# Check if ZNC is running
nc -zv localhost 6697

# Start ZNC manually
/home/server/BoostAfterBoost/start-znc.sh

# Start ZNC directly
znc --datadir=/home/server/.znc &

# Check ZNC status
ps aux | grep znc
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
PORT=3335              # Default port
TEST_MODE=false        # Set to true for testing without posting
```

### Checking Bot Status
```bash
# Check if bot is running
ps aux | grep -v grep | grep boost-after-boost

# Health check
curl http://localhost:3335/health

# Status info
curl http://localhost:3335/status
```

### Stopping the Bot
```bash
sudo systemctl stop boostafterboost
# Do NOT pkill it: systemd Restart=always will bring it straight back.
```

## Important Notes
- **Read-only IRC**: Bot never posts to IRC, only monitors
- **ZNC Dependency**: Requires ZNC bouncer running on localhost:6697
- **Single channel**: Only connects to #BowlAfterBowl
- **Specific bot monitoring**: Only processes BoostAfterBoost messages
- **Nostr forwarding**: All monitored messages forwarded to Nostr
- **Port 3335**: Runs on separate port to avoid conflicts
- **Auto-recovery**: Bot automatically restarts ZNC if it stops
- **SSL Configuration**: Accepts self-signed certificates for ZNC connection

## ZNC Configuration
- **Config Location**: `/home/server/.znc/configs/znc.conf`
- **User**: `ircbots`
- **Password**: `bassist89`
- **Network**: `zeronode` (connects to irc.zeronode.net)
- **Channel**: `#BowlAfterBowl`
- **Port**: 6697 (SSL)

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
- **SSL/TLS**: Configured to accept self-signed certificates from ZNC bouncer

## Current Status (Updated 2026-09-03)
- **Bot Status**: ✅ Running and operational
- **IRC Connection**: ✅ Connected to ZNC bouncer via SSL
- **Channel Monitoring**: ✅ Monitoring #BowlAfterBowl for BoostAfterBoost messages
- **Nostr Configuration**: ✅ 5 relays via NOSTR_RELAYS in .env (overrides the code default)
- **Recent Fix**: SSL certificate validation issue resolved
- **Ready to Forward**: Bot will automatically forward BoostAfterBoost messages to Nostr

## Recent Fixes (July 10, 2026)
- **node-icu log spam**: Removed the `encoding: 'utf8'` option from the `irc.Client` config in `lib/irc-client.js`. That option makes the `irc` library `require('node-icu-charset-detector')` (an uninstalled native module) on every incoming message; combined with `debug: true` it logged a `Cannot find module 'node-icu-charset-detector'` ERROR per message, flooding the journal. This bot is read-only and ZeroNode is UTF-8, so default decoding is correct and no charset detection is needed. (LIT_Bot has the same `encoding: 'utf8'` but `debug: false`, so it never surfaced the error.)

## NIP-73 podcast tags
`podcast-tags.js` resolves the show name in `[SHOW] [EPISODE]` to a feed GUID via
Podcast Index and adds `["i","podcast:guid:<guid>"]` + `["k","podcast:guid"]`.

It emits a tag **only** when a title search returns exactly one exact match. Two
different feeds are both titled exactly "Stay Awhile" with different GUIDs, so
anything looser publishes a wrong identifier — worse than publishing none, since
a wrong id mis-aggregates across every client reading these tags.

There is never a `podcast:item:guid`: the relayed text carries no episode identity.

`PODCAST_INDEX_API_KEY`/`SECRET` are optional. Without them the bot posts exactly
as before, untagged. The lookup has a 5s timeout and cannot throw, so a failure
means an untagged post, never a late or dropped one.
