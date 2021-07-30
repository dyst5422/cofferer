import type * as types from './types';
import {dispatchSync} from './state';
import {ErrorWithStack, isPromise} from 'jest-util';
export {run} from './run';
export{resetState} from './state';

type THook = (fn: types.HookFn, timeout?: number) => void;
export function describe(blockName: types.BlockName, blockFn: types.BlockFn): void {
  _dispatchDescribe(blockFn, blockName, describe)
}
function describeOnly(blockName: types.BlockName, blockFn: types.BlockFn): void {
  _dispatchDescribe(blockFn, blockName, describeOnly, 'only')
}
function describeSkip(blockName: types.BlockName, blockFn: types.BlockFn): void {
  _dispatchDescribe(blockFn, blockName, describeSkip, 'skip')
}

describe.only = describeOnly;
describe.skip = describeSkip;

function _dispatchDescribe(
  blockFn: types.BlockFn,
  blockName: types.BlockName,
  describeFn: types.DescribeFn,
  mode?: types.BlockMode,
) {
  const asyncError = new ErrorWithStack(undefined, describeFn);
  if (blockFn === undefined) {
    asyncError.message = `Missing second argument. It must be a callback function.`;
    throw asyncError;
  }
  if (typeof blockFn !== 'function') {
    asyncError.message = `Invalid second argument, ${blockFn}. It must be a callback function.`;
    throw asyncError;
  }
  dispatchSync({
    asyncError,
    blockName,
    mode,
    name: 'start_describe_definition',
  });
  const describeReturn = blockFn();

  if (isPromise(describeReturn)) {
    throw new ErrorWithStack(
      'Returning a Promise from "describe" is not supported. Benches must be defined synchronously.',
      describeFn,
    );
  } else if (describeReturn !== undefined) {
    throw new ErrorWithStack(
      'A "describe" callback must not return a value.',
      describeFn,
    );
  }

  dispatchSync({blockName, mode, name: 'finish_describe_definition'});
}

const _addHook = (
  fn: types.HookFn,
  hookType: types.HookType,
  hookFn: THook,
  timeout?: number,
) => {
  const asyncError = new ErrorWithStack(undefined, hookFn);

  if (typeof fn !== 'function') {
    asyncError.message =
      'Invalid first argument. It must be a callback function.';

    throw asyncError;
  }

  dispatchSync({asyncError, fn, hookType, name: 'add_hook', timeout});
};

// Hooks have to pass themselves to the HOF in order for us to trim stack traces.
export const beforeEach: THook = (fn, timeout) =>
  _addHook(fn, 'beforeEach', beforeEach, timeout);
export const beforeAll: THook = (fn, timeout) =>
  _addHook(fn, 'beforeAll', beforeAll, timeout);
export const afterEach: THook = (fn, timeout) =>
  _addHook(fn, 'afterEach', afterEach, timeout);
export const afterAll: THook = (fn, timeout) =>
  _addHook(fn, 'afterAll', afterAll, timeout);

export function bench(
  benchName: types.BenchName,
  fn: types.BenchFn,
  options?: Partial<types.BenchOptions> | null,
): void {
  _addBench(benchName, undefined, fn, bench, options);
}

function benchSkip(
  benchName: types.BenchName,
  fn?: types.BenchFn,
  options?: Partial<types.BenchOptions> | null,
): void {
  _addBench(benchName, 'skip', fn, benchSkip, options);
}

function benchOnly(
  benchName: types.BenchName,
  fn?: types.BenchFn,
  options?: Partial<types.BenchOptions> | null,
): void {
  _addBench(benchName, 'only', fn, benchOnly, options);
}

function benchTodo(
  benchName: types.BenchName,
  ...rest: any[]
) {
  if (rest.length > 0 || typeof benchName !== 'string') {
    throw new ErrorWithStack(
      'Todo must be called with only a description.',
      benchTodo,
    );
  }
  return _addBench(benchName, 'todo', () => {}, benchTodo);
}

bench.skip = benchSkip;
bench.only = benchOnly;
bench.todo = benchTodo;


function _addBench(
  benchName: types.BenchName,
  mode: types.BenchMode,
  fn: types.BenchFn | undefined,
  benchFn: (
    benchName: types.BenchName,
    fn: types.BenchFn,
    options?: Partial<types.BenchOptions>,
  ) => void,
  options?: Partial<types.BenchOptions> | null,
) {
  const asyncError = new ErrorWithStack(undefined, benchFn);

  if (typeof benchName !== 'string') {
    asyncError.message = `Invalid first argument, ${benchName}. It must be a string.`;
    throw asyncError;
  }
  if (fn === undefined) {
    asyncError.message = 'Missing second argument. It must be a callback function. Perhaps you want to use `bench.todo` for a bench placeholder.';
    throw asyncError;
  }
  if (typeof fn !== 'function') {
    asyncError.message = `Invalid second argument, ${fn}. It must be a callback function.`;
    throw asyncError;
  }
  return dispatchSync({
    asyncError,
    fn,
    name: 'add_bench',
    mode,
    benchName,
    options,
  });
}
