import type * as types from './types';
import {dispatch, getState} from './state';
import {callAsyncIntendantFn, getAllHooksForDescribe, getBenchID, getEachHooksForBench, makeRunResult} from './utils';
import invariant from "ts-invariant";

export async function run(): Promise<types.RunResult> {
  const {rootDescribeBlock} = getState();
  await dispatch({name: 'start_run'});
  await _runBenchesForDescribeBlock(rootDescribeBlock);
  await dispatch({name: 'finish_run'});
  return makeRunResult(
    getState().rootDescribeBlock,
    getState().unhandledErrors,
  );
}

const _runBenchesForDescribeBlock = async (
  describeBlock: types.DescribeBlock,
) => {
  await dispatch({describeBlock, name: 'start_run_describe'});
  const {beforeAll, afterAll} = getAllHooksForDescribe(describeBlock);

  const isSkipped = describeBlock.mode === 'skip';

  if (!isSkipped) {
    for (const hook of beforeAll) {
      await _callIntendantHook({describeBlock, hook});
    }
  }

  for (const child of describeBlock.children) {
    switch (child.type) {
      case 'describeBlock': {
        await _runBenchesForDescribeBlock(child);
        break;
      }
      case 'bench': {
        await _runBench(child, isSkipped);
        break;
      }
    }
  }

  if (!isSkipped) {
    for (const hook of afterAll) {
      await _callIntendantHook({describeBlock, hook});
    }
  }

  await dispatch({describeBlock, name: 'finish_run_describe'});
};

async function _runBench(
  bench: types.BenchEntry,
  parentSkipped: boolean,
): Promise<void> {
  await dispatch({name: 'bench_start', test: bench});
  const benchContext = Object.create(null);
  const {hasFocusedBenches, benchNamePattern} = getState();

  const isSkipped =
    parentSkipped ||
    bench.mode === 'skip' ||
    (hasFocusedBenches && bench.mode !== 'only') ||
    (benchNamePattern && !benchNamePattern.test(getBenchID(bench)));

  if (isSkipped) {
    await dispatch({name: 'bench_skip', test: bench});
    return;
  }

  if (bench.mode === 'todo') {
    await dispatch({name: 'bench_todo', test: bench});
    return;
  }

  const {afterEach, beforeEach} = getEachHooksForBench(bench);

  for (const hook of beforeEach) {
    if (bench.errors.length) {
      // If any of the before hooks failed already, we don't run any
      // hooks after that.
      break;
    }
    await _callIntendantHook ({hook, bench: bench, benchContext: testContext});
  }

  await _callIntendantBench(bench, benchContext);

  for (const hook of afterEach) {
    await _callIntendantHook({hook, bench: bench, benchContext: testContext});
  }

  // `afterAll` hooks should not affect test status (pass or fail), because if
  // we had a global `afterAll` hook it would block all existing tests until
  // this hook is executed. So we dispatch `test_done` right away.
  await dispatch({name: 'bench_done', test: bench});
}

async function _callIntendantHook({
 hook,
 bench,
 describeBlock,
 benchContext,
}: {
  hook: types.Hook;
  describeBlock?: types.DescribeBlock;
  bench?: types.BenchEntry;
  benchContext?: types.BenchContext;
}): Promise<void> {
  await dispatch({hook, name: 'hook_start'});
  const timeout = hook.timeout ?? getState().benchTimeout;

  try {
    await callAsyncIntendantFn(hook, benchContext, {
      isHook: true,
      timeout,
    });
    await dispatch({describeBlock, hook, name: 'hook_success', bench: bench});
  } catch (error) {
    await dispatch({describeBlock, error, hook, name: 'hook_failure', bench: bench});
  }
}

async function _callIntendantBench(
  bench: types.BenchEntry,
  benchContext: types.BenchContext,
): Promise<void> {
  await dispatch({name: 'bench_fn_start', test: bench});
  const timeout = bench.options?.timeout ?? getState().benchTimeout;
  invariant(bench.fn, `Tests with no 'fn' should have 'mode' set to 'skipped'`);

  if (bench.errors.length) {
    return; // We don't run the test if there's already an error in before hooks.
  }

  await callAsyncIntendantFn(bench, benchContext, {
    isHook: false,
    timeout,
  });
  await dispatch({name: 'bench_fn_success', test: bench});
}
