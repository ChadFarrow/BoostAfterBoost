import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageAssembler } from '../lib/message-assembler.js';
import { parseBoost } from '../podcast-tags.js';

// The real #BowlAfterBowl boost that published as three separate Nostr notes on
// 2026-09-13: Aaron of Essex, 666 sats, Homegrown Hits Episode 150. Zero-width
// space before the amount, as the announcer sends it.
//
// Note where the cuts land. The first is INSIDE an npub -- "…uyt0uyg" + "gwmf4q78…"
// is one 63-character key -- and the second is on a space, which line 2 therefore
// still carries at its end. Both survive only if the join adds nothing and happens
// before anything trims.
const ZW = '​';
const FRAGMENTS = [
  `😈 [Homegrown Hits] [Homegrown Hits - Episode 150] aaronofessex@fountain.fm boosted ${ZW}666 sats saying "Thank you to homegrown hits for continuing to shine a light on real independent music. nostr:npub1cpd59nd6d5m42vta49lv8jnj8u5t4708h3a9uyt0uyg`,
  'gwmf4q78suul0rk@Right Said FredWaving the flag for 🇬🇧 in this episode (why no England flag ffs.)  Question: Demu, v4v, valueverse or new music economy. Do we have a favourite term for this musical ',
  'ecosystem yet?" @1:57:06 via Fountain',
];

const SECOND_BOOST = `🧛 [Bowl After Bowl] [Episode 456] Reed boosted ${ZW}333 sats saying "hi" via BoostMeBitch`;

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** An assembler on a hand-cranked clock, so no test waits out a real window. */
function harness(options = {}) {
  const messages = [];
  let timers = [];
  let nextId = 1;

  const assembler = new MessageAssembler({
    isStart: (line) => parseBoost(line) !== null,
    onMessage: (text, meta) => { messages.push({ text, meta }); },
    logger: silentLogger,
    setTimer: (fn) => { const id = nextId++; timers.push({ id, fn }); return id; },
    clearTimer: (id) => { timers = timers.filter((t) => t.id !== id); },
    ...options,
  });

  return {
    assembler,
    messages,
    texts: () => messages.map((m) => m.text),
    tick() { const due = timers; timers = []; due.forEach((t) => t.fn()); },
    armed: () => timers.length,
  };
}

test('three IRC lines of one boost become one message', () => {
  const h = harness();
  FRAGMENTS.forEach((line) => h.assembler.push(line));
  assert.equal(h.messages.length, 0, 'nothing publishes while the window is open');

  h.tick();

  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].meta.fragments, 3);
  assert.equal(h.texts()[0], FRAGMENTS.join(''));
});

test('the npub split across the first cut is rejoined intact', () => {
  const h = harness();
  FRAGMENTS.forEach((line) => h.assembler.push(line));
  h.tick();

  const npub = h.texts()[0].match(/npub1[023456789acdefghjklmnpqrstuvwxyz]+/)[0];
  assert.equal(npub, 'npub1cpd59nd6d5m42vta49lv8jnj8u5t4708h3a9uyt0uyggwmf4q78suul0rk');
  assert.equal(npub.length, 63, 'an npub is 63 characters; a separator in the join breaks it');
});

test('a cut that lands on a space keeps exactly one space', () => {
  const h = harness();
  FRAGMENTS.forEach((line) => h.assembler.push(line));
  h.tick();

  assert.match(h.texts()[0], /for this musical ecosystem yet\?/);
});

test('the reassembled message ends with the tail the tags are read from', () => {
  const h = harness();
  FRAGMENTS.forEach((line) => h.assembler.push(line));
  h.tick();

  const boost = parseBoost(h.texts()[0]);
  assert.equal(boost.sats, 666);
  assert.equal(boost.app, 'Fountain');
  assert.equal(boost.position, '1:57:06');
  assert.equal(boost.episode, 'Homegrown Hits - Episode 150');
});

test('a second boost closes the first one immediately', () => {
  const h = harness();
  h.assembler.push(FRAGMENTS[0]);
  h.assembler.push(FRAGMENTS[1]);
  h.assembler.push(SECOND_BOOST);

  assert.equal(h.messages.length, 1, 'the first boost publishes as soon as the next one starts');
  assert.equal(h.texts()[0], FRAGMENTS[0] + FRAGMENTS[1]);

  h.tick();
  assert.equal(h.messages.length, 2);
  assert.equal(h.texts()[1], SECOND_BOOST);
});

test('two whole boosts in a row stay two messages', () => {
  const h = harness();
  h.assembler.push(SECOND_BOOST);
  h.assembler.push(SECOND_BOOST);
  h.tick();

  assert.equal(h.messages.length, 2);
  assert.equal(h.messages[0].meta.fragments, 1);
});

test('a non-boost line with nothing pending publishes on its own, as before', () => {
  const h = harness();
  h.assembler.push('the stream is up in five');

  assert.equal(h.messages.length, 1, 'ordinary chatter is not held for a window');
  assert.equal(h.texts()[0], 'the stream is up in five');
  assert.equal(h.armed(), 0);
});

test('a boost whose last fragment never arrives still publishes', () => {
  const h = harness();
  h.assembler.push(FRAGMENTS[0]);
  h.tick();

  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].meta.reason, 'timeout');
  assert.equal(h.texts()[0], FRAGMENTS[0]);
});

test('flush publishes what is pending, and stop leaves nothing armed', () => {
  const h = harness();
  h.assembler.push(FRAGMENTS[0]);
  h.assembler.push(FRAGMENTS[1]);
  h.assembler.flush('shutdown');
  h.assembler.stop();

  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].meta.reason, 'shutdown');
  assert.equal(h.armed(), 0);

  h.assembler.flush('shutdown');
  assert.equal(h.messages.length, 1, 'flushing twice does not republish');
});

test('an endless run of continuations is emitted rather than buffered forever', () => {
  const h = harness({ maxFragments: 3 });
  h.assembler.push(FRAGMENTS[0]);
  h.assembler.push('x');
  h.assembler.push('y');

  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].meta.reason, 'limit');
  assert.equal(h.armed(), 0);
});

test('a predicate that throws degrades to one message per line', () => {
  const h = harness({ isStart: () => { throw new Error('boom'); } });
  h.assembler.push('one');
  h.assembler.push('two');
  h.tick();

  assert.deepEqual(h.texts(), ['one', 'two']);
});

test('counts fragments combined for /status', () => {
  const h = harness();
  FRAGMENTS.forEach((line) => h.assembler.push(line));
  h.tick();
  h.assembler.push(SECOND_BOOST);
  h.tick();

  assert.deepEqual(h.assembler.getStats(), {
    messagesAssembled: 2,
    fragmentsCombined: 3,
    pendingFragments: 0,
  });
});
