import type * as Intendant from './types'
import {
  addErrorToEachBenchUnderDescribe,
  describeBlockHasBenches,
  makeBench,
  makeDescribe
} from './utils';
import invariant from 'ts-invariant';
import {injectGlobalErrorHandlers, restoreGlobalErrorHandlers} from './globalErrorHandlers';

export function eventHandler(event: Intendant.Events, state: Intendant.State): void {

  switch(event.name) {
    case 'run_start': {
      state.hasStarted = true;
      break;
    }
    case 'run_finish': {
      break;
    }
    case 'start_describe_definition': {
      const {blockName, mode} = event;
      const {currentDescribeBlock, currentlyRunningBench} = state;

      if (currentlyRunningBench) {
        currentlyRunningBench.errors.push(
          new Error(
            `Cannot nest a describe inside a bench. Describe block "${blockName}" cannot run because it is nested within "${currentlyRunningBench.name}".`,
          ),
        );
        break;
      }

      const describeBlock = makeDescribe(blockName, currentDescribeBlock, mode);
      currentDescribeBlock.children.push(describeBlock);
      state.currentDescribeBlock = describeBlock;
      break;
    }
    case 'finish_describe_definition': {
      const {currentDescribeBlock} = state;
      invariant(currentDescribeBlock, `currentDescribeBlock must be there`);

      if (!describeBlockHasBenches(currentDescribeBlock)) {
        currentDescribeBlock.hooks.forEach(hook => {
          hook.asyncError.message = `Invalid: ${hook.type}() may not be used in a describe block containing no benches.`;
          state.unhandledErrors.push(hook.asyncError);
        });
      }

      // pass mode of currentDescribeBlock to tests
      // but do not when there is already a single test with "only" mode
      const shouldPassMode = !(
        currentDescribeBlock.mode === 'only' &&
        currentDescribeBlock.children.some(
          child => child.type === 'bench' && child.mode === 'only',
        )
      );
      if (shouldPassMode) {
        currentDescribeBlock.children.forEach(child => {
          if (child.type === 'bench' && !child.mode) {
            child.mode = currentDescribeBlock.mode;
          }
        });
      }
      if (
        !state.hasFocusedBenches &&
        currentDescribeBlock.mode !== 'skip' &&
        currentDescribeBlock.children.some(
          child => child.type === 'bench' && child.mode === 'only',
        )
      ) {
        state.hasFocusedBenches = true;
      }

      if (currentDescribeBlock.parent) {
        state.currentDescribeBlock = currentDescribeBlock.parent;
      }
      break;
    }
    case 'add_hook': {
      const {currentDescribeBlock, currentlyRunningBench, hasStarted, benchOptions} = state;
      const {asyncError, fn, hookType: type, options} = event;

      if (currentlyRunningBench) {
        currentlyRunningBench.errors.push(
          new Error(
            `Hooks cannot be defined inside tests. Hook of type "${type}" is nested within "${currentlyRunningBench.name}".`,
          ),
        );
        break;
      } else if (hasStarted) {
        state.unhandledErrors.push(
          new Error(
            'Cannot add a hook after tests have started running. Hooks must be defined synchronously.',
          ),
        );
        break;
      }
      const parent = currentDescribeBlock;

      currentDescribeBlock.hooks.push({
        asyncError,
        fn,
        parent,
        seenDone: false,
        benchOptions: {...benchOptions, ...options},
        type,
      });
      break;
    }
    case 'add_bench': {
      const {currentDescribeBlock, currentlyRunningBench, hasStarted, benchOptions} = state;
      const {asyncError, fn, mode, benchName, options} = event;

      if (currentlyRunningBench) {
        currentlyRunningBench.errors.push(
          new Error(`Benches cannot be nested. Bench "${benchName}" cannot run because it is nested within "${currentlyRunningBench.name}".`)
        );
        break;
      } else if (hasStarted) {
        state.unhandledErrors.push(
          new Error(
            'Cannot add a bench after benches have started running. Benches must be defined synchronously.',
          ),
        );
        break;
      }

      const bench = makeBench(
        fn,
        mode,
        benchName,
        currentDescribeBlock,
        {...benchOptions, ...options},
        asyncError,
      );
      if (currentDescribeBlock.mode === 'skip' && bench.mode === 'only') {
        state.hasFocusedBenches = true;
      }
      currentDescribeBlock.children.push(bench);
      break;
    }
    case 'hook_start': {
      event.hook.seenDone = false;
      break;
    }
    case 'hook_failure': {
      const {bench, describeBlock, error, hook} = event;
      const {asyncError, type} = hook;

      if (type === 'beforeAll') {
        invariant(describeBlock, 'always present for `*All` hooks');
        addErrorToEachBenchUnderDescribe(describeBlock, error, asyncError);
      } else if (type === 'afterAll') {
        // Attaching `afterAll` errors to each test makes execution flow
        // too complicated, so we'll consider them to be global.
        state.unhandledErrors.push(...[error, asyncError]);
      } else {
        invariant(bench, 'always present for `*Each` hooks');
        bench.errors.push([error, asyncError]);
      }
      break;
    }
    case 'bench_skip': {
      event.bench.status = 'skip';
      break;
    }
    case 'bench_todo': {
      event.bench.status = 'todo';
      break;
    }
    case 'bench_done': {
      event.bench.status = 'done';
      state.currentlyRunningBench = null;
      break;
    }
    case 'bench_start': {
      state.currentlyRunningBench = event.bench;
      event.bench.invocations += 1;
      break;
    }
    case 'bench_fn_start': {
      event.bench.seenDone = false;
      break;
    }
    case 'bench_fn_failure': {
      event.bench.errors.push([event.error, event.bench.asyncError]);
      break;
    }
    case 'setup': {
      // Uncaught exception handlers should be defined on the parent process
      // object. If defined on the VM's process object they just no op and let
      // the parent process crash. It might make sense to return a `dispatch`
      // function to the parent process and register handlers there instead, but
      // i'm not sure if this is works. For now i just replicated whatever
      // jasmine was doing -- dabramov
      state.parentProcess = event.parentProcess;
      invariant(state.parentProcess);
      state.originalGlobalErrorHandlers = injectGlobalErrorHandlers(
        state.parentProcess,
      );
      if (event.testNamePattern) {
        state.benchNamePattern = new RegExp(event.benchNamePattern, 'i');
      }
      break;
    }
    case 'teardown': {
      invariant(state.originalGlobalErrorHandlers);
      invariant(state.parentProcess);
      restoreGlobalErrorHandlers(
        state.parentProcess,
        state.originalGlobalErrorHandlers,
      );
      break;
    }
    case 'error': {
      // It's very likely for long-running async benches to throw errors. In this
      // case we want to catch them and fail the current bench. At the same time
      // there's a possibility that one bench sets a long timeout, that will
      // eventually throw after this bench finishes but during some other bench
      // execution, which will result in one bench's error failing another bench.
      // In any way, it should be possible to track where the error was thrown
      // from.
      state.currentlyRunningBench
        ? state.currentlyRunningBench.errors.push(event.error)
        : state.unhandledErrors.push(event.error);
      break;
    }
  }
}
