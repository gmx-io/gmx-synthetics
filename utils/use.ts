export async function usingResult(fn, callback) {
  const result = await fn;
  await callback(result);
}
