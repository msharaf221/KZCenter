# 🎓 EduCenter Pro — نظام إدارة المركز التعليمي

نظام متكامل لإدارة المراكز التعليمية ومراكز الدروس الخصوصية، مبني بـ React 19 + TypeScript + Vite + Tailwind CSS 4.
بيشتغل محلياً (IndexedDB) كتطبيق ويب / PWA / تطبيق سطح مكتب (Electron)، ومعاه مزامنة سحابية اختيارية عبر Supabase.

> 📄 وثيقة التدقيق وخارطة الطريق الكاملة (بالعربي) في [`docs/SYSTEM_AUDIT_AR.md`](docs/SYSTEM_AUDIT_AR.md).

---

## ✨ المميزات

### 👨‍ الطلاب
- إضافة/تعديل/حذف (مع **سلة محذوفات** واسترجاع — الحذف soft-delete)
- بحث وتصفية بالاسم والحالة + **بحث شامل** في كل الكيانات
- ملف شامل للطالب: المجموعات، الأقساط، المدفوعات، الحضور، سجل التحويلات
- **فحص التكرار** بالاسم/التليفون قبل الإضافة + رفع صورة للطالب
- استيراد/تصدير CSV

### 👨‍🏫 المدرسون
- بيانات + إحصائيات (مجموعات/طلاب) + ملف شامل للمدرس
- **نماذج أجر متعددة**: ثابت / بالحصة / نسبة من المحصّل / لكل مجموعة
- **كشف مرتّب شهري** (Payroll) بحساب الحصص المُسلّمة والمحصلات والسلف والخصومات
- سلف المدرسين وخصمها من المرتب

### 📚 الكورسات والمجموعات
- كورسات بمستويات ديناميكية وأسعار وألوان
- مجموعات مربوطة بكورس ومدرس + جدول أسبوعي + سعة
- **قائمة انتظار (Waitlist)** وترقية تلقائية لما يفتح مكان
- **الجدول الأسبوعي (Timetable)** مع كشف التعارضات (مدرس/قاعة/طالب في وقتين)

### 💰 المال والتحصيل
- دفعات (اشتراك/كتب/أخرى) بحالات (مدفوع/معلق/متأخر) + **طريقة دفع** و**اسم المحصِّل**
- **إيصالات متسلسلة** (بادئة + عدّاد) قابلة للطباعة RTL
- **إلغاء/استرجاع (Void & Refund)** بأثر محاسبي صحيح على الإيراد
- **خصومات وتجاوز سعر** (price override) لكل تسجيل
- **رصيد دائن/مدين** للطالب وترحيله بين المجموعات عند التحويل
- **خطة أقساط شهرية** تلقائية لكل تسجيل + دفع جزئي/كامل + توزيع على الأقدم
- **تاريخ استحقاق قابل للإعداد** (يوم من الشهر + أيام سماح) + تذكيرات بالمستحق قريباً
- **عدد حصص الشهر قابل للإعداد** (افتراضي 8) وتسعير بالحصص عند الالتحاق منتصف الكورس
- صفحة **المديونيات** بفلاتر وتحصيل سريع وتذكير واتساب
- **الخزينة (Cashbox)**: جلسات يومية (فتح/إغلاق)، مصروفات، والعهد النقدية المتوقعة مقابل المعدودة
- تقارير مالية **بمدى تاريخ مخصص** + ربحية كل مجموعة + تقرير تقادم الديون

### ✅ الحضور والاختبارات
- حضور/غياب/تأخير/استئذان + وقت دخول/خروج + ملخص
- **sheets حضور قابلة للطباعة**
- اختبارات ودرجات ومتوسطات

### 📊 التقارير والداشبورد
- لوحة تحكم برسوم بيانية + عدّادات + أعلى المديونيات + تنبيهات التعارض
- تقارير: مالي، حضور، مجموعات، مدرسين، تقادم ديون، ربحية — كلها **بطباعة RTL سليمة** عبر المتصفح

### 🔐 المستخدمون والصلاحيات
- تسجيل دخول بـ bcrypt + Rate limiting + انتهاء جلسة + تغيير كلمة المرور الافتراضية إجبارياً
- **أدوار وصلاحيات granular**: admin / secretary / accountant / supervisor / teacher
- **نطاق رؤية للمدرس**: بيشوف مجموعاته هو بس

### 🛠️ التشغيل اليومي
- **رسائل واتساب جماعية** بقوالب محفوظة وسجل إرسال + تذكيرات المستحقات
- **مخزون** (ملزمات/كتب) بحركات وتنبيه نقص مخزون
- **نسخ احتياطي** يدوي وتلقائي يومي + استيراد JSON
- **سجل مراجعة (Audit Log)** في IndexedDB بكل العمليات + بحث وتصدير

### ⚙️ الإعدادات
- اسم المركز، الألوان، الخطوط، الشعار، تذييل الإيصال، بادئة الإيصال
- يوم الاستحقاق، أيام السماح، حصص الشهر، تنبيهات المتأخر/المستحق، حد نقص المخزون

---

## 🆕 أبرز ما أُضيف في هذه النسخة (خلاصة التدقيق)

| المجال | ما تم |
|---|---|
| أمان/بيانات | RLS مقتصرة على authenticated، حذف ملف PII من الشجرة، سكربت تطهير التاريخ، حارس CI ضد رفع بيانات حقيقية |
| مزامنة | إعادة كتابة المزامنة: سحب مُرقَّم (pagination) + دمج per-row بدل مسح-وشحن (كان بيمسح بيانات) |
| سجل المراجعة | نقله من localStorage إلى IndexedDB (`audit_logs`) مع ترحيل تلقائي |
| إيصالات | عدّادات متسلسلة في store `counters` + طباعة RTL بدل jsPDF المكسور |
| مطابقة الاستيراد | مطابقة الطلاب بالتليفون ثم بالاسم الموحّد + كشف الأسماء المكررة الغامضة |
| طباعة | `src/lib/printing.ts` — جداول وإيصات HTML تُطبع عبر المتصفح (RTL سليم) |
| PWA | `manifest.json` + أيقونات مولّدة + `sw.js` فعّال (أوفلاين) |
| DevOps | GitHub Actions CI فعّال (typecheck → lint → test → PII-guard → build) + LICENSE |

---

## 🚀 التشغيل

### المتطلبات
- Node.js 22+ و npm (أدوات التطوير والاختبارات محتاجة Node 22؛ التطبيق نفسه بيشتغل في المتصفح)

### التثبيت والتطوير
```bash
npm install
npm run dev          # خادم تطوير
npm run test         # الاختبارات (Vitest)
npm run build        # فحص أنواع + بناء للإنتاج (ملف واحد dist/index.html)
```

### سطح المكتب (Electron)
```bash
npm run electron:dev        # تطوير
npm run electron:build:win  # حزمة ويندوز   (وكذلك :linux / :mac / :all)
```
الأيقونات (`build/icon.png|ico|icns`) مولّدة عبر `node scripts/make-icons.mjs`.

### Docker
```bash
docker-compose up -d
```
(فيه `Dockerfile` multi-stage و `nginx.conf` جاهزين للاستضافة الذاتية.)

---

## 🔑 بيانات الدخول الافتراضية

| المستخدم | كلمة المرور | الدور |
|----------|-------------|-------|
| admin    | admin123    | مسؤول |

> ⚠️ يُطلب تغيير كلمة المرور الافتراضية فور أول تسجيل دخول.

---

## 🗄️ التخزين

محلياً: **IndexedDB** (مكتبة `idb`). الجداول (stores):
`students, teachers, courses, groups, enrollments, installments, payments, refunds, counters,
attendance, exams, grades, expenses, cashbox_sessions, payroll, teacher_advances,
inventory, inventory_transactions, users, settings, audit_logs, message_logs, message_templates, waitlist`

### ☁️ Supabase (اختياري)
1. أنشئ مشروعاً وشغّل [`supabase_schema.sql`](supabase_schema.sql) (يفعّل RLS لـ authenticated فقط).
2. انسخ `.env.example` إلى `.env` وعبّئ `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY`.
3. فعّل Anonymous Sign-Ins من لوحة Supabase (المزامنة بتستخدم جلسة anon).

> 🔒 الـ RLS مقتصرة على المستخدمين المسجّلين؛ جدول `users` مقفول ضد الكتابة من العميل.
> لا تعطّل RLS — بدونها أي حامل anon key يقرأ ويعدّل كل البيانات.

> ⚠️ البيانات محلياً في متصفحك؛ مسح بيانات المتصفح يفقدها — اعمل نسخاً احتياطياً دورياً من الإعدادات.

---

## 🧪 الاختبارات

**520 اختباراً** (Vitest + Testing Library + fake-indexeddb) تغطّي منطق الحسابات والنطاقات والطباعة والاستيراد والمزامنة وسجل المراجعة والإيصالات وقوائم الانتظار والمرتبات والخزينة والجدول والصلاحيات.

```bash
npm run test            # مرة واحدة
npm run test:watch      # مراقبة
npm run test:coverage   # تغطية
```

---

## 📁 هيكل المشروع

```
src/
├── components/        # المكونات (layout/, ui/, ProtectedRoute, SheetImportDialog, TransferDialog, BackupManager, ErrorBoundary)
├── contexts/          # AuthContext · AppContext
├── hooks/             # custom hooks
├── lib/               # المنطق (نقي قدر الإمكان):
│   ├── db.ts          # IndexedDB + المخطط + soft-delete + سلامة الروابط
│   ├── billing.ts     # الأقساط/الخصومات/الاستحقاق/تقادم الديون (دوال نقية)
│   ├── receipts.ts    # الإيصالات المتسلسلة والعدّادات
│   ├── printing.ts    # بناء HTML للطباعة RTL + مبلغ بالحروف
│   ├── cashbox.ts     # الخزينة والجلسات اليومية
│   ├── payroll.ts     # مرتبات المدرسين وربحية المجموعات
│   ├── schedule.ts    # الجدول وكشف التعارضات
│   ├── permissions.ts # مصفوفة الأدوار والصلاحيات والنطاق
│   ├── sheetImport.ts # محلّل شيت الإكسيل + المطابقة
│   ├── search.ts · trash.ts · waitlist.ts · messages.ts
│   ├── audit.ts · security.ts · storage.ts · dailyBackup.ts · autoBackup.ts
│   ├── supabase.ts    # المزامنة السحابية
│   └── utils.ts · settings.ts · notifications.ts · debtAlerts.ts
├── pages/             # 24 صفحة (Dashboard, Students, Teachers, Courses, Groups,
│                      #  Payments, Debtors, Treasury, Payroll, Timetable, Attendance,
│                      #  Exams, Expenses, Inventory, Reports, DailyReports, Messages,
│                      #  Trash, Users, Settings, AuditLog, StudentProfile, TeacherProfile, Login)
└── test/              # اختبارات Vitest
scripts/               # make-icons · make-sample-sheet · check-no-pii · purge-pii
public/                # manifest.json · sw.js · الأيقونات
build/                 # أيقونات Electron (icon.png/ico/icns)
electron/              # main.ts · preload.ts
.github/workflows/     # ci.yml
```

---

## 🛠️ التقنيات

React 19 · TypeScript · Vite (viteSingleFile) · Tailwind CSS 4 · React Router 7 · IndexedDB (idb) ·
Recharts · Lucide · Day.js · react-hot-toast · bcryptjs · xlsx · Supabase (اختياري) ·
Vitest + Testing Library · Electron + electron-builder · Docker/Nginx

> الطباعة والتصدير الورقي عبر **طباعة المتصفح** (`printing.ts`) — أزلنا `jspdf` لأن خرجه العربي كان مكسوراً.

---

## 🤖 CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) يشغّل عند كل push/PR:
typecheck → lint → test → **PII guard** → build، ويرفع `dist/index.html` كأثر.

---

## 📝 الترخيص

[MIT](LICENSE)

## 🤝 المساهمة

المساهمات مرحب بها — افتح Issue أو Pull Request.

---

صُنع بـ ❤️ للمراكز التعليمية العربية.
