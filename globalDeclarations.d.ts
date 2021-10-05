declare var beforeAllBenches: cofferer.Lifecycle;
declare var beforeEachBench: cofferer.Lifecycle;
declare var afterAllBenches: cofferer.Lifecycle;
declare var afterEachBench: cofferer.Lifecycle;
declare var describeBench: cofferer.Describe;
declare var beforeAllB: cofferer.Lifecycle;
declare var beforeEachB: cofferer.Lifecycle;
declare var afterAllB: cofferer.Lifecycle;
declare var afterEachB: cofferer.Lifecycle;
declare var describeB: cofferer.Describe;
declare var bench: cofferer.Bench;

declare namespace cofferer {

  type BenchName = string;
  type BenchStatus = 'skip' | 'done' | 'todo';
  type Exception = any;
  type BlockName = string;

  type BenchOptions = {
    iterations: number;
    timeout: number;
    profileMemory: boolean;
    snapshotHeap: boolean;
    memoryLeakVariance: number;
    memoryLeakMinimumValue: number;
  }
  type ValidBenchReturnValues = void | undefined;
  type BenchReturnValuePromise = Promise<unknown>;
  type BenchReturnValueGenerator = Generator<void, unknown, void>;
  type BenchReturnValue = ValidBenchReturnValues | BenchReturnValuePromise;
  type BenchContext = Record<string, unknown>;
  type DoneFn = () => void;
  type DoneTakingBenchFn = (this: BenchContext | undefined, done: DoneFn) => ValidBenchReturnValues;
  type PromiseReturningBenchFn = (this: BenchContext | undefined) => BenchReturnValue;
  type GeneratorReturningBenchFn = (this: BenchContext | undefined) => BenchReturnValueGenerator;
  type BenchFn = PromiseReturningBenchFn | GeneratorReturningBenchFn | DoneTakingBenchFn;
  type BlockMode = void | 'skip' | 'only' | 'todo';
  type BlockFn = () => void
  type BenchMode = BlockMode;
  type SharedHookType = 'afterAll' | 'beforeAll';
  type HookType = SharedHookType | 'afterEach' | 'beforeEach';
  type HookFn = BenchFn;
  type AsyncFn = BenchFn | HookFn;

  type Lifecycle = (fn: HookFn, benchOptions?: BenchOptions) => void;

  interface Describe {
    (blockName: BlockName, blockFn: BlockFn): void;
    only: Describe;
    skip: Describe;
  }

  interface Bench {
    (benchName: BenchName, fn: BenchFn, options?: Partial<BenchOptions> | null,): void;
    only: Bench;
    skip: Bench;
    todo: Bench;
  }

}
