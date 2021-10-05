import { Command } from 'commander';
import JestHasteMap from 'jest-haste-map';
import {cpus} from 'os';
import {Worker} from 'jest-worker';
import path from 'path';
import url from 'url';
import type * as Cofferer from './types';
// @ts-ignore
import {stdoutReporter} from './reporter.mjs';
import {cosmiconfig} from "cosmiconfig";
import {BenchOptions} from "./types";

const MODULE_NAME = 'cofferer'



async function main() {
  const program = new Command();
  program
    .option<number>('-i, --iterations <number>', 'Number of iterations to do of each benchmark', parseFloat, 10)
    .option<number>('-t, --timeout <number>', 'Timeout value for each benchmark', parseFloat, 60000)
    .option('-p, --profileMemory', 'Profiled in addition to CPU', true)
    .option('-s, --snapshotHeap', 'Save out heap snapshots', false)
    .option<number>('-v, --memoryLeakVariance <number>', 'Save out heap snapshots', parseFloat, 0.05)
    .parse();
  const result = await cosmiconfig(MODULE_NAME).search();

  const config: BenchOptions = {
    ...result?.config,
    ...program.opts(),
  };
  const root = process.cwd();

  // @ts-ignore
  const worker: Worker & { runBench: (benchFile: string, benchOptions: BenchOptions) => Promise<Cofferer.RunResult> } = new Worker(path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'worker.js'), {
    forkOptions: {
      execArgv: ['--expose-gc', '--experimental-vm-modules'],
      stdio: [process.stdin, process.stdout, process.stderr, 'ipc']
    }
  });

  // @ts-ignore
  const hasteMap: JestHasteMap = new JestHasteMap.default({
    extensions: ['ts', 'js'],
    maxWorkers: cpus().length,
    name: MODULE_NAME,
    platforms: [],
    rootDir: root,
    roots: [root],
    retainAllFiles: true,
    useWatchman: true,
  });



  const {hasteFS} = await hasteMap.build();
  const benchFiles = hasteFS.matchFilesWithGlob(program.args.length > 0
    ? program.args.map(arg => `**/${arg}*`)
    : ['**/*.bench.+(ts|js|tsx|jsx|mjs)']
  , root);

  const allResults: Cofferer.RunResult[] = [];
  await Promise.all(Array.from(benchFiles).map(async benchFile => {
    const result = await worker.runBench(benchFile, config);
    allResults.push(result);
  }))
  stdoutReporter(allResults);
  worker.end();
}
void main();
