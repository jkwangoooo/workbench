import type { DatabaseClient } from '../../../shared/database/client.js';
import type { GroupLayout } from '../domain/group-layout.js';
export interface GroupLayoutRepository { getCurrent(classId: string): Promise<GroupLayout | null>; replace(classId: string, layout: GroupLayout): Promise<void>; }
type StudentRow = { id: string; class_id: string; name: string; sort_order?: number };
type GroupMemberRow = { student_id: string; group_index: number; slot_index: number; is_leader: boolean; student?: StudentRow | StudentRow[] | null };
type GroupLayoutRow = { template_version: number; groups?: GroupMemberRow[] };

function oneStudent(student: GroupMemberRow['student']): StudentRow | undefined { return Array.isArray(student) ? student[0] : student || undefined; }

function mapGroupLayout(row: GroupLayoutRow): GroupLayout {
  const groups = new Map<number, GroupLayout['groups'][number]['members']>();
  for (const member of row.groups || []) {
    const student = oneStudent(member.student);
    const mapped = groups.get(member.group_index) || [];
    mapped.push({ studentId: member.student_id, displayName: student?.name || '', groupIndex: member.group_index, slotIndex: member.slot_index, isLeader: Boolean(member.is_leader) });
    groups.set(member.group_index, mapped);
  }
  return { templateVersion: row.template_version, groups: [...groups.entries()].sort(([left], [right]) => left - right).map(([groupIndex, members]) => ({ groupIndex, members: members.sort((left, right) => left.slotIndex - right.slotIndex) })) };
}

export function createGroupLayoutRepository(client: DatabaseClient): GroupLayoutRepository { return { async getCurrent(classId) { const rows = await client.request<GroupLayoutRow[]>({ path: `class_group_layouts?select=template_version,groups:class_group_members(group_index,slot_index,is_leader,student_id,student:students(id,class_id,name,sort_order))&class_id=eq.${encodeURIComponent(classId)}&limit=1` }); return rows[0] ? mapGroupLayout(rows[0]) : null; }, async replace(classId, layout) { await client.request({ path: 'rpc/replace_group_layout', method: 'POST', body: { p_class_id: classId, p_template_version: layout.templateVersion, p_groups: layout.groups } }); } }; }
