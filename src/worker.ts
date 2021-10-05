import fs from 'fs';
import vm from 'vm';
import {afterAll, afterEach, beforeAll, beforeEach, bench, describe, resetState, run} from './intendant'
import type * as Cofferer from './types';
import { NodeEnvironment } from './cofferer-environment-node';
import {dirname, basename, join} from 'path';
import {BenchOptions} from "./types";

export async function runBench(benchFile: string, benchOptions: BenchOptions): Promise<Cofferer.RunResult> {
  const benchmarkResult: any = {
    benchResults: null,
    errorMessage: null,
  }
  try {
    resetState(benchFile, benchOptions);
    let environment: NodeEnvironment;

    const customRequire = (fileName: string) => {
      const code = fs.readFileSync(join(dirname(benchFile), fileName), 'utf8');
      const moduleFactory = vm.runInContext(
        `(function(module, require) {${code}})`,
        environment.getVmContext()!,
      );

      const module = { exports: {} };
      // And pass customRequire into our moduleFactory.
      moduleFactory(module, require);
      return module.exports;
    };
    environment = new NodeEnvironment({
      benchEnvironmentOptions: {
        beforeAllBenches: beforeAll,
        beforeEachBench: beforeEach,
        afterAllBenches: afterAll,
        afterEachBench: afterEach,
        describeBench: describe,
        beforeAllB: beforeAll,
        beforeEachB: beforeEach,
        afterAllB: afterAll,
        afterEachB: afterEach,
        describeB: describe,
        bench,
        require: customRequire,
        __dirname: dirname(benchFile),
        __filename: benchFile,
      },
    });

    // Use `customRequire` to run the test file.
    customRequire(basename(benchFile));
    const {benchResults} = await run();
    benchmarkResult.benchResults = benchResults;
  } catch (error: any) {
    benchmarkResult.errorMessage = error.message;
  }
  return benchmarkResult;
}
