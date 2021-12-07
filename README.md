# node-replay-reader

[![Node.js CI](https://github.com/ThisNils/node-replay-reader/actions/workflows/main.yml/badge.svg)](https://github.com/ThisNils/node-replay-reader/actions/workflows/main.yml)
[![npm version](https://img.shields.io/npm/v/replay-reader.svg)](https://npmjs.com/package/replay-reader)
[![npm downloads](https://img.shields.io/npm/dm/replay-reader.svg)](https://npmjs.com/package/replay-reader)
[![license](https://img.shields.io/npm/l/replay-reader.svg)](https://github.com/ThisNils/node-replay-reader/blob/master/LICENSE)

A tool to parse fortnite replays

## Example
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
    <script src="node-replay-reader.js"></script>
  </head>
  <body>
    <button id="browse">browse replay file</button>
    <input id="fileinput" type="file" accept=".replay" style="display: none">
    <pre id="result"></pre>

    <script>
      window.addEventListener('load', () => {
        const browseButton = document.getElementById('browse');

        browseButton.addEventListener('click', () => {
          const fileInput = document.getElementById('fileinput');

          fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            const reader = new FileReader();

            reader.addEventListener('load', async () => {
              const replayReader = new ReplayReader(reader.result);
              await replayReader.parse();

              browseButton.style.display = 'none';
              document.getElementById('result').innerText = JSON.stringify(replayReader.toObject(), null, 2);
            });

            reader.readAsArrayBuffer(file);
          });

          fileInput.click();
        });  
      });
    </script>
  </body>
</html>
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
