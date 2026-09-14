export function rankFor(test, studentId) {
  const score = test.scores[studentId];
  if (score === '' || score == null) return '—';

  const ordered = Object.entries(test.scores)
    .filter(([, value]) => value !== '' && value != null)
    .map(([id, value]) => [id, Number(value)])
    .sort((a, b) => b[1] - a[1]);

  let rank = 0;
  let previous = null;
  for (let index = 0; index < ordered.length; index += 1) {
    if (previous === null || ordered[index][1] !== previous) {
      rank = index + 1;
      previous = ordered[index][1];
    }
    if (ordered[index][0] === studentId) return String(rank);
  }
  return '—';
}
