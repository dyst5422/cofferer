import type * as types from './types';
import {eventHandler} from './eventHandler';
import {DEFAULT_BENCH_OPTIONS, makeDescribe} from "./utils";

// @ts-ignore
let __globalState: types.State;

const eventHandlers: types.EventHandler[] = [
  eventHandler,
];
export const ROOT_DESCRIBE_BLOCK_NAME = 'ROOT_DESCRIBE_BLOCK';

function createState(): types.State {
   const ROOT_DESCRIBE_BLOCK = makeDescribe(ROOT_DESCRIBE_BLOCK_NAME);
   return {
     rootDescribeBlock: ROOT_DESCRIBE_BLOCK,
     currentDescribeBlock: ROOT_DESCRIBE_BLOCK,
     currentlyRunningBench: null,
     hasFocusedBenches: false,
     unhandledErrors: [],
     hasStarted: false,
     benchTimeout: DEFAULT_BENCH_OPTIONS.timeout,
     parentProcess: null,
   };
}
export function getState(): types.State {
  return __globalState;
}
export function setState(state: types.State): types.State {
  __globalState = state;
  return __globalState;
}
export function resetState(): void {
  setState(createState());
}
resetState();
export async function dispatch(event: types.Events): Promise<void> {
  for (const handler of eventHandlers) {
    await handler(event, getState());
  }
}
export function dispatchSync(event: types.Events): void {
  for (const handler of eventHandlers) {
    handler(event, getState());
  }
}
export function addEventHandler(handler: types.EventHandler): void {
  eventHandlers.push(handler);
}
