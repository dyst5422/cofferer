import fs from 'fs';
import vm from 'vm';
import {describe, bench, resetState, run} from './intendant'
import type * as Cofferer from './types';

export async function runBench(benchFile: string): Promise<Cofferer.RunResult> {
  const code = await fs.promises.readFile(benchFile, 'utf8');
  const benchmarkResult: any = {
    benchResults: null,
    errorMessage: null,
  }
  try {
    resetState(benchFile);
    vm.runInNewContext(code, { describe, bench, setTimeout, setInterval, clearTimeout }, { filename: benchFile })
    const {benchResults} = await run();
    benchmarkResult.benchResults = benchResults;
  } catch (error) {
    benchmarkResult.errorMessage = error.message;
  }
  return benchmarkResult;
}
