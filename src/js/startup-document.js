export async function initializeStartupDocument({
  renderEmpty,
  takeStartupPath,
  openStartupPath,
}) {
  renderEmpty();
  const startupPath = await takeStartupPath();
  if (!startupPath) return false;
  return openStartupPath(startupPath);
}
