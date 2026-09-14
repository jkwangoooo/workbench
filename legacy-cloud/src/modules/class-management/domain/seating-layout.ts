export type SeatingCellKind = 'student' | 'empty' | 'aisle' | 'podium';
export type SeatingCell = { rowIndex: number; columnIndex: number; cellKind: SeatingCellKind; studentId?: string; displayName?: string };
export type SeatingLayout = { templateVersion: number; rowCount: number; columnCount: number; cells: SeatingCell[] };

export function validateSeatingLayout(layout: SeatingLayout): string[] {
  const errors: string[] = []; const seen = new Set<string>(); const coords = new Set<string>();
  layout.cells.forEach((cell) => {
    const key = `${cell.rowIndex}:${cell.columnIndex}`; if (coords.has(key)) errors.push(`座位坐标重复：${key}`); coords.add(key);
    if (cell.rowIndex < 0 || cell.rowIndex >= layout.rowCount || cell.columnIndex < 0 || cell.columnIndex >= layout.columnCount) errors.push(`座位坐标越界：${key}`);
    if (cell.cellKind === 'student' && !cell.studentId) errors.push(`学生座位缺少学生：${key}`);
    if (cell.cellKind !== 'student' && cell.studentId) errors.push(`结构格不得填写学生：${key}`);
    if (cell.studentId && seen.has(cell.studentId)) errors.push(`学生重复出现在座次表：${key}`); if (cell.studentId) seen.add(cell.studentId);
    const expectedKind = cell.rowIndex === 0 ? 'podium' : cell.columnIndex === 4 ? 'aisle' : undefined;
    if (expectedKind && cell.cellKind !== expectedKind) errors.push(`座次表固定结构不匹配：${key}`);
    if (!expectedKind && (cell.cellKind === 'podium' || cell.cellKind === 'aisle')) errors.push(`座次表结构格位置不合法：${key}`);
  });
  if (layout.rowCount !== 8 || layout.columnCount !== 9) errors.push('座次表必须是8行9列');
  return errors;
}
