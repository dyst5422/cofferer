import type * as types from './types';
import {format as prettyFormat} from 'pretty-format';
import invariant from 'ts-invariant';
import {dispatch, dispatchSync, getState} from './state';
import dedent from 'dedent';
import co from 'co';
import {ErrorWithStack, formatTime} from 'jest-util';
import isGeneratorFunction from 'is-generator-fn';
import v8 from 'v8';

export const DEFAULT_BENCH_OPTIONS: types.BenchOptions = {
  timeout: 60000,
  iterations: 10,
  profileDuration: true,
  profileMemory: true,
}

function takesDoneCallback(fn: types.AsyncFn): fn is types.DoneTakingBenchFn {
  return fn.length > 0;
}

export function makeDescribe(
  name: types.BlockName,
  parent?: types.DescribeBlock,
  mode?: types.BlockMode,
): types.DescribeBlock {
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
  describe: types.DescribeBlock,
): boolean {
  return describe.children.some(
    child => child.type === 'bench' || describeBlockHasBenches(child),
  );
}

export function makeBench(
  fn: types.BenchFn,
  mode: types.BenchMode,
  name: types.BenchName,
  parent: types.DescribeBlock,
  options: Partial<types.BenchOptions> | null,
  asyncError: types.Exception,
): types.BenchEntry {
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
    options: {...DEFAULT_BENCH_OPTIONS, ...options},
  };
}

export function makeRunResult(
  describeBlock: types.DescribeBlock,
  unhandledErrors: Error[]
): types.RunResult {
  return {
    benchResults: makeBenchResults(describeBlock),
    unhandledErrors: unhandledErrors.map(_getError).map(getErrorStack),
  }
}

function makeBenchResults(
  describeBlock: types.DescribeBlock,
): types.BenchResults {
  const benchResults: types.BenchResults = [];

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
  bench: types.BenchEntry,
): types.BenchResult {
  const benchPath = [];
  let parent: types.BenchEntry | types.DescribeBlock | undefined = bench;

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
  };
}

function _getError(
  errors?: types.Exception | [types.Exception | undefined, types.Exception],
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

function getErrorStack(error: Error): string {
  return typeof error.stack === 'string' ? error.stack : error.message;
}

type DescribeHooks = {
  beforeAll: types.Hook[];
  afterAll: types.Hook[];
};

export function getAllHooksForDescribe(
  describe: types.DescribeBlock,
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
function hasEnabledBench(describeBlock: types.DescribeBlock): boolean {
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
export function getBenchID(bench: types.BenchEntry): string {
  const titles = [];
  let parent: types.BenchEntry | types.DescribeBlock | undefined = bench;
  do {
    titles.unshift(parent.name);
  } while ((parent = parent.parent));

  titles.shift(); // remove TOP_DESCRIBE_BLOCK_NAME
  return titles.join(' ');
}

export function callAsyncIntendantFn(
  benchOrHook: types.BenchEntry | types.Hook,
  benchContext: types.BenchContext | undefined,
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

    let returnedValue: types.BenchReturnValue;
    if (isGeneratorFunction(fn)) {
      returnedValue = co.wrap(fn).call({});
    } else {
      try {
        returnedValue = (fn as any).call(benchContext);
      } catch (error) {
        reject(error);
        return;
      }
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
  benchOrHook: types.BenchEntry | types.Hook,
  benchContext: types.BenchContext | undefined,
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

      if (benchOrHook.type === 'bench') {
        let initialHeapSize: number | null = null;
        if (benchOrHook.options.profileMemory) {
          global.gc!();
          initialHeapSize = v8.getHeapStatistics().used_heap_size;
        }
        for (const _iter of range(1, benchOrHook.options.iterations)) {
          global.gc!();
          const startTime = performance.now();
          returnedValue = fn.call(benchContext, done);
          benchOrHook.durations.push(performance.now() - startTime);
          if (benchOrHook.options.profileMemory) {
            if (!Array.isArray(benchOrHook.heapUseds)) {
              benchOrHook.heapUseds = [];
            }
            benchOrHook.heapUseds!.push(v8.getHeapStatistics().used_heap_size - initialHeapSize!);
          }
        }
      } else {
        returnedValue = fn.call(benchContext, done);
      }

      return;
    }

    let returnedValue: types.BenchReturnValue;
    if (isGeneratorFunction(fn)) {
      if (benchOrHook.type === 'bench') {
        let initialHeapSize: number | null = null;
        if (benchOrHook.options.profileMemory) {
          global.gc!();
          initialHeapSize = v8.getHeapStatistics().used_heap_size;
        }
        for (const _iter of range(1, benchOrHook.options.iterations)) {
          global.gc!();
          const startTime = performance.now();
          returnedValue = co.wrap(fn).call({});
          benchOrHook.durations.push(performance.now() - startTime);
          if (benchOrHook.options.profileMemory) {
            if (!Array.isArray(benchOrHook.heapUseds)) {
              benchOrHook.heapUseds = [];
            }
            benchOrHook.heapUseds!.push(v8.getHeapStatistics().used_heap_size - initialHeapSize!);
          }
        }
      } else {
        returnedValue = co.wrap(fn).call({});
      }

    } else {
      try {
        if (benchOrHook.type === 'bench') {
          let initialHeapSize: number | null = null;
          if (benchOrHook.options.profileMemory) {
            global.gc!();
            initialHeapSize = v8.getHeapStatistics().used_heap_size;
          }
          for (const _iter of range(1, benchOrHook.options.iterations)) {
            global.gc!();
            const startTime = performance.now();
            returnedValue = (fn as any).call(benchContext);
            benchOrHook.durations.push(performance.now() - startTime);
            if (benchOrHook.options.profileMemory) {
              if (!Array.isArray(benchOrHook.heapUseds)) {
                benchOrHook.heapUseds = [];
              }
              benchOrHook.heapUseds!.push(v8.getHeapStatistics().used_heap_size - initialHeapSize!);
            }
          }
        } else {
          returnedValue = (fn as any).call(benchContext);
        }
        returnedValue = (fn as any).call(benchContext);
      } catch (error) {
        reject(error);
        return;
      }
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
      bench functions can only return Promise or undefined.
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

type BenchHooks = {
  beforeEach: types.Hook[];
  afterEach: types.Hook[];
};

export function getEachHooksForBench(test: types.BenchEntry): BenchHooks {
  const result: BenchHooks = {afterEach: [], beforeEach: []};
  let block: types.DescribeBlock | undefined | null = test.parent;

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
  describeBlock: types.DescribeBlock,
  error: types.Exception,
  asyncError: types.Exception,
): void => {
  for (const child of describeBlock.children) {
    switch (child.type) {
      case 'describeBlock':
        addErrorToEachBenchUnderDescribe(child, error, asyncError);
        break;
      case 'bench':
        child.errors.push([error, asyncError]);
        break;
    }
  }
};

export function range(start: number, end: number) {
  return Array(end - start + 1).fill(0).map((_, idx) => start + idx)
}
