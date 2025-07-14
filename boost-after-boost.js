// boost-after-boost.js - IRC to Nostr bridge for monitoring BoostAfterBoost bot
import express from 'express';
import dotenv from 'dotenv';
import { finalizeEvent, nip19 } from 'nostr-tools';
import { Relay } from 'nostr-tools/relay';
import { logger } from './lib/logger.js';
import { IRCClient } from './lib/irc-client.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure environment variables
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Store bot start time and statistics
const botStartTime = new Date();
const stats = {
  messagesMonitored: 0,
  successfulPosts: 0,
  failedPosts: 0,
  lastActivity: null,
  relayStats: {
    'wss://relay.damus.io': { success: 0, failed: 0 },
    'wss://relay.nostr.band': { success: 0, failed: 0 },
    'wss://nostr.mom': { success: 0, failed: 0 },
    'wss://relay.primal.net': { success: 0, failed: 0 }
  }
};

// IRC Configuration
const ircConfig = {
  server: process.env.IRC_SERVER || 'irc.zeronode.net',
  port: parseInt(process.env.IRC_PORT) || 6667,
  secure: process.env.IRC_SECURE === 'true',
  nickname: process.env.IRC_NICKNAME || 'BoostAfterBoost_Reader',
  userName: process.env.IRC_USERNAME || 'boost_reader',
  realName: process.env.IRC_REALNAME || 'BoostAfterBoost Reader Bot',
  password: process.env.IRC_PASSWORD,
  channels: [process.env.IRC_CHANNEL || '#BowlAfterBowl']
};

// Target bot to monitor
const TARGET_BOT = process.env.TARGET_BOT || 'BoostAfterBoost';

// Nostr Bot configuration
class NostrBot {
  constructor(nsec, relays = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nostr.mom', 'wss://relay.primal.net']) {
    this.nsec = nsec;
    this.relays = relays;
  }

  getSecretKey() {
    try {
      const { data } = nip19.decode(this.nsec);
      return data;
    } catch {
      throw new Error('Invalid nsec format');
    }
  }

  async publishToRelays(event) {
    // Test mode - just log what would be posted without actually posting
    if (process.env.TEST_MODE === 'true') {
      logger.info('TEST MODE - Would post to relays', { 
        content: event.content,
        tags: event.tags,
        relays: this.relays 
      });
      return;
    }

    logger.info(`Attempting to publish to ${this.relays.length} relays`, { content: event.content });
    
    const publishPromises = this.relays.map(async (relayUrl) => {
      try {
        logger.debug(`Connecting to ${relayUrl}`);
        const relay = await Relay.connect(relayUrl);
        logger.debug(`Publishing to ${relayUrl}`);
        await relay.publish(event);
        relay.close();
        logger.info(`Successfully published to ${relayUrl}`);
        stats.relayStats[relayUrl].success++;
      } catch (error) {
        logger.error(`Failed to publish to ${relayUrl}:`, error);
        stats.relayStats[relayUrl].failed++;
        throw error;
      }
    });
    
    const results = await Promise.allSettled(publishPromises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;
    
    logger.info(`Publishing complete: ${successCount} successful, ${failCount} failed`);
    
    if (successCount > 0) {
      stats.successfulPosts++;
    } else {
      stats.failedPosts++;
    }
    
    return successCount > 0;
  }
}

// Initialize Nostr bot
let nostrBot = null;
if (process.env.NOSTR_NSEC && process.env.NOSTR_NSEC !== 'your_nostr_private_key_here') {
  nostrBot = new NostrBot(process.env.NOSTR_NSEC);
  logger.info('✅ Nostr bot initialized');
} else {
  logger.error('⚠️ NOSTR_NSEC not configured - running in read-only mode');
}

// Create IRC client with message handler
let ircClient = null;

function setupIRCClient() {
  ircClient = new IRCClient(ircConfig);
  
  // Override the client creation to add message handler
  const originalConnect = ircClient.connect.bind(ircClient);
  ircClient.connect = function() {
    originalConnect();
    
    // Add message handler after connection
    if (this.client) {
      this.client.on('message', async (from, to, message) => {
        // Only monitor messages from the target bot
        if (from === TARGET_BOT) {
          logger.info(`📨 Message from ${TARGET_BOT}:`, message);
          stats.messagesMonitored++;
          stats.lastActivity = new Date();
          
          // Post to Nostr
          if (nostrBot) {
            await postToNostr(message);
          }
        }
      });
      
      logger.info(`🎯 Monitoring messages from ${TARGET_BOT} in ${ircConfig.channels[0]}`);
    }
  };
  
  ircClient.connect();
}

async function postToNostr(message) {
  if (!nostrBot) {
    logger.error('Nostr bot not configured');
    return;
  }

  try {
    const sk = nostrBot.getSecretKey();
    
    // Create the Nostr event
    const event = finalizeEvent({
      kind: 1,
      content: message,
      tags: [
        ['t', 'bowlafterbowl'],
        ['t', 'boostafterboost'],
        ['r', `irc://${ircConfig.server}/${ircConfig.channels[0]}`]
      ],
      created_at: Math.floor(Date.now() / 1000),
    }, sk);

    await nostrBot.publishToRelays(event);
    logger.info(`✅ Posted to Nostr: ${message.substring(0, 50)}...`);
  } catch (error) {
    logger.error('Error posting to Nostr:', error);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  const isHealthy = ircClient && ircClient.connected;
  res.status(isHealthy ? 200 : 503).json({ 
    status: isHealthy ? 'healthy' : 'unhealthy',
    uptime: process.uptime(),
    connected: ircClient ? ircClient.connected : false
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  const uptimeSeconds = Math.floor((new Date() - botStartTime) / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  
  res.json({
    status: 'running',
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    startTime: botStartTime,
    stats,
    irc: {
      connected: ircClient ? ircClient.connected : false,
      server: ircConfig.server,
      channel: ircConfig.channels[0],
      monitoring: TARGET_BOT
    },
    nostr: {
      configured: !!nostrBot,
      relays: nostrBot ? nostrBot.relays : []
    }
  });
});

// Start server
const PORT = process.env.PORT || 3334;
app.listen(PORT, () => {
  logger.info(`🚀 BoostAfterBoost bridge running on port ${PORT}`);
  logger.info(`📊 Status: http://localhost:${PORT}/status`);
  logger.info(`💚 Health: http://localhost:${PORT}/health`);
  
  // Initialize IRC client
  setupIRCClient();
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  if (ircClient) {
    ircClient.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  if (ircClient) {
    ircClient.disconnect();
  }
  process.exit(0);
});