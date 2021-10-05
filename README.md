# cofferer
A JS/TS benchmark runner with a familiar spec-like api.

The API is specifically designed to mirror that of testing libraries like Jest or Mocha to make writing benchmarks easy
for developers to do alongside their tests.


## Example

### my-benchmark.bench.ts
```typescript
// my-benchmark.bench.ts
import * as fs from 'fs';
import { doHeavyProcessing } from 'someImportedModule';

describeB('my first benchmark group', () => {
  bench('time to read in a file', async () => {
    const file = await fs.promises.readFile('somebigfile.dat', 'utf8');
  });

  bench('some expensive repeated operation', () => {
    doHeavyProcessing();
  });
});
```

### Usage

```shell
bench
```

### output
```text
my-benchmark.bench.ts:
    my first benchmark group:
        time to read in a file:
            Mean Duration: 0.06ms
            Mean Heap Used: 0.1Mb
            
        some expensive repeated operation:
            Mean Duration: 1030.02ms
            Mean Heap Used: 20.03Mb
```


## Configuration

Configuration can be done on a per-group or bench basis, through the CLI, or using a .coffererrc file a the project root.

### .coffererrc

```json
// .coffererrc
{
    timeout: 60000,
    iterations: 10,
    profileMemory: true,
    snapshotHeap: true,
    memoryLeakVariance: 0.05
}
```

### Options

#### -i, --iterations \<number\>
The number of iterations of each benchmark to do (for getting statistically relevant results)

#### -t, --timeout \<number\>
Duration in ms to consider a benchmark as having timed out

#### -p, --profileMemory
Whether to also collect memory profiling information as well

#### -s, --snapshotHeap
Whether to also snapshot the heap before any iterations and at the end of each iteration. These heap snapshots can be
inspected in the Chrome devtools after the fact

#### -o, --snapshotOutputDirectory \<string\>
Output destination of heap snapshots

#### -v, --memoryLeakVariance \<number\>
Minimum variance in memory usage to flag as leak [0-1]

#### -m, --memoryLeakMinimumValue \<number\>
Ignore leaks below this fixed memory amount in Bytes
