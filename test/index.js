const fs = require('fs');
const assert = require('assert');

const { ReplayReader } = require('..');

const replays = fs.readdirSync('./replays').map((file) => file.split('.').slice(0, -1).join('.'));

describe('Parsing a replay', () => {
  for (let replay of replays) {
    const binary = fs.readFileSync(`./replays/${replay}.replay`);
    const expectedResult = JSON.parse(fs.readFileSync(`./results/${replay}.json`, 'utf8'));

    it(`should parse ${replay} correctly`, async () => {
      const actualResult = JSON.parse(JSON.stringify(await ReplayReader.parse(binary)));

      assert.deepStrictEqual(actualResult, expectedResult)
    });

    it(`should resolve account names from ${replay} correctly`, async () => {
      const actualResult = await ReplayReader.parse(`./replays/${replay}.replay`, { resolveAccountNames: true });

      assert.equal(actualResult.eliminations.some((elimination) => elimination.eliminator.name || elimination.eliminated.name), true, 'Some eliminations have resolved names');
    });
  };
});
