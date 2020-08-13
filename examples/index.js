const { readFile, writeFile } = require('fs').promises;
const parse = require('..');

(async () => {
  const replayBuffer = await readFile('./replays/1.replay');
  const parsedReplay = parse(replayBuffer);
  await writeFile('./parsedReplay.json', JSON.stringify(parsedReplay, null, 2));
  console.log('Wrote results to ./parsedReplay.json');
})();
