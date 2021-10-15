import fs from 'fs';
import vm from 'vm';
import {afterAll, afterEach, beforeAll, beforeEach, bench, describe, resetState, run} from './intendant'
import type * as Cofferer from './types';
import { NodeEnvironment } from './cofferer-environment-node';
import {dirname, basename, join} from 'path';
import {BenchOptions, RunResult} from './types';
import {serializeError} from "serialize-error";

export async function runBench(benchFile: string, benchOptions: BenchOptions): Promise<Cofferer.RunResult> {

  const runResult: RunResult = {
    filename: benchFile,
    benchResults: [],
    unhandledErrors: [],
  };
  try {
    resetState(benchFile, benchOptions);
    let environment: NodeEnvironment;
    const customRequire = (fileName: string) => {

      const fullFileName = join(dirname(benchFile), fileName);
      try {
        let source = fs.readFileSync(fullFileName, 'utf8');
        if (benchFile.endsWith('.ts')) {
          const ts = require('typescript');
          source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }}).outputText;
        }
        const moduleFactory = vm.runInContext(
          `(function(module, require) {var exports = module.exports; console.log(module, require);${source}})`,
          environment.getVmContext()!,
        );
        const module = { exports: {} };
        // And pass customRequire into our moduleFactory.
        moduleFactory(module, customRequire);
        return module.exports;
      } catch (e) {
        if (e.code === 'ENOENT') {
          return require(fileName);
        }
        throw e;
      }
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
    if (require.cache['ts'] !== undefined) deleteModule('ts');
    const {benchResults, unhandledErrors} = await run();
    runResult.benchResults = benchResults;
    runResult.unhandledErrors.push(...unhandledErrors.map(err => serializeError(err) as Error));
  } catch (error: any) {
    runResult.unhandledErrors.push(serializeError(error));
  }
  return runResult;
}


/**
 * Deletes a node module and all associated children
 * from node require cache
 * @param {string} moduleName The name of the module or
 *                            absolute/relative path to it
 */
function deleteModule(moduleName: string) {
  const solvedName = require.resolve(moduleName)
  const nodeModule = require.cache[solvedName];
  if (nodeModule) {
    for (var i = 0; i < nodeModule.children.length; i++) {
      var child = nodeModule.children[i]!;
      deleteModule(child.filename);
    }
    delete require.cache[solvedName];
  }
}
