
describeBench('some suite', () => {
  bench('some bench', async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
});
