import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoost, buildBoostTags, extractShowName, boostTagsForMessage, __testing } from '../podcast-tags.js';

// Real lines from the #BowlAfterBowl channel, zero-width space included.
const ZW = '​';
const LINES = {
  full: `🧛 [Homegrown Hits] [Homegrown Hits Episode 150] Matt Finlay boosted ${ZW}123 sats saying "Gday norm" @0:10:36 via BoostMeBuddy`,
  noSaying: `✨ [Homegrown Hits] [Homegrown Hits Episode 149] ChadF and 33 others boosted ${ZW}333 sats via BoostMeBitch`,
  noEpisode: `💋 [Bowl After Bowl] Ȼħ!łłꞤθⱳ𐏑 boosted ${ZW}2669 sats saying "Balance 3333 sats from failed bowlafterbowl.com boost" via OnlyBoosts`,
  quotesInside: `🧛 [Homegrown Hits] [Homegrown Hits - Episode 149] mattfinlay@fountain.fm boosted ${ZW}123 sats saying "Gorgeous remaster!"Halt Mich Fest" by nostr:npub17jm4z3q" via Fountain`,
  noVia: `[Homegrown Hits] [Homegrown Hits - Episode 145] Logues boosted ${ZW}5000 sats saying "Ep 145...secret episode?? Jk"`,
  viaInMessage: `✨ [Bowl After Bowl] [Episode 456] Reed boosted ${ZW}333 sats saying "sent via the app via OnlyBoosts" via BoostMeBitch`,
  continuation: `9:19 via BoostMeBitch`,
  fragment: `mething tells me this show isn't running into whatever this issue is" via Podcast Index`,
  thousands: `🎳 [Bowl After Bowl] [Episode 456 ★ Can I Pop the Call?] boostmebitch.com user boosted ${ZW}10,000 sats saying "some overdue value" via BoostMeBitch`,
  live: `💋💋 [Bowl After Bowl] [LIVE! ★ Bowl After Bowl ★ Tuesdays 9PM Central US] Reed boosted ${ZW}6969 sats saying "hi" via BoostMeBitch`,
};

test('parses the full shape: show, episode, sender, sats, position, app', () => {
  assert.deepEqual(parseBoost(LINES.full), {
    show: 'Homegrown Hits',
    episode: 'Homegrown Hits Episode 150',
    sender: 'Matt Finlay',
    sats: 123,
    app: 'BoostMeBuddy',
    position: '0:10:36',
  });
});

test('a line with no quoted message still parses', () => {
  const b = parseBoost(LINES.noSaying);
  assert.equal(b.sender, 'ChadF and 33 others');
  assert.equal(b.sats, 333);
  assert.equal(b.app, 'BoostMeBitch');
  assert.equal(b.position, null);
});

test('a show-level line has no episode', () => {
  const b = parseBoost(LINES.noEpisode);
  assert.equal(b.show, 'Bowl After Bowl');
  assert.equal(b.episode, null);
  assert.equal(b.sats, 2669);
  assert.equal(b.app, 'OnlyBoosts');
});

test('quotes inside the message do not swallow the app', () => {
  assert.equal(parseBoost(LINES.quotesInside).app, 'Fountain');
});

test('the word "via" inside the message does not become the app', () => {
  assert.equal(parseBoost(LINES.viaInMessage).app, 'BoostMeBitch');
});

test('no trailing via means no app', () => {
  const b = parseBoost(LINES.noVia);
  assert.equal(b.sats, 5000);
  assert.equal(b.app, null);
});

test('thousands separators parse', () => {
  assert.equal(parseBoost(LINES.thousands).sats, 10000);
});

test('continuation lines of a long message are not boosts', () => {
  assert.equal(parseBoost(LINES.continuation), null);
  assert.equal(parseBoost(LINES.fragment), null);
  assert.equal(parseBoost(''), null);
  assert.equal(parseBoost(null), null);
});

test('extractShowName still reads the first bracket', () => {
  assert.equal(extractShowName(LINES.full), 'Homegrown Hits');
  assert.equal(extractShowName('[None] x boosted 1 sats'), null);
});

test('buildBoostTags: every field adds only its own tags', () => {
  assert.deepEqual(buildBoostTags({}), []);
  assert.deepEqual(buildBoostTags({ feedGuid: 'f' }), [
    ['i', 'podcast:guid:f'], ['k', 'podcast:guid'],
  ]);
  // An item guid without a feed guid is never emitted alone.
  assert.deepEqual(buildBoostTags({ itemGuid: 'x' }), []);
  assert.deepEqual(buildBoostTags({ feedGuid: 'f', itemGuid: 'https://example.com/ep/1' }), [
    ['i', 'podcast:guid:f'], ['k', 'podcast:guid'],
    ['i', 'podcast:item:guid:https://example.com/ep/1'], ['k', 'podcast:item:guid'],
  ]);
  assert.deepEqual(buildBoostTags({ sats: 333 }), [
    ['amount', '333000'], ['t', 'boost'], ['t', 'boostagram'], ['t', 'value4value'],
  ]);
  assert.deepEqual(buildBoostTags({ app: 'Fountain' }), [['app', 'Fountain']]);
  assert.deepEqual(buildBoostTags({ sats: 0 }), []);
  assert.deepEqual(buildBoostTags({ sats: 1.5 }), []);
});

test('the amount is millisats, as NIP-57 spells it', () => {
  const amount = buildBoostTags({ sats: 10000 }).find(t => t[0] === 'amount');
  assert.deepEqual(amount, ['amount', '10000000']);
});

test('without API keys a boost still carries amount, topic and app tags', async () => {
  __testing.clearCache();
  const saved = [process.env.PODCAST_INDEX_API_KEY, process.env.PODCAST_INDEX_API_SECRET];
  delete process.env.PODCAST_INDEX_API_KEY;
  delete process.env.PODCAST_INDEX_API_SECRET;
  try {
    const tags = await boostTagsForMessage(LINES.full, { logger: { info() {}, warn() {} } });
    assert.deepEqual(tags, [
      ['amount', '123000'], ['t', 'boost'], ['t', 'boostagram'], ['t', 'value4value'],
      ['app', 'BoostMeBuddy'],
    ]);
    assert.deepEqual(await boostTagsForMessage(LINES.continuation), []);
  } finally {
    if (saved[0] !== undefined) process.env.PODCAST_INDEX_API_KEY = saved[0];
    if (saved[1] !== undefined) process.env.PODCAST_INDEX_API_SECRET = saved[1];
  }
});

test('with a resolved feed, the episode lookup is scoped to it and exact', async () => {
  __testing.clearCache();
  process.env.PODCAST_INDEX_API_KEY = 'k';
  process.env.PODCAST_INDEX_API_SECRET = 's';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/search/bytitle')) {
      return { ok: true, json: async () => ({ feeds: [{ title: 'Homegrown Hits', podcastGuid: 'AC746D09-FEED' }] }) };
    }
    if (String(url).includes('/episodes/bypodcastguid')) {
      return { ok: true, json: async () => ({ items: [
        { title: 'Homegrown Hits Episode 150', guid: 'item-150' },
        { title: 'Homegrown Hits Episode 149', guid: 'item-149' },
      ] }) };
    }
    throw new Error('unexpected ' + url);
  };
  try {
    const quiet = { logger: { info() {}, warn() {} } };
    const tags = await boostTagsForMessage(LINES.full, quiet);
    assert.deepEqual(tags, [
      ['i', 'podcast:guid:ac746d09-feed'], ['k', 'podcast:guid'],
      ['i', 'podcast:item:guid:item-150'], ['k', 'podcast:item:guid'],
      ['amount', '123000'], ['t', 'boost'], ['t', 'boostagram'], ['t', 'value4value'],
      ['app', 'BoostMeBuddy'],
    ]);
    assert.ok(calls.some(u => u.includes('guid=ac746d09-feed')), 'episodes are listed by the resolved feed guid');

    // A live-show title matches no episode: show-level, and the miss is cached.
    const before = calls.length;
    const live = await boostTagsForMessage(LINES.live.replace('Bowl After Bowl]', 'Homegrown Hits]'), quiet);
    assert.ok(!live.some(t => t[1]?.startsWith('podcast:item:guid:')), 'no item tag for a live title');
    await boostTagsForMessage(LINES.live.replace('Bowl After Bowl]', 'Homegrown Hits]'), quiet);
    assert.equal(calls.length, before + 1, 'the miss is served from cache the second time');

    // A second episode with the same title makes the answer ambiguous: no tag.
    __testing.clearCache();
    globalThis.fetch = async (url) => {
      if (String(url).includes('/search/bytitle')) {
        return { ok: true, json: async () => ({ feeds: [{ title: 'Homegrown Hits', podcastGuid: 'f' }] }) };
      }
      return { ok: true, json: async () => ({ items: [
        { title: 'Homegrown Hits Episode 150', guid: 'a' },
        { title: 'Homegrown Hits Episode 150', guid: 'b' },
      ] }) };
    };
    const dup = await boostTagsForMessage(LINES.full, quiet);
    assert.ok(!dup.some(t => t[1]?.startsWith('podcast:item:guid:')), 'two exact matches emit nothing');
    assert.ok(dup.some(t => t[1] === 'podcast:guid:f'), 'the feed tag still stands');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PODCAST_INDEX_API_KEY;
    delete process.env.PODCAST_INDEX_API_SECRET;
    __testing.clearCache();
  }
});
