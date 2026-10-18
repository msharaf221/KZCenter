import { localDateKey, localDayBounds } from './format';
import { supabase } from './supabase';

export interface ActivityItem {
  id: string;
  username: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  timestamp: string;
}

export interface CollectorMetric {
  id: string;
  name: string;
  amount: number;
  paymentCount: number;
}

export interface OwnerMetrics {
  date: string;
  centerName: string;
  currency: string;
  collected: number;
  refunds: number;
  expenses: number;
  net: number;
  paymentCount: number;
  newStudents: number;
  attendanceCount: number;
  absentCount: number;
  byMethod: Record<string, number>;
  byCollector: CollectorMetric[];
}

export interface OwnerSnapshot {
  metrics: OwnerMetrics;
  activity: ActivityItem[];
  refreshedAt: string;
  source?: 'server' | 'cache';
}

interface SnapshotResponse {
  date: string;
  center_name?: string;
  currency?: string;
  collected?: number | string;
  refunds?: number | string;
  expenses?: number | string;
  net?: number | string;
  payment_count?: number | string;
  new_students?: number | string;
  attendance_count?: number | string;
  absent_count?: number | string;
  by_method?: Record<string, number | string>;
  by_collector?: Array<{
    id?: string;
    name?: string;
    amount?: number | string;
    payment_count?: number | string;
  }>;
}

export async function loadOwnerSnapshot(tenantId: string): Promise<OwnerSnapshot> {
  if (!supabase) throw new Error('إعدادات Supabase غير متاحة في نسخة الموبايل.');
  const today = localDateKey();
  const { start, end } = localDayBounds();
  const [summaryResult, activityResult] = await Promise.all([
    supabase.rpc('get_owner_mobile_snapshot', { p_date: today, p_start: start, p_end: end }),
    supabase
      .from('audit_logs')
      .select('id, username, action, entity, entity_id, details, timestamp')
      .eq('tenant_id', tenantId)
      .order('timestamp', { ascending: false })
      .limit(30),
  ]);

  if (summaryResult.error) {
    throw new Error(summaryResult.status === 0
      ? 'لا يوجد اتصال بالإنترنت؛ ستظل آخر نسخة آمنة محفوظة ظاهرة حتى عودة الاتصال.'
      : 'تعذّر تحميل ملخص المركز. تأكد من تطبيق ترحيل الموبايل وصلاحيات المالك.');
  }
  if (activityResult.error) {
    throw new Error(activityResult.status === 0
      ? 'انقطع اتصال الإنترنت؛ ستظل آخر نسخة محفوظة متاحة.'
      : 'تعذّر تحميل سجل النشاط. تحقق من الاتصال وصلاحيات المركز.');
  }

  const response = summaryResult.data as SnapshotResponse;
  const collected = numberValue(response?.collected);
  const refunds = numberValue(response?.refunds);
  const expenses = numberValue(response?.expenses);
  const byMethod = Object.fromEntries(
    Object.entries(response?.by_method || {}).map(([method, amount]) => [method, numberValue(amount)]),
  );
  const byCollector = (response?.by_collector || []).map((collector, index) => ({
    id: collector.id || `collector-${index}`,
    name: collector.name || 'غير مسجل',
    amount: numberValue(collector.amount),
    paymentCount: numberValue(collector.payment_count),
  }));
  const activity = (activityResult.data || []).map(row => ({
    id: String(row.id),
    username: row.username || 'مستخدم',
    action: row.action || 'update',
    entity: row.entity || '',
    entityId: row.entity_id || undefined,
    details: row.details || undefined,
    timestamp: row.timestamp || new Date().toISOString(),
  }));

  return {
    metrics: {
      date: response?.date || today,
      centerName: response?.center_name || 'مركز تعليمي',
      currency: response?.currency || 'EGP',
      collected,
      refunds,
      expenses,
      net: numberValue(response?.net),
      paymentCount: numberValue(response?.payment_count),
      newStudents: numberValue(response?.new_students),
      attendanceCount: numberValue(response?.attendance_count),
      absentCount: numberValue(response?.absent_count),
      byMethod,
      byCollector,
    },
    activity,
    refreshedAt: new Date().toISOString(),
    source: 'server',
  };
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
