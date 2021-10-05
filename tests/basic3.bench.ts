const fs = require('fs');

describe('some suite', () => {
  bench('read some big files', async() => {
      await fs.promises.readFile(`${__dirname}/inputs/somebigfile.txt`);
  });
});
