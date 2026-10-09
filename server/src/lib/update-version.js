export function validVersion(version) { return /^\d+\.\d+\.\d+$/.test(String(version || '')); }
export function isOlderVersion(current, minimum) {
  if (!validVersion(current) || !validVersion(minimum)) return true;
  const a = current.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index++) { if (a[index] !== b[index]) return a[index] < b[index]; }
  return false;
}
