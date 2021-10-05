import fs from 'fs';

describeB('some suite', () => {
  bench('read some big files', async () => {
      await fs.promises.readFile(`${__dirname}/inputs/somebigfile.txt`);
  });
});
