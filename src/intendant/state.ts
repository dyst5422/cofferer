import type * as Intendant from './types';
import {eventHandler} from './eventHandler';
import {DEFAULT_BENCH_OPTIONS, makeDescribe} from "./utils";

// @ts-ignore
let __globalState: Intendant.State;

const eventHandlers: Intendant.EventHandler[] = [
  eventHandler,
];

function createState(benchFilename: string): Intendant.State {
   const ROOT_DESCRIBE_BLOCK = makeDescribe(benchFilename);
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
export function getState(): Intendant.State {
  return __globalState;
}
export function setState(state: Intendant.State): Intendant.State {
  __globalState = state;
  return __globalState;
}
export function resetState(benchFilename: string): void {
  setState(createState(benchFilename));
}
export async function dispatch(event: Intendant.Events): Promise<void> {
  for (const handler of eventHandlers) {
    await handler(event, getState());
  }
}
export function dispatchSync(event: Intendant.Events): void {
  for (const handler of eventHandlers) {
    handler(event, getState());
  }
}
export function addEventHandler(handler: Intendant.EventHandler): void {
  eventHandlers.push(handler);
}
