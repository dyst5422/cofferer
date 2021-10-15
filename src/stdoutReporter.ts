import * as Cofferer from './types';
import chalk from 'chalk';

export interface BenchmarkResult {
  suiteName: string | null;
  benchmarkName: string;
  durationsMs?: number[];
  meanDurationMs?: number;
  stdDevDurationMs?: number;
  heapSizesMb?: number[];
  meanHeapSizeMb?: number;
  leaking?: boolean;
}

type ReportMap = {[key: string]: ReportMap | Cofferer.BenchResult | Error[]}

export function reportSummary(runResults: Cofferer.RunResult[], runtimeMs: number): void {
  // Build report info map
  const fileReportMap: ReportMap = {};
  let numFiles = 0;
  let numErrors = 0;
  let numBenchmarks = 0;
  for (const runResult of runResults) {
    numFiles += 1;
    if (runResult.unhandledErrors.length > 0) {
      fileReportMap[runResult.filename] = runResult.unhandledErrors;
      numErrors += 1;
    } else {
      for (const benchResult of (runResult.benchResults ?? [])) {
        let currentReportMap = fileReportMap;
        for (const pathItem of benchResult.benchPath.slice(0,-1)) {
          if (currentReportMap[pathItem] === undefined) {
            currentReportMap[pathItem] = {};
          }
          currentReportMap = currentReportMap[pathItem]! as ReportMap;
        }
        currentReportMap[benchResult.benchPath[benchResult.benchPath.length - 1]!] = benchResult;
        numBenchmarks += 1;
      }
    }
  }
  // Build Report String
  let reportString = chalk.magenta.bold.underline('Cofferer Summary\n\n');
  for (const fileName of Object.keys(fileReportMap)) {
    reportString += reportBlockOrBenchOrErrors(fileName, fileReportMap[fileName]!);
    reportString += '\n';
  }
  reportString += '\n';
  reportString += chalk.bold(`Benchmark Suites:\t${chalk.green(`${numFiles - numErrors} complete`)}, ${numFiles} total\n`);
  reportString += chalk.bold(`Benchmarks:\t\t${chalk.green(`${numBenchmarks} complete`)}\n`);
  reportString += chalk.bold(`Time:\t\t\t${chalk.blue(`${roundToDecimals(runtimeMs / 1000, 2)}s`)}\n\n`);
  process.stdout.write(reportString);
}

export function reportRun(runResult: Cofferer.RunResult, runtimeMs: number): void {

  if (runResult.unhandledErrors.length > 0) {
    process.stdout.write(reportErrors(runResult.filename, runResult.unhandledErrors));
  } else {
    // Build report info map
    const reportMap: ReportMap = {};
    let numBenchmarks = 0;
    for (const benchResult of (runResult.benchResults ?? [])) {
      let currentReportMap = reportMap;
      for (const pathItem of benchResult.benchPath.slice(0,-1)) {
        if (currentReportMap[pathItem] === undefined) {
          currentReportMap[pathItem] = {};
        }
        currentReportMap = currentReportMap[pathItem]! as ReportMap;
      }
      currentReportMap[benchResult.benchPath[benchResult.benchPath.length - 1]!] = benchResult;
      numBenchmarks += 1;
    }
    // Build Report String
    let reportString = '';
    reportString += reportBlockOrBenchOrErrors(runResult.filename, reportMap[runResult.filename]!);
    reportString += '\n';
    // reportString += chalk.bold(`Benchmark Suites:\t${chalk.green(`${numFiles - numErrors} complete`)}, ${numFiles} total\n`);
    reportString += chalk.bold(`Benchmarks:\t\t${chalk.green(`${numBenchmarks} complete`)}\n`);
    reportString += chalk.bold(`Time:\t\t\t${chalk.blue(`${roundToDecimals(runtimeMs / 1000, 2)}s`)}\n\n`);
    process.stdout.write(reportString);
  }

}

function reportBlockOrBenchOrErrors(name: string, blockOrBenchOrErrors: ReportMap | Cofferer.BenchResult | Error[]): string {
  if (Array.isArray(blockOrBenchOrErrors)) {
    return reportErrors(name, blockOrBenchOrErrors)
  } else if (blockOrBenchOrErrors.hasOwnProperty('durationsMs')) {
    return reportBench(name, blockOrBenchOrErrors as Cofferer.BenchResult);
  } else {
    return reportBlock(name, blockOrBenchOrErrors as ReportMap);
  }
}

function reportErrors(name: string, errors: Error[]): string {
  let logString = `${chalk.red.inverse('ERROR:')} ${chalk.cyan.inverse(name)}:\n`;
  for (const error of errors) {
    logString += chalk.red(indentString(error.stack?.split('\n').slice(0).join('\n') ?? error.message));
  }

  logString += '\n';
  return logString;
}

function reportBlock(name: string, block: ReportMap) {
  let logString = '';
  for (const key of Object.keys(block)) {
    logString += indentString(reportBlockOrBenchOrErrors(key, block[key]!));
  }
  logString = `${chalk.magenta.inverse(name)}:\n${indentString(logString)}`;
  return logString;
}

function reportBench(name: string, bench: Cofferer.BenchResult): string {
  let logString = '';
  const meanDuration = mean(bench.durationsMs);
  logString += `Mean Duration: ${roundToDecimals(meanDuration)}ms\n`;
  if (bench.heapUsedSizes) {
    const meanHeapUsed = mean(bench.heapUsedSizes);
    logString += `Mean Heap Used: ${roundToDecimals(toMb(meanHeapUsed))}Mb\n`;

    const varianceExceeded = (Math.max(...bench.heapUsedSizes) - Math.min(...bench.heapUsedSizes))/meanHeapUsed > bench.benchOptions.memoryLeakVariance;
    const heapDiffs = bench.heapUsedSizes.slice(0, -1).map((heapUsedVal, index) => bench.heapUsedSizes![index + 1]! - heapUsedVal);
    const heapDiffMean = mean(heapDiffs);
    const increasing = heapDiffMean > 0;
    const leakSize = Math.max(...heapDiffs);
    const leaking = varianceExceeded && increasing && leakSize > bench.benchOptions.memoryLeakMinimumValue;

    if (leaking) {
      logString += chalk.red.inverse(`Leak Detected\n`);
      logString += indentString('[\n');
      for (const heapUsedVal of bench.heapUsedSizes) {
        logString += indentString(`${roundToDecimals(toMb(heapUsedVal))}Mb,\n`, 4);
      }
      logString += indentString(']\n');
    }
  }
  logString = `${chalk.blue.inverse(name)}:\n${indentString(logString)}`;
  return logString;
}

function roundToDecimals(val: number, decimals: number = 2) {
  const rounder = 10 ** decimals;
  return Math.round(val * rounder) / rounder;
}

function mean(array: number[]) {
  return array.reduce((accum, item) => accum + item, 0) / array.length;
}

function toMb(val: number): number {
  return val / 1024 /1024;
}
function indentString(str: string, count: number = 2, indentWith: string = ' '): string {
  return str.replace(/^(?!\s*$)/gm, indentWith.repeat(count));
}
