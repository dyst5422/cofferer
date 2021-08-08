import type * as Intendant from './types';
import type * as Cofferer from '../types';
import {dispatch, getState} from './state';
import {
  callAsyncIntendantBenchFn,
  callAsyncIntendantFn,
  getAllHooksForDescribe,
  getBenchID,
  getEachHooksForBench,
  makeRunResult
} from './utils';
import invariant from "ts-invariant";

export async function run(): Promise<Cofferer.RunResult> {
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
  describeBlock: Intendant.DescribeBlock,
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
  bench: Intendant.BenchEntry,
  parentSkipped: boolean,
): Promise<void> {
  await dispatch({name: 'bench_start', bench: bench});
  const benchContext = Object.create(null);
  const {hasFocusedBenches, benchNamePattern} = getState();

  const isSkipped =
    parentSkipped ||
    bench.mode === 'skip' ||
    (hasFocusedBenches && bench.mode !== 'only') ||
    (benchNamePattern && !benchNamePattern.test(getBenchID(bench)));

  if (isSkipped) {
    await dispatch({name: 'bench_skip', bench: bench});
    return;
  }

  if (bench.mode === 'todo') {
    await dispatch({name: 'bench_todo', bench: bench});
    return;
  }

  const {afterEach, beforeEach} = getEachHooksForBench(bench);

  for (const hook of beforeEach) {
    if (bench.errors.length) {
      // If any of the before hooks failed already, we don't run any
      // hooks after that.
      break;
    }
    await _callIntendantHook ({hook, bench: bench, benchContext: benchContext});
  }

  await _callIntendantBench(bench, benchContext);

  for (const hook of afterEach) {
    await _callIntendantHook({hook, bench: bench, benchContext: benchContext});
  }

  // `afterAll` hooks should not affect bench status (pass or fail), because if
  // we had a global `afterAll` hook it would block all existing benches until
  // this hook is executed. So we dispatch `bench_done` right away.
  await dispatch({name: 'bench_done', bench: bench});
}

async function _callIntendantHook({
 hook,
 bench,
 describeBlock,
 benchContext,
}: {
  hook: Intendant.Hook;
  describeBlock?: Intendant.DescribeBlock;
  bench?: Intendant.BenchEntry;
  benchContext?: Intendant.BenchContext;
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
  bench: Intendant.BenchEntry,
  benchContext: Intendant.BenchContext,
): Promise<void> {
  await dispatch({name: 'bench_fn_start', bench: bench});
  const timeout = bench.options?.timeout ?? getState().benchTimeout;
  invariant(bench.fn, `Benches with no 'fn' should have 'mode' set to 'skipped'`);

  if (bench.errors.length) {
    return; // We don't run the bench if there's already an error in before hooks.
  }

  await callAsyncIntendantBenchFn(bench, benchContext, {
    isHook: false,
    timeout,
  });
  await dispatch({name: 'bench_fn_success', bench: bench});
}
