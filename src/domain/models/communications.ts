/** رسالة لولي أمر (سجل مراسلات) */
export interface MessageLog {
  id: string;
  studentId?: string;
  studentName?: string;
  phone?: string;
  /** سبب/نوع الرسالة */
  kind: 'late_payment' | 'upcoming_due' | 'absence' | 'exam_result' | 'general' | 'renewal';
  channel: 'whatsapp' | 'sms' | 'call' | 'email';
  text: string;
  /** اتبعتت فعلاً ولا مجرد تحضير */
  sent: boolean;
  date: string;
  userId?: string;
  username?: string;
  notes?: string;
  createdAt: string;
}

/** قالب رسالة جاهز */
export interface MessageTemplate {
  id: string;
  name: string;
  kind: MessageLog['kind'];
  /** النص مع متغيرات: {student} {group} {amount} {dueDate} {center} {teacher} */
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** قائمة انتظار مجموعة مكتملة */
export interface WaitlistEntry {
  id: string;
  groupId: string;
  studentId: string;
  addedAt: string;
  /** أولوية (أصغر = أقدم/أهم) */
  priority: number;
  notes?: string;
  status: 'waiting' | 'enrolled' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}
