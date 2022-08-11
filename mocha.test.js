/* eslint-disable no-undef */
const assert = require('assert');
const { ReplayReader } = require('.');

describe('Parsing a replay', () => {
  it('Should parse a replay', async () => {
    const replay = await ReplayReader.parse('./examples/replays/1.replay');
    assert.notStrictEqual(typeof replay.meta, 'undefined', 'The replay meta should be defined');
  });

  it('Should parse a replay with resolveAccountNames enabled', async () => {
    const replay = await ReplayReader.parse('./examples/replays/1.replay', { resolveAccountNames: true });
    assert.notStrictEqual(typeof replay.meta, 'undefined', 'The replay meta should be defined');
  });
});
