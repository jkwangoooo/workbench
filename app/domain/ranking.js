export function rankFor(test, studentId) {
  const score = test.scores[studentId];
  if (score === '' || score == null) return '—';
  const sorted = Object.entries(test.scores)
    .filter(([, value]) => value !== '' && value != null)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const index = sorted.findIndex(([id]) => id === studentId);
  return index < 0 ? '—' : String(index + 1);
}
