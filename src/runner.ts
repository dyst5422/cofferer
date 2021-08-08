import JestHasteMap from 'jest-haste-map';
import {cpus} from 'os';
import {Worker} from 'jest-worker';
import path from 'path';
import url from 'url';
import type * as Cofferer from './types';
import {stdoutReporter} from './reporter.mjs';

async function main() {
  // const root = dirname(fileURLToPath(import.meta.url));
  const root = process.cwd();

  // @ts-ignore
  const worker: Worker & { runBench: (benchFile: string) => Promise<Cofferer.RunResult> } = new Worker(path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'worker.js'), {
    forkOptions: {
      execArgv: ['--expose-gc', '--experimental-vm-modules'],
      stdio: [process.stdin, process.stdout, process.stderr, 'ipc']
    }
  });

  // @ts-ignore
  const hasteMap: JestHasteMap = new JestHasteMap.default({
    extensions: ['ts', 'js'],
    maxWorkers: cpus().length,
    name: 'cofferer',
    platforms: [],
    rootDir: root,
    roots: [root],
    retainAllFiles: true,
    useWatchman: true,
  });

  const {hasteFS} = await hasteMap.build();
  const benchFiles = hasteFS.matchFilesWithGlob([
    process.argv[2] ? `**/${process.argv[2]}*` : '**/*.bench.+(ts|js|tsx|jsx|mjs)'
  ], root);

  const allResults: Cofferer.RunResult[] = [];
  await Promise.all(Array.from(benchFiles).map(async benchFile => {
    const result = await worker.runBench(benchFile);
    allResults.push(result);
  }))
  stdoutReporter(allResults);
  worker.end();
}

void main();
