# BoostAfterBoost - IRC to Nostr Bridge

## Repository Information
- **Purpose**: Monitor BoostAfterBoost bot messages in #BowlAfterBowl IRC channel and forward to Nostr
- **IRC Server**: irc.zeronode.net
- **Channel**: #BowlAfterBowl only
- **Target Bot**: BoostAfterBoost

## Bot Configuration
- **Read-only IRC**: Only monitors messages, never posts to IRC
- **Uses ZNC bouncer**: Connects to the `znc` container on the compose bridge network,
  which shares one ZeroNode connection with the other two bots
- **Monitors specific bot**: Only processes messages from BoostAfterBoost bot
- **Posts to Nostr**: Forwards monitored messages to Nostr relays
- **Runs on port 3335**: Published on loopback only; separate from LIT_Bot (3334) and LibreRelayBot (3336)
- **Auto-recovery**: Handled by the container restart policy

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
ssh root@104.237.150.197 'cd /opt/bots && docker compose up -d boost-after-boost'
```
Deployed from the `thelounge-candr` repo: `./deploy-bots.sh 104.237.150.197`.

### ZNC Management
ZNC is a sibling container, managed from the stack — never from this bot:
```bash
ssh root@104.237.150.197 'cd /opt/bots && docker compose ps znc'
ssh root@104.237.150.197 'docker logs --tail 50 znc'
ssh root@104.237.150.197 'cd /opt/bots && docker compose restart znc'

# one upstream, three attached clients -- from your own IRC client:
#   /msg *status ListClients
```

### Environment Variables Needed
```bash
# Required
NOSTR_NSEC=your_nostr_private_key  # Your Nostr private key

# IRC Configuration (set in bots/docker-compose.yml)
IRC_SERVER=znc            # the ZNC container, not ZeroNode directly
IRC_PORT=6667
IRC_SECURE=false
IRC_PASSWORD=ircbots@bab/zeronode:<znc password>   # clientid form; from env/bab.env
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
ssh root@104.237.150.197 'cd /opt/bots && docker compose ps boost-after-boost'

# Health check (published on loopback only)
curl http://localhost:3335/health

# Status info
curl http://localhost:3335/status
```

### Stopping the Bot
```bash
ssh root@104.237.150.197 'cd /opt/bots && docker compose stop boost-after-boost'
# Do NOT docker kill it: restart: unless-stopped brings it straight back.
```

## Important Notes
- **Read-only IRC**: Bot never posts to IRC, only monitors
- **ZNC Dependency**: Requires the `znc` container in the same compose stack, reached as host `znc` port 6667
- **Single channel**: Only connects to #BowlAfterBowl
- **Specific bot monitoring**: Only processes BoostAfterBoost messages
- **Nostr forwarding**: All monitored messages forwarded to Nostr
- **Port 3335**: Runs on separate port to avoid conflicts
- **Auto-recovery**: `restart: unless-stopped` on both containers. The bot no longer
  tries to start ZNC itself — that code shelled out to a path on the old host.

## ZNC Configuration
ZNC is a container in the `/opt/bots` stack on the candr VPS, shared with LIT_Bot and
LibreRelayBot. It is **not** this bot's responsibility — the container runtime's
restart policy owns its lifecycle.

- **Config**: `/opt/bots/znc-data/configs/znc.conf` (template in `thelounge-candr/bots/`)
- **User**: `ircbots`, network `zeronode` → `irc.zeronode.net`
- **Password**: not recorded here. It lives in `/opt/bots/env/bab.env` as
  `IRC_PASSWORD=ircbots@bab/zeronode:<password>`, mode 600, and nowhere in git.
- **Reached as**: host `znc`, port 6667, plaintext — the compose bridge network only
- **Channels**: the union of all three bots' needs, `#BowlAfterBowl` among them

### Why a shared ZNC

ZeroNode enforces a per-IP connection limit and the old Ubuntu host hit it, dropping
connections. ZNC opens **one** upstream connection per (user, network) and lets
several clients attach at once, sharing the connection and the nick. This bot is
read-only, so sharing LIT_Bot's nick is invisible to the network. Three ZeroNode
connections became one.

The `@bab` clientid in `IRC_PASSWORD` is what makes this bot a distinct ZNC client
rather than three sessions fighting over one.

**ZNC buffers are zero on purpose.** This bot dedupes in memory only — it keeps no
state across restarts — so a buffer replay on reattach would republish old boosts to
Nostr as brand-new notes.

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

## NIP-73 podcast tags and boost evidence
`podcast-tags.js` parses the IRC line (`parseBoost`: show, episode, sender, sats,
position, app) and builds the event's tags (`buildBoostTags`):

- `["i","podcast:guid:<guid>"]` + `["k","podcast:guid"]` when the show title
  matches exactly one Podcast Index feed. Two different feeds are both titled
  exactly "Stay Awhile" with different GUIDs, so anything looser publishes a
  wrong identifier — worse than publishing none, since a wrong id mis-aggregates
  across every client reading these tags.
- `["i","podcast:item:guid:<guid>"]` + `["k","podcast:item:guid"]` when that
  feed's episode list (`episodes/bypodcastguid`) has exactly one episode with the
  bracketed title. Scoped to the resolved feed, so it is a narrow question where
  a global episode-title search would be a guess. A live-show title matches
  nothing and the boost stays show-level. Misses are cached for 15 minutes, not
  forever: Podcast Index can lag the feed.
- `["amount","<millisats>"]` plus `["t","boost"]`, `["t","boostagram"]`,
  `["t","value4value"]` when the line says `boosted N sats`. **These are what
  make the note a boost to an indexer.** OnlyBoosts and similar keep a note only
  on evidence (an amount tag, a boost topic tag, or a quoted zap receipt); a
  keysend has no zap receipt to quote, so the amount from the line is the
  evidence this relay can give. A continuation line of a long message is not a
  boost and gets none of these.
- `["app","<App>"]` from the trailing `via <App>`: the app the listener boosted
  from. `["client","BoostAfterBoost"]` on every event is the relay itself; the
  two are different claims and stay in different tags.

Tags are read from the RAW reassembled message rather than the sanitized one, so
the trailing `via <App>` survives -- it arrives in the LAST IRC line of a long
boost (see "Rejoining split IRC lines" below).

`PODCAST_INDEX_API_KEY`/`SECRET` are optional and gate only the two identifier
lookups. Each has a 5s timeout and cannot throw, so a failure means fewer tags,
never a late or dropped post. `npm test` runs the parser and tag builder against
real IRC lines.

## Rejoining split IRC lines

IRC has no long messages: the announcer emits a long boost as two or three lines,
and this bot used to publish each one as its own Nostr note. One boost became three
permanent, unconnected notes, and only the last carried the `via <App>` the tags are
read from.

`lib/message-assembler.js` buffers them. `parseBoost(line) !== null` decides which
lines begin a message; anything else continues the one in progress. A message is
published when the next one starts, when `IRC_JOIN_WINDOW_MS` (default 2500) passes
with no further line, or at shutdown.

**Fragments are joined with no separator, before sanitizing.** The cut is a character
count, not a word boundary -- a real boost split mid-npub, `…uyt0uyg` + `gwmf4q78…`
being one 63-character key -- so a space in the join corrupts it. And a cut that does
land on a space leaves that space at the end of a fragment, which `sanitizeMessage`'s
`.trim()` would eat if it ran first. `test/message-assembler.test.js` pins both
against the real 2026-09-13 boost.

Two consequences elsewhere:

- **No 280-character cut.** `Security.sanitizeMessage` no longer truncates. Cutting
  there would discard most of what the reassembly just recovered, and a kind:1 note
  has no such limit.
- **The rate limiter counts messages, not fragments.** At 5 per 60s a three-line
  boost spent three of the five, so a busy show dropped boosts -- and dropping a
  *middle* fragment published a note with a hole in it. It now runs once per
  assembled message, in `_handleAssembledMessage`.

A line the predicate does not recognise, with nothing pending, is published on its
own exactly as before, so a miss degrades to the old behaviour rather than gluing
unrelated messages together.

## Migration to the candr VPS (September 2026)

Moved off the local Ubuntu server (`/home/server/BoostAfterBoost`, systemd + ZNC on
the host) to the candr VPS as a container in the `/opt/bots` stack.

**Why:** the home IP had hit ZeroNode's per-IP connection limit and connections were
being dropped. Moving sheds this bot's connection from that IP, and the shared ZNC on
the VPS means all three bots together cost the new IP one connection, not three.

**What changed in this repo:**
- `Dockerfile` + `.dockerignore`. Two stages so `build-essential`/`python3` — needed
  for `irc`'s optional native deps — don't ship in the runtime image. Runs as the
  `node` user (uid 1000), matching the other containers on the box.
- `lib/irc-client.js`: deleted the ZNC health-check and auto-restart block. It
  `execAsync`'d `/home/server/bots/BoostAfterBoost/start-znc.sh`, a path that does
  not exist on the VPS, and probed a hardcoded `localhost:6697` that is now the
  wrong host and port. The call site was already commented out, so this was dead
  code carrying a stale host assumption. The container restart policy owns ZNC now.
- `start-znc.sh`: deleted. All three bot repos shipped a byte-identical copy writing
  the same `/tmp/znc-boostbot.pid` and the same log path — they would have fought
  each other.
- `PORT` default 3334 → **3335**, matching the docs, `package.json` scripts and
  compose. The old default disagreed with all three and collided with LIT_Bot. The
  pm2 config said 3336, which collided with LibreRelayBot; also fixed.
- The ZNC password was committed in cleartext in this file. It has been removed and
  should be rotated — note that removing it here does not remove it from git history.

**Rollback:** `ecosystem.config.cjs` and the pm2 scripts are deliberately left in
place. The old host can take this bot back with `pm2 start ecosystem.config.cjs`
(or its systemd unit) once `IRC_SERVER`/`IRC_PORT` point back at a local ZNC.
