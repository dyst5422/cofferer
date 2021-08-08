export type BenchName = string;
export type BenchStatus = 'skip' | 'done' | 'todo';
export type Exception = any;
export type BlockName = string;

export type BenchOptions = {
  iterations: number;
  timeout: number;
  profileMemory: boolean;
  snapshotHeap: boolean;
  memoryLeakVariance: number;
}

export type BenchResult = {
  durationsMs: number[],
  heapUsedSizes?: number[] | null,
  status: BenchStatus;
  benchPath: Array<BenchName | BlockName>;
  benchOptions: BenchOptions;
};

export type BenchResults = BenchResult[];

export type RunResult = {
  unhandledErrors: Exception[];
  benchResults: BenchResults;
};

export type Reporter = (runResult: RunResult) => void | Promise<void>;
