import type { EmployeeImportRow, ImportRowError } from '@nomiqa/contracts';
import { employeeImportRowSchema } from '@nomiqa/validation';

/**
 * تحليل ملف استيراد الموظفين.
 *
 * دالة نقية لا تلمس قاعدة البيانات ولا الشبكة: هذا الملف يأتي من نظام
 * موارد بشرية لا نتحكم فيه، وكل حالاته الحدّية — علامة BOM، أسطر
 * ويندوز، اقتباس داخل اقتباس، عمود ناقص — تظهر في ملف عميل واحد بعد
 * الإطلاق. اختبارها وحدةً أرخص من اكتشافها في دفعة من مئة موظف.
 *
 * الحد الأقصى للصفوف مفروض هنا لا في الطابور: ملف بمئة ألف سطر يجب أن
 * يُرفض قبل أن يُحمَّل في الذاكرة كاملاً.
 */

export const MAX_IMPORT_ROWS = 2_000;

/** مرادفات ترويسة كل حقل — بالعربية والإنجليزية. */
const HEADER_ALIASES: Record<string, string[]> = {
  email: ['email', 'e-mail', 'mail', 'البريد', 'البريد الالكتروني', 'البريد الإلكتروني'],
  fullName: ['full_name', 'fullname', 'name', 'الاسم', 'الاسم الكامل'],
  jobTitle: ['job_title', 'jobtitle', 'title', 'position', 'المسمى', 'المسمى الوظيفي'],
  employeeNo: ['employee_no', 'employee_number', 'staff_id', 'الرقم الوظيفي', 'رقم الموظف'],
  departmentCode: ['department', 'department_code', 'dept', 'الادارة', 'الإدارة', 'القسم'],
  branchCode: ['branch', 'branch_code', 'الفرع'],
  role: ['role', 'الدور', 'الصلاحية'],
};

export interface ParsedImport {
  rows: EmployeeImportRow[];
  errors: ImportRowError[];
  totalRows: number;
}

export class ImportFormatError extends Error {}

/**
 * يفكّ ملف CSV إلى صفوف حقول.
 *
 * محلّل مكتوب هنا لا مكتبة: القواعد المطلوبة أربع (فاصلة، اقتباس،
 * اقتباس مضاعف، سطر جديد داخل اقتباس)، وإضافة اعتمادية لأجلها تدخل
 * إلى مسار يقرأ ملفات يرفعها المستخدم.
 */
export function parseCsv(content: string): string[][] {
  // BOM في أول الملف يلتصق بأول ترويسة فلا تُطابق أي مرادف. يُفحص
  // برمز المحرف لا بمحرفه: محرف غير مرئي في شيفرة المصدر يُحذف بالخطأ
  // في أول تنسيق آلي، ويرفضه المدقّق أصلاً.
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  // آخر سطر بلا فاصل نهاية.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // نتخطى الأسطر الفارغة تماماً: ملفات Excel تنتهي بسطر فارغ عادةً،
  // ورفض الملف لأجله كان سيبدو عشوائياً للمستخدم.
  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

/** يطابق ترويسة الملف بأسماء الحقول المعروفة. */
function mapHeaders(header: string[]): Map<string, number> {
  const mapping = new Map<string, number>();

  header.forEach((raw, index) => {
    const normalized = raw
      .trim()
      .toLowerCase()
      // بعض أنظمة الموارد البشرية تصدّر الترويسة بمسافات بدل الشرطات.
      .replace(/\s+/g, ' ');

    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (mapping.has(field)) {
        continue;
      }
      if (aliases.includes(normalized) || aliases.includes(normalized.replace(/ /g, '_'))) {
        mapping.set(field, index);
      }
    }
  });

  return mapping;
}

/**
 * يحوّل محتوى الملف إلى صفوف مُتحقَّق منها.
 *
 * الصف الخاطئ لا يوقف الدفعة: يُسجَّل خطؤه ويستمر الباقي. رفض ملف
 * كامل بسبب بريد واحد مكتوب خطأً يعني أن مسؤول الموارد البشرية يصحّح
 * ويعيد الرفع خمس مرات قبل أن يمر.
 *
 * التكرار داخل الملف يُحسم هنا لا في قاعدة البيانات: أول ظهور يفوز،
 * وما بعده يُسجَّل مكرراً — وإلا صار السطر الأخير هو من يحدد إدارة
 * الموظف لأنه كتب فوق سابقه.
 */
export function parseEmployeeCsv(content: string): ParsedImport {
  const table = parseCsv(content);

  if (table.length === 0) {
    throw new ImportFormatError('الملف فارغ');
  }

  const mapping = mapHeaders(table[0] ?? []);

  if (!mapping.has('email')) {
    throw new ImportFormatError('الملف لا يحتوي عمود البريد الإلكتروني');
  }

  const body = table.slice(1);

  if (body.length > MAX_IMPORT_ROWS) {
    throw new ImportFormatError(`الملف يتجاوز ${MAX_IMPORT_ROWS} صفاً`);
  }

  const rows: EmployeeImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();

  body.forEach((cells, index) => {
    // ‎+2: سطر الترويسة، والترقيم من واحد كما يراه المستخدم في Excel.
    const rowNumber = index + 2;

    const read = (field: string): string | null => {
      const position = mapping.get(field);
      if (position === undefined) {
        return null;
      }
      const value = cells[position]?.trim();
      return value ? value : null;
    };

    const candidate = {
      email: read('email') ?? '',
      fullName: read('fullName'),
      jobTitle: read('jobTitle'),
      employeeNo: read('employeeNo'),
      departmentCode: read('departmentCode'),
      branchCode: read('branchCode'),
      role: read('role')?.toLowerCase() ?? null,
    };

    const result = employeeImportRowSchema.safeParse(candidate);

    if (!result.success) {
      const issue = result.error.issues[0];
      errors.push({
        row: rowNumber,
        reason: 'invalid_value',
        field: issue?.path.join('.') || undefined,
      });
      return;
    }

    if (seen.has(result.data.email)) {
      errors.push({ row: rowNumber, reason: 'duplicate_in_file', field: 'email' });
      return;
    }

    seen.add(result.data.email);
    rows.push({
      rowNumber,
      email: result.data.email,
      fullName: result.data.fullName ?? null,
      jobTitle: result.data.jobTitle ?? null,
      employeeNo: result.data.employeeNo ?? null,
      departmentCode: result.data.departmentCode ?? null,
      branchCode: result.data.branchCode ?? null,
      roleKey: result.data.role ?? null,
    });
  });

  return { rows, errors, totalRows: body.length };
}
