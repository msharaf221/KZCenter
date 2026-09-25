import dayjs from 'dayjs';
import { readSnapshot } from '../data/readers';
import { buildPreview, collectWriteOffTargets, writeOffFingerprint, type WriteOffOptions, type WriteOffPreview, type WriteOffResult, type WriteOffScope } from '../domain/ledger/writeOff';
import { InstallmentStatus } from '../lib/billing';
import { round2 } from '../lib/money';
import { billingOperation } from './billing/operation';
import { requireDate } from '../domain/validation';

// ==================== WRITE-OFF (تصفير المديونيات / إبراء ذمة) ====================

/**
 * نطاق التصفير:
 *  - `all` → كل الأقساط غير المسددة (المستحق + المتأخر + اللي لسه ما استحقش)
 *  - `due` → المستحق والمتأخر بس (dueDate ≤ اليوم) — الأقساط الجاية تفضل كما هي
 */
export { WRITE_OFF_CONFIRM_WORD, WRITE_OFF_SCOPE_HINT, WRITE_OFF_SCOPE_LABEL } from '../domain/ledger/writeOff';
export type { WriteOffOptions, WriteOffPreview, WriteOffResult, WriteOffScope } from '../domain/ledger/writeOff';

/**
 * معاينة التصفير من غير أي تعديل على البيانات — بتتستخدم في نافذة التأكيد
 * عشان المستخدم يشوف «هيتمسح إيه بالظبط» قبل الضغط.
 */
export async function previewWriteOff(scope: WriteOffScope, opts: WriteOffOptions = {}): Promise<WriteOffPreview> {
  const today = opts.today || dayjs().format('YYYY-MM-DD');
  const data = await readSnapshot(['installments', 'students']);
  const targets = collectWriteOffTargets(scope, today, data.installments, data.students);
  return buildPreview(scope, targets, today);
}

/**
 * تصفير المديونيات (إبراء ذمة) — بداية شهر جديد قبل التجديدات.
 *
 * **إيه اللي بيحصل:**
 *  - كل الأقساط المؤهلة حسب `scope` بتتحوّل للحالة `cancelled` (نفس طريقة
 *    التحويل والخروج من مجموعة) فالمتبقي عليها بيصفّر.
 *  - **الدفعات المحصّلة ما بتتمسش**: لا حذف ولا `void` — الفلوس اللي اتدفعت
 *    بتفضل مسجّلة، ولو كانت أكبر من المستحق الجديد بتبقى **رصيد دائن** للطالب.
 *  - بعد الإلغاء بيتعاد توزيع المدفوع (`rebuildInstallmentsFromPayments`) على
 *    الأقساط اللي فضلت، فالمدفوع يغطّي الشهر الجاي بدل ما يضيع على قسط ملغي.
 *
 * @param scope `all` = كل المتبقي · `due` = المستحق والمتأخر فقط
 * @param reason سبب التصفير (إلزامي — بيتسجّل على كل قسط وفي سجل المراجعة)
 */
export async function writeOffDebts(
  scope: WriteOffScope,
  reason: string,
  opts: WriteOffOptions = {},
): Promise<WriteOffResult> {
  return billingOperation(async unit => {
    if (scope !== 'all' && scope !== 'due') {
      return { success: false, error: `نطاق التصفير غير معروف: ${String(scope)}` };
    }

    const cleanReason = (reason || '').trim();
    if (!cleanReason) return { success: false, error: 'سبب التصفير مطلوب' };

    const today = opts.today ?? dayjs().format('YYYY-MM-DD');
    requireDate(today);
    const targets = collectWriteOffTargets(scope, today, await unit.all('installments'), await unit.all('students'));
    if (opts.expectedFingerprint !== undefined && opts.expectedFingerprint !== writeOffFingerprint(scope, today, targets)) {
      return { success: false, error: 'المديونيات اتغيرت بعد المعاينة؛ راجع الأرقام وأكّد العملية من جديد' };
    }
    if (targets.length === 0) {
      return { success: false, error: 'لا توجد مديونيات مطابقة للتصفير' };
    }

    const remainingBefore = round2((await unit.debtors()).reduce((sum, d) => sum + (d.remaining || 0), 0));
    const now = new Date().toISOString();
    const note = `ملغي: تصفير مديونيات — ${cleanReason}`;

    // 1) إلغاء الأقساط المؤهلة (المدفوع عليها مش بيتلغي — الدفعات نفسها مفيش عليها مساس)
    for (const inst of targets) {
      await unit.put('installments', {
        ...inst,
        status: 'cancelled' as InstallmentStatus,
        notes: inst.notes ? `${inst.notes} — ${note}` : note,
        updatedAt: now,
      });
    }

    // 2) إعادة توزيع المدفوع على الأقساط اللي فضلت عشان ما يضيعش على قسط ملغي
    const studentIds = Array.from(new Set(targets.map(i => i.studentId)));
    for (const sid of studentIds) {
      await unit.rebuild(sid);
    }

    const remainingAfter = round2((await unit.debtors()).reduce((sum, d) => sum + (d.remaining || 0), 0));

    return {
      success: true,
      preview: buildPreview(scope, targets, today),
      remainingBefore,
      remainingAfter,
    };

  });
}

/** The visible review and its confirmation fence come from the same readonly snapshot. */
export async function reviewWriteOff(scope: WriteOffScope) {
  const today = dayjs().format('YYYY-MM-DD');
  const data = await readSnapshot(['installments', 'students']);
  const targets = collectWriteOffTargets(scope, today, data.installments, data.students);
  return { scope, today, preview: buildPreview(scope, targets, today), fingerprint: writeOffFingerprint(scope, today, targets) };
}
