export type BenchName = string;
export type BenchStatus = 'skip' | 'done' | 'todo';
export type Exception = Error;
export type BlockName = string;

export type BenchOptions = {
  iterations: number;
  timeout: number;
  profileMemory: boolean;
  snapshotHeap: boolean;
  snapshotOutputDirectory: string | null;
  memoryLeakVariance: number;
  memoryLeakMinimumValue: number;
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
  filename: string;
  unhandledErrors: Error[];
  benchResults: BenchResults;
};

export type Reporter = (runResult: RunResult) => void | Promise<void>;
