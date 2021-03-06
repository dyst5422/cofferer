import type * as Intendant from './types';
import type * as Cofferer from '../types';
import {format as prettyFormat} from 'pretty-format';
import invariant from 'ts-invariant';
import {getState} from './state';
import dedent from 'dedent';
import {ErrorWithStack, formatTime, isPromise} from 'jest-util';
import v8 from 'v8';
import path from "path";

function takesDoneCallback(fn: Intendant.AsyncFn): fn is Intendant.DoneTakingBenchFn {
  return fn.length > 0;
}

export function makeDescribe(
  name: Cofferer.BlockName,
  parent?: Intendant.DescribeBlock,
  mode?: Intendant.BlockMode,
): Intendant.DescribeBlock {
  let _mode = mode;
  if (parent && !mode) {
    // If not set explicitly, inherit from the parent describe.
    _mode = parent.mode;
  }

  return {
    type: 'describeBlock',
    children: [],
    hooks: [],
    mode: _mode,
    name,
    parent,
  };
}

export function describeBlockHasBenches(
  describe: Intendant.DescribeBlock,
): boolean {
  return describe.children.some(
    child => child.type === 'bench' || describeBlockHasBenches(child),
  );
}

export function makeBench(
  fn: Intendant.BenchFn,
  mode: Intendant.BenchMode,
  name: Cofferer.BenchName,
  parent: Intendant.DescribeBlock,
  options: Cofferer.BenchOptions,
  asyncError: Cofferer.Exception,
): Intendant.BenchEntry {
  return {
    type: 'bench', // eslint-disable-next-line sort-keys
    asyncError,
    errors: [],
    fn,
    invocations: 0,
    mode,
    name,
    parent,
    seenDone: false,
    heapUseds: null,
    durations: [],
    status: null,
    options: options,
  };
}

export function makeRunResult(
  describeBlock: Intendant.DescribeBlock,
  unhandledErrors: Error[]
): Intendant.RunResult {
  return {
    benchResults: makeBenchResults(describeBlock),
    unhandledErrors: unhandledErrors.map(_getError),
  }
}

function makeBenchResults(
  describeBlock: Intendant.DescribeBlock,
): Cofferer.BenchResults {
  const benchResults: Cofferer.BenchResults = [];

  for (const child of describeBlock.children) {
    switch (child.type) {
      case 'describeBlock': {
        benchResults.push(...makeBenchResults(child));
        break;
      }
      case 'bench': {
        benchResults.push(makeSingleBenchResult(child));
        break;
      }
    }
  }

  return benchResults;
}

export function makeSingleBenchResult(
  bench: Intendant.BenchEntry,
): Cofferer.BenchResult {
  const benchPath = [];
  let parent: Intendant.BenchEntry | Intendant.DescribeBlock | undefined = bench;

  const {status} = bench;
  invariant(status, 'Status should be present after benches are run.');

  do {
    benchPath.unshift(parent.name);
  } while ((parent = parent.parent));

  return {
    durationsMs: bench.durations,
    heapUsedSizes: bench.heapUseds,
    status,
    benchPath: Array.from(benchPath),
    benchOptions: bench.options,
  };
}

function _getError(
  errors?: Cofferer.Exception | [Cofferer.Exception | undefined, Cofferer.Exception],
): Error {
  let error;
  let asyncError;

  if (Array.isArray(errors)) {
    error = errors[0];
    asyncError = errors[1];
  } else {
    error = errors;
    asyncError = new Error();
  }

  if (error && (typeof error.stack === 'string' || error.message)) {
    return error;
  }

  asyncError.message = `thrown: ${prettyFormat(error, {maxDepth: 3})}`;

  return asyncError;
}

// function getErrorStack(error: Error): string {
//   return typeof error.stack === 'string' ? error.stack : error.message;
// }

type DescribeHooks = {
  beforeAll: Intendant.Hook[];
  afterAll: Intendant.Hook[];
};

export function getAllHooksForDescribe(
  describe: Intendant.DescribeBlock,
): DescribeHooks {
  const result: DescribeHooks = {
    afterAll: [],
    beforeAll: [],
  };

  if (hasEnabledBench(describe)) {
    for (const hook of describe.hooks) {
      switch (hook.type) {
        case 'beforeAll':
          result.beforeAll.push(hook);
          break;
        case 'afterAll':
          result.afterAll.push(hook);
          break;
      }
    }
  }

  return result;
}

// Traverse the tree of describe blocks and return true if at least one describe
// block has an enabled bench.
function hasEnabledBench(describeBlock: Intendant.DescribeBlock): boolean {
  const {hasFocusedBenches, benchNamePattern} = getState();
  return describeBlock.children.some(child =>
    child.type === 'describeBlock'
      ? hasEnabledBench(child)
      : !(
        child.mode === 'skip' ||
        (hasFocusedBenches && child.mode !== 'only') ||
        (benchNamePattern && !benchNamePattern.test(getBenchID(child)))
      ),
  );
}

// Return a string that identifies the bench (concat of parent describe block
// names + bench title)
export function getBenchID(bench: Intendant.BenchEntry): string {
  const titles = getBenchIDArray(bench);
  return titles.join(':');
}

// Return a string that identifies the bench (concat of parent describe block
// names + bench title)
function getBenchIDArray(bench: Intendant.BenchEntry): string[] {
  const titles = [];
  let parent: Intendant.BenchEntry | Intendant.DescribeBlock | undefined = bench;
  do {
    titles.unshift(parent.name);
  } while ((parent = parent.parent));
  // titles.shift(); // remove TOP_DESCRIBE_BLOCK_NAME
  return titles;
}

export function callAsyncIntendantFn(
  benchOrHook: Intendant.BenchEntry | Intendant.Hook,
  benchContext: Intendant.BenchContext | undefined,
  {isHook, timeout}: {isHook: boolean; timeout: number},
): Promise<unknown> {
  let timeoutID: NodeJS.Timeout;
  let completed = false;

  const {fn, asyncError} = benchOrHook;

  return new Promise<void>((resolve, reject) => {
    timeoutID = setTimeout(
      () => reject(_makeTimeoutMessage(timeout, isHook)),
      timeout,
    );

    // If this fn accepts `done` callback we return a promise that fulfills as
    // soon as `done` called.
    if (takesDoneCallback(fn)) {
      let returnedValue: unknown = undefined;

      const done = (reason?: Error | string): void => {
        // We need to keep a stack here before the promise tick
        const errorAtDone = new ErrorWithStack(undefined, done);

        if (!completed && benchOrHook.seenDone) {
          errorAtDone.message =
            'Expected done to be called once, but it was called multiple times.';

          if (reason) {
            errorAtDone.message +=
              ' Reason: ' + prettyFormat(reason, {maxDepth: 3});
          }
          reject(errorAtDone);
          throw errorAtDone;
        } else {
          benchOrHook.seenDone = true;
        }

        // Use `Promise.resolve` to allow the event loop to go a single tick in case `done` is called synchronously
        Promise.resolve().then(() => {
          if (returnedValue !== undefined) {
            asyncError.message = dedent`
      Test functions cannot both take a 'done' callback and return something. Either use a 'done' callback, or return a promise.
      Returned value: ${prettyFormat(returnedValue, {maxDepth: 3})}
      `;
            return reject(asyncError);
          }

          let errorAsErrorObject: Error;
          if (checkIsError(reason)) {
            errorAsErrorObject = reason;
          } else {
            errorAsErrorObject = errorAtDone;
            errorAtDone.message = `Failed: ${prettyFormat(reason, {
              maxDepth: 3,
            })}`;
          }

          // Consider always throwing, regardless if `reason` is set or not
          if (completed && reason) {
            errorAsErrorObject.message =
              'Caught error after test environment was torn down\n\n' +
              errorAsErrorObject.message;

            throw errorAsErrorObject;
          }

          return reason ? reject(errorAsErrorObject) : resolve();
        });
      };
      returnedValue = fn.call(benchContext, done);
      return;
    }

    let returnedValue: Intendant.BenchReturnValue;

    try {
      returnedValue = (fn as any).call(benchContext);
    } catch (error) {
      reject(error);
      return;
    }

    // If it's a Promise, return it. Test for an object with a `then` function
    // to support custom Promise implementations.
    if (
      typeof returnedValue === 'object' &&
      returnedValue !== null &&
      typeof returnedValue.then === 'function'
    ) {
      returnedValue.then(() => resolve(), reject);
      return;
    }

    if (!isHook && returnedValue !== undefined) {
      reject(
        new Error(
          dedent`
      test functions can only return Promise or undefined.
      Returned value: ${prettyFormat(returnedValue, {maxDepth: 3})}
      `,
        ),
      );
      return;
    }

    // Otherwise this test is synchronous, and if it didn't throw it means
    // it passed.
    resolve();
  })
    .then(() => {
      completed = true;
      // If timeout is not cleared/unrefed the node process won't exit until
      // it's resolved.
      timeoutID.unref?.();
      clearTimeout(timeoutID);
    })
    .catch(error => {
      completed = true;
      timeoutID.unref?.();
      clearTimeout(timeoutID);
      throw error;
    });
}

export function callAsyncIntendantBenchFn(
  benchOrHook: Intendant.BenchEntry,
  benchContext: Intendant.BenchContext | undefined,
  {isHook, timeout}: {isHook: boolean; timeout: number},
): Promise<unknown> {
  let timeoutID: NodeJS.Timeout;

  const {fn} = benchOrHook;

  return new Promise<void>(async (resolve, reject) => {
    timeoutID = setTimeout(
      () => reject(_makeTimeoutMessage(timeout, isHook)),
      timeout,
    );
    let initialHeapSize: number | null = null;
    try {
      // Heap Snapshotting
      if (benchOrHook.options.snapshotHeap) {
        global.gc!();
        const idArray = getBenchIDArray(benchOrHook);
        const dirName = path.dirname(idArray[0] as string);
        const filename = path.basename(idArray[0] as string);
        const snapshotFilename = `${benchOrHook.options.snapshotOutputDirectory ?? dirName}/${filename}:${getBenchIDArray(benchOrHook).slice(1).join(':').replaceAll(' ', '_')}:${0}.heapsnapshot`;
        v8.writeHeapSnapshot(snapshotFilename);
      }

      // Memory Profiling
      if (benchOrHook.options.profileMemory) {
        global.gc!();
        initialHeapSize = v8.getHeapStatistics().used_heap_size;
      }
      for (const iter of range(1, benchOrHook.options.iterations)) {
        const startTime = performance.now();
        const result = (fn as any).call(benchContext);
        if (isPromise(result)) {
          await result;
        }
        benchOrHook.durations.push(performance.now() - startTime);
        // Memory Profiling
        if (benchOrHook.options.profileMemory) {
          if (!Array.isArray(benchOrHook.heapUseds)) {
            benchOrHook.heapUseds = [];
          }
          const currentHeapSize = v8.getHeapStatistics().used_heap_size;
          benchOrHook.heapUseds!.push(currentHeapSize - initialHeapSize!);
        }

        // Heap Snapshotting
        if (benchOrHook.options.snapshotHeap) {
          const idArray = getBenchIDArray(benchOrHook);
          const dirName = path.dirname(idArray[0] as string);
          const filename = path.basename(idArray[0] as string);
          const snapshotFilename = `${benchOrHook.options.snapshotOutputDirectory ?? dirName}/${filename}:${getBenchIDArray(benchOrHook).slice(1).join(':').replaceAll(' ', '_')}:${iter}.heapsnapshot`;
          v8.writeHeapSnapshot(snapshotFilename);
        }

        // Garabage collect to clear any profiling or snapshotting memory
        if (benchOrHook.options.profileMemory || benchOrHook.options.snapshotHeap) {
          global.gc!();
        }
      }
      resolve();
    } catch (err) {
      reject(err);
    }
  })
  .then(() => {
    // If timeout is not cleared/unrefed the node process won't exit until
    // it's resolved.
    timeoutID.unref?.();
    clearTimeout(timeoutID);
  })
  .catch(error => {
      timeoutID.unref?.();
      clearTimeout(timeoutID);
      throw error;
    });
}

type BenchHooks = {
  beforeEach: Intendant.Hook[];
  afterEach: Intendant.Hook[];
};

export function getEachHooksForBench(test: Intendant.BenchEntry): BenchHooks {
  const result: BenchHooks = {afterEach: [], beforeEach: []};
  let block: Intendant.DescribeBlock | undefined | null = test.parent;

  do {
    const beforeEachForCurrentBlock = [];
    for (const hook of block.hooks) {
      switch (hook.type) {
        case 'beforeEach':
          beforeEachForCurrentBlock.push(hook);
          break;
        case 'afterEach':
          result.afterEach.push(hook);
          break;
      }
    }
    // 'beforeEach' hooks are executed from top to bottom, the opposite of the
    // way we traversed it.
    result.beforeEach = [...beforeEachForCurrentBlock, ...result.beforeEach];
  } while ((block = block.parent));
  return result;
}

function _makeTimeoutMessage(timeout: number, isHook: boolean) {
  return `Exceeded timeout of ${formatTime(timeout)} for a ${
    isHook ? 'hook' : 'bench'
  }.\nUse cofferer.setTimeout(newTimeout) to increase the timeout value, if this is a long-running bench.`;
}


function checkIsError(error: unknown): error is Error {
  return !!(error && (error as Error).message && (error as Error).stack);
}

export const addErrorToEachBenchUnderDescribe = (
  describeBlock: Intendant.DescribeBlock,
  error: Cofferer.Exception,
  asyncError: Cofferer.Exception,
): void => {
  for (const child of describeBlock.children) {
    switch (child.type) {
      case 'describeBlock':
        addErrorToEachBenchUnderDescribe(child, error, asyncError);
        break;
      case 'bench':
        child.errors.push(...[error, asyncError]);
        break;
    }
  }
};

export function range(start: number, end: number) {
  return Array(end - start + 1).fill(0).map((_, idx) => start + idx)
}
