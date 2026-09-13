// boost-after-boost.js - IRC to Nostr bridge for monitoring BoostAfterBoost bot
import express from 'express';
import dotenv from 'dotenv';
import { finalizeEvent, nip19 } from 'nostr-tools';
import { Relay } from 'nostr-tools/relay';
import { logger } from './lib/logger.js';
import { IRCClient } from './lib/irc-client.js';
import { boostTagsForMessage, parseBoost } from './podcast-tags.js';
import { MessageAssembler } from './lib/message-assembler.js';
import { resolveNpubNames } from './lib/npub-names.js';

// Configure environment variables
dotenv.config();

// Configuration with validation
class Config {
  constructor() {
    this.irc = {
      server: process.env.IRC_SERVER || 'irc.zeronode.net',
      port: this.parsePort(process.env.IRC_PORT) || 6667,
      secure: process.env.IRC_SECURE === 'true',
      nickname: process.env.IRC_NICKNAME || 'BoostAfterBoost_Reader',
      userName: process.env.IRC_USERNAME || 'boost_reader',
      realName: process.env.IRC_REALNAME || 'BoostAfterBoost Reader Bot',
      password: process.env.IRC_PASSWORD,
      channels: [process.env.IRC_CHANNEL || '#BowlAfterBowl'],
      // The IRC network these messages actually appeared on, for the `r`
      // provenance tag. Deliberately NOT `server`: that is the bouncer we read
      // through -- `znc` on the compose bridge, `localhost` on the old host --
      // and publishing either puts a name that resolves nowhere into a permanent,
      // public note. The bouncer is transport; the network is the identity.
      networkHost: process.env.IRC_NETWORK_HOST || 'irc.zeronode.net'
    };
    
    this.nostr = {
      nsec: process.env.NOSTR_NSEC,
      relays: this.parseRelays(process.env.NOSTR_RELAYS)
    };
    
    this.app = {
      // 3335 is this bot's port everywhere else (docs, package.json scripts,
      // compose). The old 3334 default disagreed with all of them and collided
      // with LIT_Bot.
      port: this.parsePort(process.env.PORT) || 3335,
      testMode: process.env.TEST_MODE === 'true',
      targetBot: process.env.TARGET_BOT || 'BoostAfterBoost',
      // A payer's app stores their mentions as keys, so the boostagram says
      // nostr:npub1… where they typed "@Frankie Peroni". Off by `false` only;
      // the note reads better with names and falls back to the npub on any
      // failure. See lib/npub-names.js.
      resolveNpubs: process.env.RESOLVE_NPUB_NAMES !== 'false',
      npubTimeoutMs: Number(process.env.NPUB_RESOLVE_TIMEOUT_MS) || 4000
    };
  }

  parsePort(value) {
    const port = parseInt(value);
    return isNaN(port) || port < 1 || port > 65535 ? null : port;
  }

  parseRelays(value) {
    if (!value) {
      return ['wss://relay.damus.io', 'wss://nos.lol', 'wss://nostr.mom', 'wss://relay.primal.net'];
    }
    return value.split(',').map(relay => relay.trim()).filter(Boolean);
  }

  validate() {
    const errors = [];
    if (!this.nostr.nsec || this.nostr.nsec === 'your_nostr_private_key_here') {
      errors.push('NOSTR_NSEC is required and must be a valid nsec key');
    }
    if (!this.nostr.nsec?.startsWith('nsec1') || this.nostr.nsec.length !== 63) {
      errors.push('NOSTR_NSEC must be a valid nsec1 format');
    }
    return errors;
  }
}

// Security utilities
class Security {
  static sanitizeMessage(message) {
    if (typeof message !== 'string') return '';
    // No length cut. A long boost reaches us as several IRC lines and is rejoined
    // before it gets here (lib/message-assembler.js); cutting at 280 characters
    // would throw away most of what the reassembly just recovered, and a kind:1
    // note has no such limit. The announcer bounds what it emits.
    return message
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .trim();
  }

  static createRateLimiter(maxRequests = 5, windowMs = 60000) {
    const requests = new Map();
    
    return (key) => {
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!requests.has(key)) {
        requests.set(key, []);
      }
      
      const userRequests = requests.get(key);
      // Remove old requests
      while (userRequests.length && userRequests[0] < windowStart) {
        userRequests.shift();
      }
      
      if (userRequests.length >= maxRequests) {
        return false;
      }
      
      userRequests.push(now);
      return true;
    };
  }
}

// Enhanced Nostr client
class NostrClient {
  constructor(nsec, relays, testMode = false) {
    this.nsec = nsec;
    this.relays = relays;
    this.testMode = testMode;
    this.secretKey = this._getSecretKey();
  }

  _getSecretKey() {
    try {
      const { data } = nip19.decode(this.nsec);
      return data;
    } catch (error) {
      throw new Error(`Invalid nsec format: ${error.message}`);
    }
  }

  async publishMessage(content, tags = []) {
    const event = finalizeEvent({
      kind: 1,
      content,
      tags: [
        ['t', 'bowlafterbowl'],
        ['t', 'boostafterboost'],
        ['t', 'bowloftrust'],
        // NIP-89: the software that published this note. Indexers attribute a
        // note to its publisher; the app the listener boosted FROM rides the
        // `app` tag the boost parser adds, so the two are never confused.
        ['client', 'BoostAfterBoost'],
        ...tags
      ],
      created_at: Math.floor(Date.now() / 1000),
    }, this.secretKey);

    if (this.testMode) {
      logger.info('TEST MODE - Would publish:', { content, tags, relays: this.relays });
      return { success: true, published: 0, failed: 0 };
    }

    return await this._publishToRelays(event);
  }

  async _publishToRelays(event) {
    const results = await Promise.allSettled(
      this.relays.map(url => this._publishToRelay(url, event))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info(`Published to ${successful}/${this.relays.length} relays`);
    return { success: successful > 0, published: successful, failed };
  }

  async _publishToRelay(url, event) {
    const relay = await Relay.connect(url);
    try {
      await relay.publish(event);
      logger.debug(`Published to ${url}`);
      return url;
    } finally {
      relay.close();
    }
  }
}

// Main application class
class BoostAfterBoostBridge {
  constructor() {
    this.config = new Config();
    this.stats = this._initStats();
    this.ircClient = null;
    this.nostrClient = null;
    this.rateLimiter = Security.createRateLimiter(5, 60000);
    // One boost, one note. The announcer cuts a long boost across several IRC lines
    // and each line used to become its own permanent Nostr note -- see
    // lib/message-assembler.js for why they are rejoined with no separator.
    this.assembler = new MessageAssembler({
      // parseBoost already answers exactly this question: null for a continuation
      // line, a parsed boost for the line that starts one.
      isStart: (line) => parseBoost(line) !== null,
      windowMs: Number(process.env.IRC_JOIN_WINDOW_MS) || undefined,
      logger,
      onMessage: (message) => this._handleAssembledMessage(message)
    });
    this._setupGlobalErrorHandlers();
  }

  _initStats() {
    return {
      startTime: new Date(),
      messagesMonitored: 0,
      successfulPosts: 0,
      failedPosts: 0,
      lastActivity: null,
      relayStats: {}
    };
  }

  _setupGlobalErrorHandlers() {
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', { error: error.message, stack: error.stack });
      this._gracefulShutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection:', { reason, promise });
    });

    ['SIGINT', 'SIGTERM'].forEach(signal => {
      process.on(signal, () => this._gracefulShutdown(0));
    });
  }

  async start() {
    try {
      const validationErrors = this.config.validate();
      if (validationErrors.length > 0) {
        logger.error('Configuration errors:', validationErrors);
        process.exit(1);
      }

      this._initializeNostrClient();
      await this._initializeIRCClient();
      this._startWebServer();
      
      logger.info('🚀 BoostAfterBoost bridge started successfully');
    } catch (error) {
      logger.error('Failed to start bridge:', error);
      process.exit(1);
    }
  }

  _initializeNostrClient() {
    try {
      this.nostrClient = new NostrClient(
        this.config.nostr.nsec,
        this.config.nostr.relays,
        this.config.app.testMode
      );
      logger.info('✅ Nostr client initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Nostr client:', error);
      throw error;
    }
  }

  async _initializeIRCClient() {
    try {
      this.ircClient = new IRCClient(this.config.irc);
      
      // Enhanced message handler with error catching
      const originalConnect = this.ircClient.connect.bind(this.ircClient);
      this.ircClient.connect = async () => {
        await originalConnect();
        
        if (this.ircClient.client) {
          this.ircClient.client.on('message', async (from, to, message) => {
            try {
              await this._handleIRCMessage(from, to, message);
            } catch (error) {
              logger.error('Error handling IRC message:', error);
            }
          });
          
          logger.info(`🎯 Monitoring ${this.config.app.targetBot} in ${this.config.irc.channels[0]}`);
        }
      };
      
      await this.ircClient.connect();
    } catch (error) {
      logger.error('❌ Failed to initialize IRC client:', error);
      throw error;
    }
  }

  async _handleIRCMessage(from, to, message) {
    // Only monitor messages from the target bot
    if (from !== this.config.app.targetBot) {
      return;
    }

    // ...and only in the channel this bot actually watches.
    //
    // Going through the shared ZNC, channel membership belongs to the ZNC *user*,
    // not to each attached client: every channel the bouncer joined is fanned out
    // to all three bots regardless of what any of them JOINed. So IRC_CHANNEL no
    // longer scopes what we receive and `to` is the only thing that still does.
    // Without this check, a target-bot message in any other channel gets relayed
    // and then tagged with channels[0] in _postToNostr -- i.e. published under a
    // channel it was never said in. Separate connections used to make this
    // impossible; the ZNC consolidation is what put it in reach.
    const watching = this.config.irc.channels[0];
    if (String(to).toLowerCase() !== String(watching).toLowerCase()) {
      logger.debug(`Ignoring ${from} message in ${to} (watching ${watching})`);
      return;
    }

    logger.info(`📨 Message from ${from}:`, message);
    this.stats.messagesMonitored++;
    this.stats.lastActivity = new Date();

    // Buffered, not posted. A long boost arrives as several lines and only becomes
    // a message once the assembler decides it is complete.
    this.assembler.push(message);
  }

  async _handleAssembledMessage(message) {
    // Rate limit the assembled boost, never the fragment. At 5 per 60s a
    // three-line boost spent three of the five, so a busy show dropped boosts --
    // and dropping a MIDDLE fragment published a note with a hole in it.
    const from = this.config.app.targetBot;
    if (!this.rateLimiter(from)) {
      logger.warn(`⚠️ Rate limit exceeded for ${from}`);
      return;
    }

    if (this.nostrClient) {
      await this._postToNostr(message);
    }
  }

  async _postToNostr(message) {
    try {
      // Names before sanitizing, tags from the raw line below. A relay that is slow
      // or a profile with no name leaves the npub exactly where it was.
      const named = this.config.app.resolveNpubs
        ? await resolveNpubNames(message, {
            relays: this.config.nostr.relays,
            timeoutMs: this.config.app.npubTimeoutMs,
            logger
          })
        : message;

      const sanitizedMessage = Security.sanitizeMessage(named);
      if (!sanitizedMessage) {
        logger.warn('Empty message after sanitization, skipping');
        return;
      }

      const tags = [['r', `irc://${this.config.irc.networkHost}/${this.config.irc.channels[0]}`]];

      // NIP-73 feed and item identifiers when they resolve unambiguously, plus
      // the amount and topic tags that mark the note as a boost. Read from the RAW
      // assembled message rather than the sanitized one, so the trailing `via <App>`
      // survives -- it sits in the LAST IRC line of a long boost, which is only
      // present at all because the fragments were rejoined. Returns [] on anything
      // doubtful, so the post is never held up or skipped.
      tags.push(...await boostTagsForMessage(message, { logger }));

      const contentWithHashtags = sanitizedMessage + '\n\n#bowlafterbowl #boostafterboost #bowloftrust';
      const result = await this.nostrClient.publishMessage(contentWithHashtags, tags);
      
      if (result.success) {
        this.stats.successfulPosts++;
        logger.info(`✅ Posted to Nostr: ${sanitizedMessage.substring(0, 50)}...`);
      } else {
        this.stats.failedPosts++;
        logger.error('❌ Failed to post to any Nostr relays');
      }
    } catch (error) {
      this.stats.failedPosts++;
      logger.error('❌ Error posting to Nostr:', error);
    }
  }

  _startWebServer() {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    
    // Security headers
    app.use((req, res, next) => {
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      });
      next();
    });

    app.get('/health', (req, res) => {
      const healthy = this.ircClient?.isConnected && this.nostrClient;
      res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        connected: this.ircClient?.isConnected || false,
        timestamp: new Date().toISOString()
      });
    });

    app.get('/status', (req, res) => {
      const uptimeSeconds = Math.floor((Date.now() - this.stats.startTime) / 1000);
      res.json({
        ...this.stats,
        ...this.assembler.getStats(),
        uptime: uptimeSeconds,
        irc: {
          connected: this.ircClient?.isConnected || false,
          server: this.config.irc.server,
          channels: this.config.irc.channels,
          monitoring: this.config.app.targetBot
        },
        nostr: {
          configured: !!this.nostrClient,
          relays: this.config.nostr.relays,
          testMode: this.config.app.testMode
        }
      });
    });

    app.listen(this.config.app.port, () => {
      logger.info(`🌐 Web server running on port ${this.config.app.port}`);
      logger.info(`📊 Status: http://localhost:${this.config.app.port}/status`);
      logger.info(`💚 Health: http://localhost:${this.config.app.port}/health`);
    });
  }

  _gracefulShutdown(exitCode = 0) {
    logger.info('🛑 Shutting down gracefully...');

    // Publish a half-assembled boost rather than losing it.
    if (this.assembler) {
      this.assembler.flush('shutdown');
      this.assembler.stop();
    }

    if (this.ircClient) {
      try {
        this.ircClient.disconnect();
        logger.info('IRC client disconnected');
      } catch (error) {
        logger.error('Error disconnecting IRC client:', error);
      }
    }
    
    setTimeout(() => {
      logger.info('Shutdown complete');
      process.exit(exitCode);
    }, 1000);
  }
}

// Start the bridge
const bridge = new BoostAfterBoostBridge();
bridge.start().catch(error => {
  logger.error('❌ Failed to start bridge:', error);
  process.exit(1);
});