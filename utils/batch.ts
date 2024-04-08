export async function handleInBatches(list, batchSize, handler) {
  let batch = [];
  let batchIndex = 0;

  for (let i = 0; i < list.length; i++) {
    if (batch.length === 0) {
      batchIndex = i;
    }

    batch.push(list[i]);

    if (batch.length === batchSize) {
      console.info(`handling batch: ${batchIndex} - ${i}`);
      await handler(batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    console.info(`handling final batch: ${batchIndex} - ${list.length}`);
    await handler(batch);
  }
}
