const fs = require('fs').promises;
const { ReplayReader } = require('../dist');

(async () => {
  const replay = await ReplayReader.parse('./replays/UnsavedReplay-2022.08.10-11.39.59.replay');
  await fs.writeFile('./replay.json', JSON.stringify(replay, null, 2));
})();
