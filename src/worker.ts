import fs from 'fs';
import vm from 'vm';
import {describe, bench, resetState, run} from './intendant'

export async function runBench(benchFile: string) {
  const code = await fs.promises.readFile(benchFile, 'utf8');
  const benchmarkResult: any = {
    benchResults: null,
    errorMessage: null,
  }
  try {
    resetState();
    vm.runInNewContext(code, { describe, bench })
    const {benchResults} = await run();
    benchmarkResult.benchResults = benchResults;
  } catch (error) {
    benchmarkResult.errorMessage = error.message;
  }
  return benchmarkResult;
}
