// NIP-73 external content identifiers and boost evidence for a text relay.
//
// https://github.com/nostr-protocol/nips/blob/master/73.md
//   Podcast Feeds  "podcast:guid:<guid>"            k = "podcast:guid"
//   Podcast Items  "podcast:item:guid:<item guid>"  k = "podcast:item:guid"
//
// This bot forwards IRC text. The only podcast identity in the message is a
// display name, so the feed GUID has to be looked up by title -- and a title is
// not an identifier. Two different feeds are both titled exactly "Stay Awhile"
// with different GUIDs, so anything less strict than "exactly one exact match"
// publishes a confidently wrong identifier, which is worse than publishing none:
// a wrong id mis-aggregates across every client that reads these tags, a missing
// one merely under-aggregates.
//
// The episode is resolved the same way, but INSIDE the feed that already
// resolved: Podcast Index lists that feed's episodes, and the item guid is
// emitted only when exactly one of them has the bracketed episode title. That is
// a much narrower question than a title search across the whole index, which is
// why it is safe where a global episode-title search would not be. A live-show
// title ("LIVE! ★ Bowl After Bowl ★ Tuesdays 9PM Central US") matches nothing
// and the boost stays show-level.
//
// The tags are not only identity. A note that names a show but carries no sign
// of being a boost is, to an indexer, a note about a show. Indexers such as
// OnlyBoosts keep a note as a boost only when it carries evidence: an `amount`
// tag, a boost topic tag, or a quoted zap receipt. A keysend boost has no zap
// receipt to quote, so the evidence this relay can supply is the amount the
// IRC line already states, in millisats, plus the topic tags every boost client
// sends. Without those, every post here is indexed as nothing at all.

import crypto from 'crypto';

const API = 'https://api.podcastindex.org/api/1.0';

// Both outcomes are cached. A success is stable; so, in practice, is ambiguity --
// it is a property of the index, not a transient error, and re-querying "Stay
// Awhile" on every boost would spend a request to reach the same "no" each time.
// A null value means "asked, and the answer was not usable".
const feedGuidByName = new Map();

// Episode misses are cached with a TTL rather than forever: a boost can arrive
// before Podcast Index has picked the episode up from the feed, so "not there"
// is the one answer that gets stale. Fifteen minutes turns a live-show boost
// storm into one request rather than one per boost, without pinning the miss.
const itemGuidByTitle = new Map();
const MISS_TTL_MS = 15 * 60 * 1000;

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;

/** Show name from BoostAfterBoost's format: "🎳 [Show] [Track] … boosted N sats". */
export function extractShowName(message) {
  if (typeof message !== 'string') return null;
  const match = message.match(/\[([^\]]+)\]/);
  if (!match) return null;
  const name = match[1].trim();
  return name && name.toLowerCase() !== 'none' ? name : null;
}

// "<emoji> [Show] [Episode] <sender> boosted N sats saying "…" @h:mm:ss via App"
// The episode bracket, the quote, the position and the app are all optional in
// the wild; the sender can be anything ("ChadF and 33 others", an @fountain.fm
// address, a name in exotic glyphs). Everything after "sats" is read separately
// so a quoted message containing its own quotes or the word "via" cannot swallow
// the tail.
const HEAD = /^[^[]*\[([^\]]+)\]\s*(?:\[([^\]]+)\]\s*)?(.*?)\s+boosted\s+([\d,]+)\s+sats?\b(.*)$/su;
// Greedy prefix, so it is the LAST "via" that names the app.
const VIA = /^.*\s+via\s+(\S.*?)\s*$/su;
const POSITION = /@(\d+:\d\d(?::\d\d)?)\b/u;

/**
 * The boost a message describes, or null when it is not a boost (a continuation
 * of a long message, for instance). Read from the RAW text, before sanitizing, so
 * the trailing app survives.
 *
 * This doubles as the assembler's "does this line START a message?" predicate
 * (lib/message-assembler.js), which is why the null case matters as much as the
 * parse. Loosen it so that a continuation line parses as a boost and a long boost
 * splits back into several notes; tighten it so that a real head line does not,
 * and that boost publishes as fragments again.
 */
export function parseBoost(message) {
  if (typeof message !== 'string') return null;
  const text = message.replace(ZERO_WIDTH, '').replace(/[\x00-\x1F\x7F]/g, ' ').trim();
  const m = text.match(HEAD);
  if (!m) return null;
  const [, show, episode, sender, satsText, tail] = m;
  const sats = parseInt(satsText.replace(/,/g, ''), 10);
  if (!Number.isFinite(sats) || sats <= 0) return null;

  const showName = show.trim();
  const episodeName = episode?.trim() || null;
  const app = tail.match(VIA)?.[1]?.trim() || null;
  const position = tail.match(POSITION)?.[1] || null;

  return {
    show: showName && showName.toLowerCase() !== 'none' ? showName : null,
    episode: episodeName && episodeName.toLowerCase() !== 'none' ? episodeName : null,
    sender: sender.trim() || null,
    sats,
    app,
    position,
  };
}

/**
 * The tags for one boost. Every field is optional and each one adds only the
 * tags it can stand behind:
 *
 *   feedGuid  -> ["i","podcast:guid:…"] + ["k","podcast:guid"]
 *   itemGuid  -> ["i","podcast:item:guid:…"] + ["k","podcast:item:guid"]
 *   sats      -> ["amount","<millisats>"] + the boost topic tags
 *   app       -> ["app","<name>"]  the app the listener boosted from
 *
 * `amount` is in millisats, as in NIP-57, and is what an indexer reads to keep
 * the note as a boost at all. The topic tags are the ones every boost client
 * already sends, so a reader filtering on any of them finds these. `app` names
 * the ORIGIN app, never this relay: the relay is the `client` tag on the event.
 */
export function buildBoostTags({ feedGuid = null, itemGuid = null, sats = null, app = null } = {}) {
  const tags = [];
  if (feedGuid) {
    tags.push(['i', `podcast:guid:${feedGuid}`], ['k', 'podcast:guid']);
  }
  if (feedGuid && itemGuid) {
    tags.push(['i', `podcast:item:guid:${itemGuid}`], ['k', 'podcast:item:guid']);
  }
  if (Number.isInteger(sats) && sats > 0) {
    tags.push(
      ['amount', String(sats * 1000)],
      ['t', 'boost'],
      ['t', 'boostagram'],
      ['t', 'value4value'],
    );
  }
  if (app) {
    tags.push(['app', app]);
  }
  return tags;
}

/** Kept for callers of the previous shape: feed tags only. */
export function buildPodcastTags(feedGuid) {
  return buildBoostTags({ feedGuid });
}

function authHeaders() {
  const apiKey = process.env.PODCAST_INDEX_API_KEY;
  const apiSecret = process.env.PODCAST_INDEX_API_SECRET;
  if (!apiKey || !apiSecret) return null; // not configured: silently skip the tags
  const apiTime = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1')
    .update(apiKey + apiSecret + apiTime)
    .digest('hex');
  return {
    'User-Agent': 'BoostAfterBoost/1.0',
    'X-Auth-Date': String(apiTime),
    'X-Auth-Key': apiKey,
    'Authorization': hash,
  };
}

/**
 * Resolve a show title to its feed GUID, but only when the answer is unambiguous.
 * Returns null for no match, several matches, or any failure -- callers then emit
 * no tag rather than a guess.
 */
export async function lookupUnambiguousFeedGuid(name, { logger = console } = {}) {
  if (!name) return null;

  const key = name.trim().toLowerCase();
  if (feedGuidByName.has(key)) return feedGuidByName.get(key);

  const headers = authHeaders();
  if (!headers) return null;

  try {
    const response = await fetch(`${API}/search/bytitle?q=${encodeURIComponent(name)}`, {
      headers,
      // Sits in front of an IRC-triggered post; it must not hold one up.
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn?.(`Feed GUID lookup failed for "${name}": HTTP ${response.status}`);
      return null; // not cached: a transient failure should be retried
    }

    const data = await response.json();
    const feeds = Array.isArray(data?.feeds) ? data.feeds : [];
    const exact = feeds.filter(
      f => typeof f?.title === 'string' && f.title.trim().toLowerCase() === key && f.podcastGuid,
    );

    if (exact.length !== 1) {
      logger.info?.(
        `No unambiguous feed GUID for "${name}" (${exact.length} exact matches); publishing untagged`,
      );
      feedGuidByName.set(key, null);
      return null;
    }

    const guid = String(exact[0].podcastGuid).trim().toLowerCase();
    feedGuidByName.set(key, guid);
    logger.info?.(`Resolved feed GUID for "${name}": ${guid}`);
    return guid;
  } catch (error) {
    logger.warn?.(`Feed GUID lookup errored for "${name}": ${error?.message || error}`);
    return null;
  }
}

/**
 * Resolve an episode title to its item guid within one feed, only when exactly
 * one of that feed's episodes carries the title. Same contract as the feed
 * lookup: null on no match, several matches, or any failure. The item guid is
 * published exactly as the feed declares it -- it may be a URL rather than a
 * UUID, and it is never normalised.
 */
export async function lookupUnambiguousItemGuid(feedGuid, title, { logger = console } = {}) {
  if (!feedGuid || !title) return null;

  const key = `${feedGuid}\n${title.trim().toLowerCase()}`;
  const cached = itemGuidByTitle.get(key);
  if (cached && (cached.guid || cached.until > Date.now())) return cached.guid;

  const headers = authHeaders();
  if (!headers) return null;

  try {
    const response = await fetch(
      `${API}/episodes/bypodcastguid?guid=${encodeURIComponent(feedGuid)}&max=1000`,
      { headers, signal: AbortSignal.timeout(5000) },
    );

    if (!response.ok) {
      logger.warn?.(`Item GUID lookup failed for "${title}": HTTP ${response.status}`);
      return null; // not cached: a transient failure should be retried
    }

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const want = title.trim().toLowerCase();
    const exact = items.filter(
      e => typeof e?.title === 'string' && e.title.trim().toLowerCase() === want && e.guid,
    );

    if (exact.length !== 1) {
      logger.info?.(
        `No unambiguous item GUID for "${title}" (${exact.length} exact matches); publishing show-level`,
      );
      itemGuidByTitle.set(key, { guid: null, until: Date.now() + MISS_TTL_MS });
      return null;
    }

    const guid = String(exact[0].guid).trim();
    itemGuidByTitle.set(key, { guid, until: Infinity });
    logger.info?.(`Resolved item GUID for "${title}": ${guid}`);
    return guid;
  } catch (error) {
    logger.warn?.(`Item GUID lookup errored for "${title}": ${error?.message || error}`);
    return null;
  }
}

/**
 * Every tag one IRC line supports. Never throws and never blocks a post: on any
 * problem the message goes out with whatever tags did resolve, or none.
 *
 * A line that is not a boost (a continuation of a long message) still gets the
 * feed tag when its first bracket names a show, exactly as before, and no
 * evidence tags -- a fragment is not a boost.
 */
export async function boostTagsForMessage(message, opts = {}) {
  try {
    const boost = parseBoost(message);
    const showName = boost?.show ?? extractShowName(message);
    const feedGuid = await lookupUnambiguousFeedGuid(showName, opts);
    const itemGuid = boost?.episode
      ? await lookupUnambiguousItemGuid(feedGuid, boost.episode, opts)
      : null;
    return buildBoostTags({
      feedGuid,
      itemGuid,
      sats: boost?.sats ?? null,
      app: boost?.app ?? null,
    });
  } catch {
    return [];
  }
}

/** The previous entry point, kept as an alias. */
export const podcastTagsForMessage = boostTagsForMessage;

export const __testing = {
  clearCache: () => { feedGuidByName.clear(); itemGuidByTitle.clear(); },
  feedGuidByName,
  itemGuidByTitle,
};
