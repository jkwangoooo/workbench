export type ExistingStudent = { id: string; classId: string; displayName: string; identityDocumentNo?: string; provincialStudentNo?: string; active: boolean };
export type IncomingStudent = { classId: string; displayName: string; identityDocumentNo?: string; provincialStudentNo?: string; profile?: Record<string, unknown> };
export type PreflightCounts = { added: number; matched: number; missing: number; conflicts: number };

export function preflightStudentUpdate(existing: readonly ExistingStudent[], incoming: readonly IncomingStudent[], classId: string): PreflightCounts {
  const current = existing.filter((student) => student.classId === classId);
  const source = incoming.filter((student) => student.classId === classId);
  const byKey = new Map<string, ExistingStudent>();
  current.forEach((student) => { if (student.provincialStudentNo) byKey.set(`p:${student.provincialStudentNo.trim()}`, student); if (student.identityDocumentNo) byKey.set(`i:${student.identityDocumentNo.trim()}`, student); });
  const seen = new Set<string>(); let added = 0; let matched = 0; let conflicts = 0;
  source.forEach((student) => {
    if (classId !== '8' && student.profile && Object.keys(student.profile).length) { conflicts += 1; return; }
    const keys = [student.provincialStudentNo && `p:${student.provincialStudentNo.trim()}`, student.identityDocumentNo && `i:${student.identityDocumentNo.trim()}`].filter(Boolean) as string[];
    const matches = [...new Set(keys.map((key) => byKey.get(key)?.id).filter(Boolean))];
    if (matches.length > 1) conflicts += 1;
    else if (matches.length === 1) { matched += 1; seen.add(matches[0]!); }
    else added += 1;
  });
  return { added, matched, missing: current.filter((student) => !seen.has(student.id)).length, conflicts };
}
