const fs = require('fs').promises;
const { ReplayReader } = require('../dist');

(async () => {
  const reader = new ReplayReader('./replays/1.replay');
  const replay = await reader.parse();
  await fs.writeFile('./replay.json', JSON.stringify(replay, null, 2));
})();
