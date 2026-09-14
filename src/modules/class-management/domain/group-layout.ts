export type GroupMember = { studentId: string; displayName: string; groupIndex: number; slotIndex: number; isLeader: boolean };
export type GroupLayout = { templateVersion: number; groups: Array<{ groupIndex: number; members: GroupMember[] }> };

export function validateGroupLayout(layout: GroupLayout): string[] {
  const errors: string[] = []; const seen = new Set<string>();
  layout.groups.forEach((group) => {
    const leaders = group.members.filter((member) => member.isLeader);
    if (leaders.length > 1) errors.push(`第${group.groupIndex}组最多只能有一名组长`);
    group.members.forEach((member) => { if (seen.has(member.studentId)) errors.push(`学生重复出现在第${group.groupIndex}组`); seen.add(member.studentId); });
  });
  return errors;
}
