export type StudentDirectoryItem = {
  id: string;
  classId: string;
  displayName: string;
  sortOrder: number;
  active: boolean;
};

export interface StudentDirectoryReader {
  listActiveByClass(classId: string): Promise<StudentDirectoryItem[]>;
  getById(studentId: string): Promise<StudentDirectoryItem | null>;
}

export function isStudentDirectoryItem(value: unknown): value is StudentDirectoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.classId === 'string'
    && typeof item.displayName === 'string'
    && typeof item.sortOrder === 'number'
    && typeof item.active === 'boolean';
}
