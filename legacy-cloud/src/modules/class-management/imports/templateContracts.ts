export const GROUP_TEMPLATE_VERSION = 1;
export const SEATING_TEMPLATE_VERSION = 1;
export const GROUP_MEMBER_SLOTS = 4;
export const SEATING_TEMPLATE_ROWS = 8;
export const SEATING_TEMPLATE_COLUMNS = 9;
export type WorkbookRows = readonly (readonly unknown[])[];
export type StudentLookup = ReadonlyMap<string, { id: string; classId: string; displayName: string; sortOrder: number; active: boolean }>;
