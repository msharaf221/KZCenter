/**
 * تواصل أولياء الأمور — قوالب + إرسال جماعي + سجل مراسلات
 *
 * قبل كده: روابط واتساب فردية في 3 صفحات، من غير قوالب ولا سجل ولا إرسال جماعي.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { MessageCircle, Send, Plus, Trash2, Copy, ExternalLink, History, FileText } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import {
  getTemplates, saveTemplate, prepareBulkMessages, logBulkMessages, getAllMessages,
  fillTemplate, KIND_LABEL, CHANNEL_LABEL, seedDefaultTemplates, type BulkMessage,
} from '../lib/messages';
import { dbGetAll, dbSoftDelete, getDebtors, installmentRemaining } from '../lib/db';
import type { Installment, MessageLog, MessageTemplate, Student } from '../lib/db';
import type { MessageKind } from '../lib/messages';
import { upcomingDues } from '../lib/billing';
import { formatCurrency, formatDate } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import { can } from '../lib/permissions';

type Audience = 'debtors' | 'upcoming' | 'all_active' | 'group';

const AUDIENCE_LABEL: Record<Audience, string> = {
  debtors: 'اللي عليهم متأخرات',
  upcoming: 'اللي استحقاقهم قريب',
  all_active: 'كل الطلاب النشطين',
  group: 'مجموعة محددة',
};

export default function MessagesPage() {
  const { settings } = useApp();
  const { user } = useAuth();
  const currency = settings?.currency;
  const canEdit = can(user?.role, 'messages', 'create');

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [audience, setAudience] = useState<Audience>('debtors');
  const [groupId, setGroupId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  const [prepared, setPrepared] = useState<BulkMessage[]>([]);
  const [sending, setSending] = useState(false);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [tplForm, setTplForm] = useState<{ name: string; kind: MessageKind; body: string }>({
    name: '', kind: 'general', body: '',
  });
  const [deleteTpl, setDeleteTpl] = useState<MessageTemplate | null>(null);
  const [tab, setTab] = useState<'send' | 'log' | 'templates'>('send');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await seedDefaultTemplates();
      const [t, l, s, ins, g] = await Promise.all([
        getTemplates(),
        getAllMessages(300),
        dbGetAll<Student>('students'),
        dbGetAll<Installment>('installments'),
        dbGetAll<{ id: string; name: string }>('groups'),
      ]);
      setTemplates(t);
      setLogs(l);
      setStudents(s);
      setInstallments(ins);
      setGroups(g);
      if (t.length > 0 && !templateId) {
        setTemplateId(t[0].id);
        setBody(t[0].body);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  // الجمهور المستهدف
  const targets = useMemo(() => {
    return (async () => {
      if (audience === 'all_active') {
        return students
          .filter(s => s.status === 'active')
          .map(s => ({
            studentId: s.id, studentName: s.name, phone: s.parentPhone || s.phone || '',
            vars: { student: s.name },
          }));
      }
      if (audience === 'group') {
        return students
          .filter(s => (s.enrolledGroups || []).includes(groupId))
          .map(s => ({
            studentId: s.id, studentName: s.name, phone: s.parentPhone || s.phone || '',
            vars: { student: s.name, group: groups.find(g => g.id === groupId)?.name || '' },
          }));
      }
      if (audience === 'upcoming') {
        const up = upcomingDues(installments, settings?.upcomingDueDays ?? 3);
        return up.items.map(r => {
          const st = students.find(s => s.id === r.studentId);
          const remaining = installmentRemaining(r);
          return {
            studentId: r.studentId,
            studentName: st?.name || '',
            phone: st?.parentPhone || st?.phone || '',
            vars: {
              student: st?.name || '',
              amount: formatCurrency(r.amount ?? remaining, currency),
              remaining: formatCurrency(remaining, currency),
              dueDate: formatDate(r.dueDate),
              group: groups.find(g => g.id === r.groupId)?.name || '',
            },
          };
        });
      }
      // debtors
      const rows = await getDebtors();
      return rows.map(d => ({
        studentId: d.studentId,
        studentName: d.name,
        phone: d.parentPhone || d.phone || '',
        vars: {
          student: d.name,
          remaining: formatCurrency(d.remaining, currency),
          amount: formatCurrency(d.overdueAmount, currency),
          dueDate: d.groups[0] ? formatDate(new Date().toISOString()) : '',
          group: d.groups.map(g => g.groupName).join('، ') || '',
        },
      }));
    })();
  }, [audience, groupId, students, groups, installments, settings?.upcomingDueDays, currency]);

  async function handlePrepare() {
    if (!body.trim()) { notify.error('اكتب نص الرسالة أو اختار قالب'); return; }
    const list = await targets;
    if (list.length === 0) { notify.error('مفيش طلاب في الجمهور ده'); return; }

    const msgs = prepareBulkMessages({ targets: list, template: body, settings });
    setPrepared(msgs);
    if (msgs.length === 0) notify.error('مفيش أرقام تليفونات للجمهور المحدد');
    else notify.success(`تم تحضير ${msgs.length} رسالة`);
  }

  async function handleSendLog() {
    if (prepared.length === 0) return;
    setSending(true);
    try {
      const tpl = templates.find(t => t.id === templateId);
      const n = await logBulkMessages({
        messages: prepared,
        kind: (tpl?.kind || 'general') as MessageKind,
        channel: 'whatsapp',
        userId: user?.id,
        username: user?.username,
      });
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'create', entity: 'message',
        details: `إرسال جماعي (${AUDIENCE_LABEL[audience]}) — ${n} رسالة`,
      });
      notify.success(`تم تسجيل ${n} رسالة في سجل المراسلات`);
      setPrepared([]);
      setLogs(await getAllMessages(300));
    } finally {
      setSending(false);
    }
  }

  async function openLinks(max = 10) {
    let opened = 0;
    for (const m of prepared.slice(0, max)) {
      window.open(m.link, '_blank', 'noopener');
      opened++;
      await new Promise(r => setTimeout(r, 600));
    }
    notify.info(`اتفتح ${opened} محادثة واتساب — كمّل الباقي من القائمة`);
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) setBody(t.body);
  }

  function openNewTemplate() {
    setEditingTemplate(null);
    setTplForm({ name: '', kind: 'general', body: '' });
    setShowTemplateModal(true);
  }

  function openEditTemplate(t: MessageTemplate) {
    setEditingTemplate(t);
    setTplForm({ name: t.name, kind: t.kind, body: t.body });
    setShowTemplateModal(true);
  }

  async function handleSaveTemplate() {
    if (!tplForm.name.trim()) { notify.error('اسم القالب مطلوب'); return; }
    if (!tplForm.body.trim()) { notify.error('نص القالب مطلوب'); return; }
    await saveTemplate({
      id: editingTemplate?.id,
      name: tplForm.name.trim(),
      kind: tplForm.kind,
      body: tplForm.body,
    });
    notify.success(editingTemplate ? 'تم تحديث القالب' : 'تم إضافة القالب');
    setShowTemplateModal(false);
    setTemplates(await getTemplates());
  }

  async function handleDeleteTemplate() {
    if (!deleteTpl) return;
    await dbSoftDelete('message_templates', deleteTpl.id);
    notify.success('تم حذف القالب (يمكن استرجاعه من سلة المحذوفات)');
    setDeleteTpl(null);
    setTemplates(await getTemplates());
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify.success('اتنسخت الرسالة');
    } catch {
      notify.error('تعذّر النسخ من المتصفح');
    }
  }

  if (loading) {
    return <Layout title="تواصل أولياء الأمور"><div className="py-20 text-center text-gray-400">جاري التحميل...</div></Layout>;
  }

  return (
    <Layout title="تواصل أولياء الأمور">
      <div className="space-y-5">
        {/* التبويبات */}
        <div className="flex gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
          {([
            { k: 'send', label: 'إرسال جماعي', icon: <Send size={15} /> },
            { k: 'log', label: `سجل المراسلات (${logs.length})`, icon: <History size={15} /> },
            { k: 'templates', label: `القوالب (${templates.length})`, icon: <FileText size={15} /> },
          ] as const).map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === t.k ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={tab === t.k ? { backgroundColor: settings?.primaryColor || '#6366f1' } : {}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'send' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* إعداد الإرسال */}
            <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h3 className="text-base font-bold text-gray-900">الجمهور والرسالة</h3>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">إرسال لـ</label>
                <select value={audience} onChange={e => setAudience(e.target.value as Audience)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {(Object.keys(AUDIENCE_LABEL) as Audience[]).map(a => (
                    <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>
                  ))}
                </select>
                {audience === 'group' && (
                  <select value={groupId} onChange={e => setGroupId(e.target.value)}
                    className="w-full mt-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">اختر مجموعة...</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">القالب</label>
                <select value={templateId} onChange={e => applyTemplate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— من غير قالب —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">نص الرسالة</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={7}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                  placeholder="اكتب الرسالة هنا..." />
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  المتغيرات المتاحة: {'{student}'} {'{group}'} {'{amount}'} {'{remaining}'} {'{dueDate}'} {'{date}'} {'{center}'} {'{teacher}'} {'{grade}'}
                </p>
              </div>

              {canEdit && (
                <button onClick={handlePrepare}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
                  <MessageCircle size={16} /> تحضير الرسائل
                </button>
              )}
            </div>

            {/* المعاينة */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-900">
                  المعاينة {prepared.length > 0 && <span className="text-sm text-gray-400">({prepared.length} رسالة)</span>}
                </h3>
                {prepared.length > 0 && canEdit && (
                  <div className="flex gap-2">
                    <button onClick={handleSendLog} disabled={sending}
                      className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                      <History size={14} /> {sending ? 'جاري التسجيل...' : 'سجل الإرسال'}
                    </button>
                    <button onClick={() => openLinks(10)}
                      className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium hover:bg-emerald-700">
                      <ExternalLink size={14} /> افتح أول 10 في واتساب
                    </button>
                  </div>
                )}
              </div>

              {prepared.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-4xl mb-3">💬</div>
                  <p className="text-sm text-gray-500">اختار الجمهور والقالب واضغط «تحضير الرسائل»</p>
                  <p className="text-xs text-gray-400 mt-1">واتساب ما فيهوش إرسال جماعي آلي من المتصفح — النظام بيفتح المحادثات واحد واحد وبيسجّل كل رسالة</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {prepared.map((m, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-bold text-gray-900">{m.target.studentName}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-gray-400" dir="ltr">{m.target.phone}</span>
                          <button onClick={() => copyText(m.text)}
                            className="p-1 rounded hover:bg-white text-gray-500" title="نسخ النص"><Copy size={13} /></button>
                          <a href={m.link} target="_blank" rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-white text-green-600" title="افتح واتساب"><ExternalLink size={13} /></a>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'log' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">سجل المراسلات</h3>
              <p className="text-xs text-gray-400 mt-0.5">كل رسالة اتبعتت أو مكالمة اتعملت — للتابعه ومنع التكرار</p>
            </div>
            {logs.length === 0 ? (
              <div className="p-16 text-center text-gray-400">مفيش مراسلات مسجلة لسه</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-right text-xs text-gray-500">
                      <th className="px-4 py-3 font-medium">التاريخ</th>
                      <th className="px-4 py-3 font-medium">الطالب</th>
                      <th className="px-4 py-3 font-medium">النوع</th>
                      <th className="px-4 py-3 font-medium">الوسيلة</th>
                      <th className="px-4 py-3 font-medium">الرسالة</th>
                      <th className="px-4 py-3 font-medium">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice(0, 200).map(l => (
                      <tr key={l.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(l.date)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{l.studentName || '—'}</td>
                        <td className="px-4 py-3"><Badge status="pending" label={KIND_LABEL[l.kind]} /></td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{CHANNEL_LABEL[l.channel]}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate" title={l.text}>{l.text}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{l.username || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'templates' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">قوالب الرسائل</h3>
              {canEdit && (
                <button onClick={openNewTemplate}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
                  <Plus size={16} /> قالب جديد
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map(t => (
                <div key={t.id} className="p-4 border border-gray-100 rounded-xl hover:border-indigo-200 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-gray-900">{t.name}</span>
                    <Badge status="pending" label={KIND_LABEL[t.kind]} />
                  </div>
                  <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed mb-3 line-clamp-4">{t.body}</p>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button onClick={() => { applyTemplate(t.id); setTab('send'); }}
                        className="text-xs px-2.5 py-1.5 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200">استخدم</button>
                      <button onClick={() => openEditTemplate(t)}
                        className="text-xs px-2.5 py-1.5 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200">تعديل</button>
                      <button onClick={() => setDeleteTpl(t)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              ))}
              {templates.length === 0 && (
                <p className="col-span-2 py-10 text-center text-sm text-gray-400">مفيش قوالب — اضغط «قالب جديد»</p>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showTemplateModal} onClose={() => setShowTemplateModal(false)}
        title={editingTemplate ? 'تعديل قالب' : 'قالب جديد'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">اسم القالب</label>
              <input type="text" value={tplForm.name} onChange={e => setTplForm({ ...tplForm, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">النوع</label>
              <select value={tplForm.kind} onChange={e => setTplForm({ ...tplForm, kind: e.target.value as MessageKind })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {(Object.keys(KIND_LABEL) as MessageKind[]).map(k => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">النص</label>
            <textarea value={tplForm.body} onChange={e => setTplForm({ ...tplForm, body: e.target.value })} rows={8}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed" />
            <p className="text-[11px] text-gray-400 mt-1">
              المتغيرات: {'{student}'} {'{group}'} {'{amount}'} {'{remaining}'} {'{dueDate}'} {'{center}'}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs font-bold text-gray-600 mb-1">معاينة:</p>
            <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
              {fillTemplate(tplForm.body, {
                student: 'أحمد محمد', group: 's.r 1', amount: '800', remaining: '450',
                dueDate: '2026/09/10', center: settings?.centerName || 'المركز', date: formatDate(new Date()),
              }) || '—'}
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSaveTemplate}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">حفظ القالب</button>
            <button onClick={() => setShowTemplateModal(false)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTpl}
        onCancel={() => setDeleteTpl(null)}
        onConfirm={handleDeleteTemplate}
        title="حذف القالب"
        message={`«${deleteTpl?.name || ''}» هيتحذف (يمكن استرجاعه من سلة المحذوفات).`}
        confirmLabel="حذف"
        danger
      />
    </Layout>
  );
}
