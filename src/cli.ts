#!/usr/bin/env node

import { Command } from 'commander';
import JestHasteMap from 'jest-haste-map';
import {cpus} from 'os';
import {Worker} from 'jest-worker';
import path from 'path';
import url from 'url';
import fs from 'fs';
import type * as Cofferer from './types';
// @ts-ignore
import {reportSummary, reportRun} from './stdoutReporter.mjs';
import {cosmiconfig} from "cosmiconfig";
import {BenchOptions} from "./types";
import {deserializeError} from "serialize-error";

const MODULE_NAME = 'cofferer'

const CONFIG_DEFAULTS: BenchOptions = {
  iterations: 10,
  timeout: 60000,
  profileMemory: false,
  snapshotHeap: false,
  snapshotOutputDirectory: null,
  memoryLeakVariance: 0.05,
  memoryLeakMinimumValue: 0.5 * 1024 * 1024,
}

async function main() {
  const root = process.cwd();
  const result = await cosmiconfig(MODULE_NAME).search() as { config?: Partial<BenchOptions> };
  const program = new Command();
  program
    .description('Run the benchmark runner')
    .option<number>('-i, --iterations <number>', 'Number of iterations to do of each benchmark', parseFloat, result?.config?.iterations ?? CONFIG_DEFAULTS.iterations)
    .option<number>('-t, --timeout <number>', 'Timeout value for each benchmark', parseFloat, result?.config?.timeout ?? CONFIG_DEFAULTS.timeout)
    .option('-p, --profileMemory', 'Profiled in addition to CPU', result?.config?.profileMemory ?? CONFIG_DEFAULTS.profileMemory)
    .option('-s, --snapshotHeap', 'Save out heap snapshots', result?.config?.snapshotHeap ?? CONFIG_DEFAULTS.snapshotHeap)
    .option<string | null>('-o, --snapshotOutputDirectory <string>', 'Output directory for heap snapshots', outputDir => path.resolve(root, outputDir), result?.config?.snapshotOutputDirectory ?? CONFIG_DEFAULTS.snapshotOutputDirectory)
    .option<number>('-v, --memoryLeakVariance <number>', 'Minimum variance in memory usage to flag as leak [0-1]', parseFloat, result?.config?.memoryLeakVariance ?? CONFIG_DEFAULTS.memoryLeakVariance)
    .option<number>('-m, --memoryLeakMinimumValue <number>', 'Ignore leaks below this fixed memory amount in bytes', parseFloat, result?.config?.memoryLeakMinimumValue ?? CONFIG_DEFAULTS.memoryLeakMinimumValue)
    .parse();

  const config = program.opts() as BenchOptions;

  // Ensure output directory exists
  if (config.snapshotOutputDirectory !== null) {
    await fs.promises.mkdir(config.snapshotOutputDirectory, { recursive: true });
  }

  // @ts-ignore
  const worker: Worker & { runBench: (benchFile: string, benchOptions: BenchOptions) => Promise<Cofferer.RunResult> } = new Worker(path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'worker.js'), {
    forkOptions: {
      execArgv: ['--expose-gc', '--experimental-vm-modules'],
      stdio: [process.stdin, process.stdout, process.stderr, 'ipc']
    },
    // enableWorkerThreads: true,
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
    ? program.args.map(arg => `**/${arg}*.+(ts|js|tsx|jsx|mjs)`)
    : ['**/*.bench.+(ts|js|tsx|jsx|mjs)']
  , root);

  const allResults: Cofferer.RunResult[] = [];
  const startTime = performance.now();
  await Promise.all(Array.from(benchFiles).map(async benchFile => {
    const runStartTime = performance.now();
    const result = await worker.runBench(benchFile, config);
    result.unhandledErrors = result.unhandledErrors.map(err => deserializeError(err));
    reportRun(result, performance.now() - runStartTime);
    allResults.push(result);
  }));
  reportSummary(allResults, performance.now() - startTime);
  worker.end();
}
void main();
