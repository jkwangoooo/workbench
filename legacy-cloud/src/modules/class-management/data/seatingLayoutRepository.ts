import type { DatabaseClient } from '../../../shared/database/client.js';
import type { SeatingLayout } from '../domain/seating-layout.js';
export interface SeatingLayoutRepository { getCurrent(classId: string): Promise<SeatingLayout | null>; replace(classId: string, layout: SeatingLayout): Promise<void>; }
type StudentRow = { id: string; class_id: string; name: string; sort_order?: number };
type SeatingCellRow = { row_index: number; column_index: number; cell_kind: SeatingLayout['cells'][number]['cellKind']; student_id?: string | null; student?: StudentRow | StudentRow[] | null };
type SeatingLayoutRow = { template_version: number; row_count: number; column_count: number; cells?: SeatingCellRow[] };

function oneStudent(student: SeatingCellRow['student']): StudentRow | undefined { return Array.isArray(student) ? student[0] : student || undefined; }

function mapSeatingLayout(row: SeatingLayoutRow): SeatingLayout { return { templateVersion: row.template_version, rowCount: row.row_count, columnCount: row.column_count, cells: (row.cells || []).map((cell) => ({ rowIndex: cell.row_index, columnIndex: cell.column_index, cellKind: cell.cell_kind, studentId: cell.student_id || undefined, displayName: oneStudent(cell.student)?.name })) .sort((left, right) => left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex) }; }

export function createSeatingLayoutRepository(client: DatabaseClient): SeatingLayoutRepository { return { async getCurrent(classId) { const rows = await client.request<SeatingLayoutRow[]>({ path: `class_seating_layouts?select=template_version,row_count,column_count,cells:class_seating_cells(row_index,column_index,cell_kind,student_id,student:students(id,class_id,name,sort_order))&class_id=eq.${encodeURIComponent(classId)}&limit=1` }); return rows[0] ? mapSeatingLayout(rows[0]) : null; }, async replace(classId, layout) { await client.request({ path: 'rpc/replace_seating_layout', method: 'POST', body: { p_class_id: classId, p_template_version: layout.templateVersion, p_row_count: layout.rowCount, p_column_count: layout.columnCount, p_cells: layout.cells } }); } }; }
