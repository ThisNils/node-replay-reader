/* eslint-disable no-undef */
const assert = require('assert');
const { ReplayReader } = require('.');

describe('Parsing a replay', () => {
  it('Should initialize the reader', () => {
    reader = new ReplayReader('./examples/replays/1.replay');
  });

  it('Should parse a replay', async () => {
    const replay = await reader.parse();
    assert.notStrictEqual(typeof replay.meta, 'undefined', 'The replay meta should be defined');
  });
});
