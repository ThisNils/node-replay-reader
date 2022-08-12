# node-replay-reader

[![Node.js CI](https://github.com/ThisNils/node-replay-reader/actions/workflows/main.yml/badge.svg)](https://github.com/ThisNils/node-replay-reader/actions/workflows/main.yml)
[![npm version](https://img.shields.io/npm/v/replay-reader.svg)](https://npmjs.com/package/replay-reader)
[![npm downloads](https://img.shields.io/npm/dm/replay-reader.svg)](https://npmjs.com/package/replay-reader)
[![license](https://img.shields.io/npm/l/replay-reader.svg)](https://github.com/ThisNils/node-replay-reader/blob/master/LICENSE)

A tool to parse fortnite replays

## Installation
```
npm install replay-reader
```

## Example
Example: 
```javascript
const fs = require('fs').promises;
const { ReplayReader } = require('replay-reader');

(async () => {
  const replay = await ReplayReader.parse('./replays/1.replay');
  await fs.writeFile('./replay.json', JSON.stringify(replay, null, 2));
})();

```

## Help
Feel free to join [this Discord server](https://discord.gg/HsUFr5f)

## License
MIT License

Copyright (c) 2020-2021 Nils S.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
