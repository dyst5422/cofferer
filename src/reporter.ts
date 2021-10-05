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

type FileReportMap = {[key: string]: ReportMap}
type ReportMap = {[key: string]: ReportMap | Cofferer.BenchResult};

export function stdoutReporter(runResults: Cofferer.RunResult[]): void {
  const reportMap: FileReportMap = {};
  for (const runResult of runResults) {
    if (!runResult.benchResults) {
      for (const error of runResult.unhandledErrors ?? []) {
        console.error(error);
      }
      continue;
    }
    for (const benchResult of runResult.benchResults) {
      let currentReportMap: ReportMap = reportMap;
      for (const pathItem of benchResult.benchPath.slice(0,-1)) {
        if (currentReportMap[pathItem] === undefined) {
          currentReportMap[pathItem] = {};
        }
        currentReportMap = currentReportMap[pathItem] as ReportMap;
      }
      currentReportMap[benchResult.benchPath[benchResult.benchPath.length - 1] as string] = benchResult;
    }
  }
  let reportString = '';
  for (const fileName of Object.keys(reportMap)) {
    const fileReport = reportMap[fileName]!;
    let logString = '';
    for (const key of Object.keys(fileReport)) {
      logString += reportBlockOrBench(key, fileReport[key] as ReportMap | Cofferer.BenchResult);
    }
    reportString += `${chalk.cyan.inverse(fileName)}:\n${indentString(logString)}`;
  }
  reportString += '\n';
  process.stdout.write(reportString);
}

function reportBlockOrBench(name: string, blockOrBench: ReportMap | Cofferer.BenchResult): string {
  // console.log(blockOrBench);
  if (blockOrBench.hasOwnProperty('durationsMs')) {
    return reportBench(name, blockOrBench as Cofferer.BenchResult);
  } else {
    return reportBlock(name, blockOrBench as ReportMap);
  }
}

function reportBlock(name: string, block: ReportMap) {
  let logString = '';
  for (const key of Object.keys(block)) {
    logString += indentString(reportBlockOrBench(key, block[key] as ReportMap | Cofferer.BenchResult));
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
    const leaking = varianceExceeded && increasing;

    if (leaking) {
      logString += chalk.blue.inverse(`Leak Detected\n`);
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
