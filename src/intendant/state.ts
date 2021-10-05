import type * as Intendant from './types';
import {eventHandler} from './eventHandler';
import {makeDescribe} from "./utils";
import type { BenchOptions } from '../types'

// @ts-ignore
let __globalState: Intendant.State;

const eventHandlers: Intendant.EventHandler[] = [
  eventHandler,
];

function createState(benchFilename: string, benchOptions: BenchOptions): Intendant.State {
   const ROOT_DESCRIBE_BLOCK = makeDescribe(benchFilename);
   return {
     rootDescribeBlock: ROOT_DESCRIBE_BLOCK,
     currentDescribeBlock: ROOT_DESCRIBE_BLOCK,
     currentlyRunningBench: null,
     hasFocusedBenches: false,
     unhandledErrors: [],
     hasStarted: false,
     benchOptions,
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
export function resetState(benchFilename: string, benchOptions: BenchOptions): void {
  setState(createState(benchFilename, benchOptions));
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
