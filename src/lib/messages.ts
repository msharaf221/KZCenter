/**
 * تواصل أولياء الأمور — قوالب رسائل + سجل مراسلات + إرسال جماعي
 *
 * قبل كده كان فيه روابط واتساب فردية في 3 صفحات، من غير قوالب ولا سجل:
 * مفيش طريقة تعرف «إيه الرسائل اللي اتبعتت لمين وإمتى»، ولا إرسال جماعي.
 */
import { dbAdd, dbGetAll, dbGetById, dbPut, generateId } from './db';
import type { MessageLog, MessageTemplate, Student, Settings } from './db';
import { getWhatsAppLink, dayjs } from './utils';

export type MessageKind = MessageLog['kind'];

export const KIND_LABEL: Record<MessageKind, string> = {
  late_payment: 'تأخر سداد',
  upcoming_due: 'استحقاق قريب',
  absence: 'غياب',
  exam_result: 'نتيجة امتحان',
  renewal: 'تجديد اشتراك',
  general: 'رسالة عامة',
};

export const CHANNEL_LABEL: Record<MessageLog['channel'], string> = {
  whatsapp: 'واتساب',
  sms: 'رسالة نصية',
  call: 'مكالمة',
  email: 'بريد إلكتروني',
};

export interface TemplateVars {
  student?: string;
  group?: string;
  teacher?: string;
  amount?: string;
  remaining?: string;
  dueDate?: string;
  date?: string;
  grade?: string;
  center?: string;
  [key: string]: string | undefined;
}

/** تعبئة متغيرات القالب: {student} {amount} {dueDate} … */
export function fillTemplate(body: string, vars: TemplateVars): string {
  return String(body || '').replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  }).replace(/[ \t]{2,}/g, ' ').trim();
}

/** القوالب الافتراضية (بتتزرع أول مرة) */
export const DEFAULT_TEMPLATES: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'تذكير متأخرات',
    kind: 'late_payment',
    body: 'السلام عليكم ورحمة الله، معكم {center}.\nنودّ التذكير بأن المتبقي على {student} هو {remaining} جنيه وكان مستحقاً يوم {dueDate}.\nبرجاء التكرم بالسداد في أقرب وقت، وشكراً لتعاونكم.',
  },
  {
    name: 'استحقاق قريب',
    kind: 'upcoming_due',
    body: 'السلام عليكم، معكم {center}.\nنودّ إفادتكم بأن قسط {student} بقيمة {amount} جنيه يستحق يوم {dueDate}.\nشكراً لالتزامكم.',
  },
  {
    name: 'إشعار غياب',
    kind: 'absence',
    body: 'السلام عليكم، معكم {center}.\nلم يحضر {student} حصة {group} يوم {date}.\nنرجو المتابعة، ويمكن ترتيب حصة تعويضية بالتواصل معنا.',
  },
  {
    name: 'نتيجة امتحان',
    kind: 'exam_result',
    body: 'السلام عليكم، معكم {center}.\nنتيجة {student} في الاختبار: {grade}.\nشكراً لمتابعتكم.',
  },
  {
    name: 'تجديد اشتراك',
    kind: 'renewal',
    body: 'السلام عليكم، معكم {center}.\nاقترب موعد تجديد اشتراك {student} في {group}.\nيسعدنا استمراركم معنا.',
  },
];

const SEED_FLAG = 'message_templates_seeded_v1';

/** زرع القوالب الافتراضية مرة واحدة */
export async function seedDefaultTemplates(): Promise<number> {
  try {
    if (localStorage.getItem(SEED_FLAG)) return 0;
    const existing = await dbGetAll<MessageTemplate>('message_templates');
    if (existing.length === 0) {
      const now = new Date().toISOString();
      for (const t of DEFAULT_TEMPLATES) {
        await dbAdd('message_templates', { ...t, id: generateId(), createdAt: now, updatedAt: now } satisfies MessageTemplate);
      }
    }
    localStorage.setItem(SEED_FLAG, new Date().toISOString());
    return DEFAULT_TEMPLATES.length;
  } catch (e) {
    console.error('seedDefaultTemplates error:', e);
    return 0;
  }
}

export async function getTemplates(): Promise<MessageTemplate[]> {
  const rows = await dbGetAll<MessageTemplate>('message_templates');
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export async function saveTemplate(t: Partial<MessageTemplate> & { name: string; body: string; kind: MessageKind }): Promise<void> {
  const now = new Date().toISOString();
  if (t.id) {
    const existing = await dbGetById<MessageTemplate>('message_templates', t.id);
    if (existing) {
      await dbPut('message_templates', { ...existing, ...t, updatedAt: now });
      return;
    }
  }
  await dbAdd('message_templates', {
    id: generateId(), name: t.name, kind: t.kind, body: t.body,
    createdAt: now, updatedAt: now,
  } satisfies MessageTemplate);
}

// ==================== LOGS ====================

export interface LogMessageInput {
  studentId?: string;
  studentName?: string;
  phone?: string;
  kind: MessageKind;
  channel?: MessageLog['channel'];
  text: string;
  sent?: boolean;
  userId?: string;
  username?: string;
  notes?: string;
}

/** تسجيل رسالة (اترسلت أو مكالمة تمت) */
export async function logMessage(input: LogMessageInput): Promise<MessageLog> {
  const now = new Date().toISOString();
  const entry: MessageLog = {
    id: generateId(),
    studentId: input.studentId,
    studentName: input.studentName,
    phone: input.phone,
    kind: input.kind,
    channel: input.channel || 'whatsapp',
    text: input.text,
    sent: input.sent !== false,
    date: now.slice(0, 10),
    userId: input.userId,
    username: input.username,
    notes: input.notes,
    createdAt: now,
  };
  await dbAdd('message_logs', entry);
  return entry;
}

export async function getStudentMessages(studentId: string): Promise<MessageLog[]> {
  const rows = await dbGetAll<MessageLog>('message_logs');
  return rows
    .filter(m => m.studentId === studentId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getAllMessages(limit = 500): Promise<MessageLog[]> {
  const rows = await dbGetAll<MessageLog>('message_logs');
  return rows
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, limit);
}

// ==================== BULK ====================

export interface BulkTarget {
  studentId: string;
  studentName: string;
  phone: string;
  vars: TemplateVars;
}

export interface BulkMessage {
  target: BulkTarget;
  text: string;
  /** رابط واتساب جاهز */
  link: string;
}

/**
 * تحضير إرسال جماعي: يجهّز نص ورابط لكل طالب.
 * (واتساب ما فيهوش API جماعي من المتصفح، فالنظام بيفتح الروابط واحد ورا واحد
 * أو يعرضهم كقائمة للنسخ — وده بيسجّل في سجل المراسلات.)
 */
export function prepareBulkMessages(opts: {
  targets: BulkTarget[];
  template: string;
  settings?: Settings | null;
}): BulkMessage[] {
  const center = opts.settings?.centerName || 'المركز';
  return opts.targets
    .filter(t => !!t.phone)
    .map(t => {
      const text = fillTemplate(opts.template, { center, student: t.studentName, ...t.vars });
      return { target: t, text, link: getWhatsAppLink(t.phone, text) };
    });
}

/** تسجيل إرسال جماعي في سجل المراسلات */
export async function logBulkMessages(opts: {
  messages: BulkMessage[];
  kind: MessageKind;
  channel?: MessageLog['channel'];
  userId?: string;
  username?: string;
}): Promise<number> {
  let logged = 0;
  for (const m of opts.messages) {
    await logMessage({
      studentId: m.target.studentId,
      studentName: m.target.studentName,
      phone: m.target.phone,
      kind: opts.kind,
      channel: opts.channel || 'whatsapp',
      text: m.text,
      sent: true,
      userId: opts.userId,
      username: opts.username,
    });
    logged++;
  }
  return logged;
}

/** فتح روابط واتساب بالتتابع (المتصفح بيمنع فتح أكتر من نافذة في نفس اللحظة) */
export async function openBulkLinks(messages: BulkMessage[], delayMs = 700, max = 20): Promise<number> {
  let opened = 0;
  for (const m of messages.slice(0, max)) {
    window.open(m.link, '_blank', 'noopener');
    opened++;
    if (opened < messages.length) await new Promise(r => setTimeout(r, delayMs));
  }
  return opened;
}

/** هل الطالب اتبعتتله رسالة من نفس النوع خلال N أيام؟ (منع التكرار المزعج) */
export async function recentlyMessaged(studentId: string, kind: MessageKind, days = 3): Promise<boolean> {
  const since = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
  const rows = await dbGetAll<MessageLog>('message_logs');
  return rows.some(m => m.studentId === studentId && m.kind === kind && (m.date || '') >= since && m.sent);
}

/** آخر رسالة لطالب (للعرض في ملفه) */
export async function lastMessage(studentId: string): Promise<MessageLog | null> {
  const rows = await getStudentMessages(studentId);
  return rows[0] || null;
}

/** إحصاءات سريعة للتواصل */
export async function messagingStats(days = 30): Promise<{ total: number; byKind: Record<string, number> }> {
  const since = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
  const rows = await dbGetAll<MessageLog>('message_logs');
  const recent = rows.filter(m => (m.date || '') >= since);
  const byKind: Record<string, number> = {};
  for (const m of recent) byKind[m.kind] = (byKind[m.kind] || 0) + 1;
  return { total: recent.length, byKind };
}

/** استخراج الطالب كهدف رسالة (بيجمع متغيرات جاهزة) */
export function studentToTarget(student: Student, vars: TemplateVars = {}): BulkTarget {
  return {
    studentId: student.id,
    studentName: student.name,
    phone: student.parentPhone || student.phone || '',
    vars: { student: student.name, ...vars },
  };
}
