import type {ErrorWithStack} from 'jest-util';
import type * as Cofferer from "../types";
import type {BenchOptions} from "../types";

export type ValidBenchReturnValues = void | undefined;
export type BenchReturnValuePromise = Promise<unknown>;
export type BenchReturnValueGenerator = Generator<void, unknown, void>;
export type BenchReturnValue = ValidBenchReturnValues | BenchReturnValuePromise;
export type BenchContext = Record<string, unknown>;
export type DoneFn = () => void;
export type DoneTakingBenchFn = (this: BenchContext | undefined, done: DoneFn) => ValidBenchReturnValues;
export type PromiseReturningBenchFn = (this: BenchContext | undefined) => BenchReturnValue;
export type GeneratorReturningBenchFn = (this: BenchContext | undefined) => BenchReturnValueGenerator;
export type BenchFn = PromiseReturningBenchFn | GeneratorReturningBenchFn | DoneTakingBenchFn;
export type BlockMode = void | 'skip' | 'only' | 'todo';
export type BlockFn = () => void
export type BenchMode = BlockMode;
export type SharedHookType = 'afterAll' | 'beforeAll';
export type HookType = SharedHookType | 'afterEach' | 'beforeEach';
export type HookFn = BenchFn;
export type AsyncFn = BenchFn | HookFn;
export type Hook = {
  asyncError: Error;
  fn: HookFn;
  type: HookType;
  parent: DescribeBlock;
  seenDone: boolean;
  benchOptions: BenchOptions;
};

export type DescribeFn = (
  blockName: Cofferer.BlockName,
  blockFn: BlockFn,
) => void;

export type EventHandler = (event: Events, state: State) => void;

export type Events =
  | Event<'run_start'>
  | Event<'run_finish'>
  | Event<'start_describe_definition', {
    asyncError: ErrorWithStack,
    blockName: Cofferer.BlockName,
    mode: BlockMode,
  }>
  | Event<'finish_describe_definition', {
    blockName: Cofferer.BlockName,
    mode: BlockMode,
  }>
  | Event<'add_hook', {
    asyncError: ErrorWithStack,
    fn: HookFn,
    hookType: HookType,
    timeout?: number,
  }>
  | Event<'add_bench', {
    asyncError: ErrorWithStack,
    fn: HookFn,
    mode: BenchMode,
    benchName: Cofferer.BenchName,
    options?: Partial<Cofferer.BenchOptions> | null,
  }>
  | Event<'hook_start', {
    hook: Hook,
  }>
  | Event<'hook_failure', {
    bench: BenchEntry,
    describeBlock: DescribeBlock,
    error: Cofferer.Exception,
    hook: Hook,
  }>
  | Event<'start_run_describe', {
    describeBlock: DescribeBlock
  }>
  | Event<'bench_skip', {
    bench: BenchEntry,
  }>
  | Event<'bench_todo', {
    bench: BenchEntry,
  }>
  | Event<'bench_done', {
    bench: BenchEntry,
  }>
  | Event<'bench_start', {
    bench: BenchEntry,
  }>
  | Event<'bench_fn_start', {
    bench: BenchEntry,
  }>
  | Event<'bench_fn_failure', {
    bench: BenchEntry,
    error: Cofferer.Exception,
  }>
  | Event<'setup', {
  benchNamePattern: string,
}>
  | Event<'teardown', {
}>
  | Event<'error', {

  }>
;

export type Event<N extends string, P = any> = {
  name: N,
} & P;

export declare type GlobalErrorHandlers = {
  uncaughtException: Array<(exception: Cofferer.Exception) => void>;
  unhandledRejection: Array<(exception: Cofferer.Exception, promise: Promise<unknown>) => void>;
};

export type State = {
  currentDescribeBlock: DescribeBlock,
  currentlyRunningBench?: BenchEntry | null,
  rootDescribeBlock: DescribeBlock,
  unhandledErrors: Cofferer.Exception[],
  hasFocusedBenches: boolean,
  hasStarted: boolean,
  benchNamePattern?: RegExp | null,
  parentProcess: NodeJS.Process | null;
  originalGlobalErrorHandlers?: GlobalErrorHandlers;
  benchOptions: BenchOptions,
}

export type DescribeBlock = {
  type: 'describeBlock';
  children: Array<DescribeBlock | BenchEntry>;
  hooks: Array<Hook>;
  mode: BlockMode;
  name: Cofferer.BlockName;
  parent?: DescribeBlock;
};

export type BenchEntry = {
  type: 'bench';
  asyncError: Cofferer.Exception;
  errors: Cofferer.Exception[];
  fn: BenchFn;
  invocations: number;
  mode: BenchMode;
  name: Cofferer.BenchName;
  parent: DescribeBlock;
  seenDone: boolean;
  heapUseds?: number[] | null;
  durations: number[];
  status?: Cofferer.BenchStatus | null;
  options: Cofferer.BenchOptions;
}

