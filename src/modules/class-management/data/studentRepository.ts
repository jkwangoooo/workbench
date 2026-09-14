import type { DatabaseClient } from '../../../shared/database/client.js';
import type { StudentDirectoryItem, StudentDirectoryReader } from '../../../shared/student-directory/contracts.js';
import type { RosterStudent } from '../domain/student.js';

type ClassRow = { id: string };
type StudentRow = { id: string; class_id: string; name: string; sort_order?: number };
type RosterRow = { student_id: string; identity_document_no?: string; provincial_student_no?: string; exam_no?: string };

export interface ClassManagementRepository extends StudentDirectoryReader {
  getClass8Id(): Promise<string | null>;
  listRoster8(): Promise<RosterStudent[]>;
  getProfile(studentId: string): Promise<Record<string, string> | null>;
}

export function createStudentRepository(client: DatabaseClient): ClassManagementRepository {
  const getClass8Id = async () => {
    const rows = await client.request<ClassRow[]>({ path: 'classes?select=id&name=eq.2025%E7%BA%A78%E7%8F%AD&limit=1' });
    return rows[0]?.id ?? null;
  };
  const listStudents = async (classId: string) => client.request<StudentRow[]>({
    path: `students?select=id,class_id,name,sort_order&class_id=eq.${encodeURIComponent(classId)}&order=sort_order.asc`
  });
  const listActiveByClass = async (classId: string): Promise<StudentDirectoryItem[]> => (await listStudents(classId)).map((row) => ({
    id: row.id, classId: row.class_id, displayName: row.name, sortOrder: Number(row.sort_order ?? 0), active: true
  }));
  return {
    getClass8Id,
    async listActiveByClass(classId) { return listActiveByClass(classId); },
    async getById(studentId) {
      const rows = await client.request<StudentRow[]>({ path: `students?select=id,class_id,name,sort_order&id=eq.${encodeURIComponent(studentId)}&limit=1` });
      const row = rows[0];
      return row ? { id: row.id, classId: row.class_id, displayName: row.name, sortOrder: Number(row.sort_order ?? 0), active: true } : null;
    },
    async listRoster8() {
      const classId = await getClass8Id();
      if (!classId) return [];
      const [students, details] = await Promise.all([
        listStudents(classId),
        client.request<RosterRow[]>({ path: `student_roster_details?select=student_id,identity_document_no,provincial_student_no,exam_no&class_id=eq.${encodeURIComponent(classId)}` }).catch(() => [] as RosterRow[])
      ]);
      const byId = new Map(details.map((row) => [row.student_id, row]));
      return students.map((row) => { const detail = byId.get(row.id); return {
        id: row.id, classId: row.class_id, displayName: row.name,
        identityDocumentNo: detail?.identity_document_no ?? '', provincialStudentNo: detail?.provincial_student_no ?? '', examNo: detail?.exam_no ?? '',
        sortOrder: Number(row.sort_order ?? 0), active: true
      }; });
    },
    async getProfile(studentId) {
      const rows = await client.request<Array<Record<string, unknown>>>({ path: `student_profiles?select=gender,health_status,ethnicity,birth_month,student_id_number,address,phone,father_name,father_phone,father_work_unit,mother_name,mother_phone,mother_work_unit,hobbies,strengths&student_id=eq.${encodeURIComponent(studentId)}&limit=1` });
      const row = rows[0];
      if (!row) return null;
      const labels: Record<string, string> = { gender: '请选择性别', health_status: '身体健康情况', ethnicity: '民族', birth_month: '出生年月', student_id_number: '学生身份证号', address: '家庭住址', phone: '常用联系电话', father_name: '父亲姓名', father_phone: '父亲联系电话', father_work_unit: '父亲工作单位', mother_name: '母亲姓名', mother_phone: '母亲联系电话', mother_work_unit: '母亲工作单位', hobbies: '特长爱好', strengths: '孩子优点' };
      return Object.fromEntries(Object.entries(labels).map(([column, label]) => [label, String(row[column] ?? '')]));
    }
  };
}
