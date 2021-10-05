

describeBench('some suite', () => {
  bench('some bench with a heap snapshot', () => {
    console.log('some stuff happens here')
  }, { snapshotHeap: true });
  bench('some bench without a heap snapshot', () => {
    console.log('some stuff happens here')
  });
  bench('some async bench', async () => {
    console.log('some stuff happens here')
  });
});
