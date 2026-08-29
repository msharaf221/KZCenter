# 🎓 EduCenter Pro - نظام إدارة المركز التعليمي

نظام متكامل لإدارة المراكز التعليمية ومراكز الدروس الخصوصية، مبني بـ React + TypeScript + Tailwind CSS.

## ✨ المميزات

### 👨‍🎓 إدارة الطلاب
- إضافة/تعديل/حذف الطلاب
- البحث والتصفية بالاسم والحالة
- استيراد/تصدير CSV
- عرض ملف شامل للطالب

### 👨‍🏫 إدارة المدرسين
- إدارة بيانات المدرسين
- عرض إحصائيات (عدد المجموعات والطلاب)
- تتبع الرواتب والحالة

### 📚 إدارة الكورسات والمستويات
- إنشاء كورسات متعددة
- إضافة مستويات ديناميكية لكل كورس
- تخصيص الأسعار والألوان والأيقونات

### 👥 إدارة المجموعات
- ربط المجموعات بالكورسات والمدرسين
- إعداد الجدول الزمني
- إدارة سعة المجموعات

### 💰 نظام المدفوعات
- تسجيل الدفعات (اشتراكات، كتب، أخرى)
- تتبع الحالة (مدفوع، معلق، متأخر)
- حساب تلقائي لإجمالي مدفوعات الطالب
- تصدير إلى CSV

### 💸 إدارة المصروفات
- تسجيل المصروفات بالفئات
- رسوم بيانية توضيحية
- تتبع الأرباح والخسائر

### ✅ نظام الحضور
- تسجيل حضور/غياب/تأخير/استئذان
- تسجيل وقت الدخول والخروج
- عرض ملخص الحضور

### 📝 الاختبارات والدرجات
- إنشاء اختبارات للمجموعات
- إدخال درجات الطلاب
- عرض متوسط الدرجات

### 📊 التقارير والإحصائيات
- لوحة تحكم شاملة
- رسوم بيانية متنوعة
- تصدير إلى PDF/CSV

### 🔐 نظام المستخدمين والصلاحيات
- تسجيل دخول آمن (bcrypt)
- صلاحيات (مسؤول/مدرس)
- إدارة المستخدمين

### ⚙️ الإعدادات
- تخصيص اسم المركز
- اختيار الألوان والخطوط
- إعدادات الإشعارات
- نسخ احتياطي (تصدير/استيراد JSON)

### 🆕 المميزات الجديدة

#### 🔒 أمان متقدم
- **Rate Limiting**: حماية من هجمات brute force على صفحة الدخول (5 محاولات ثم حظر 5 دقائق)
- **Session Expiry**: انتهاء صلاحية الجلسة تلقائياً بعد 8 ساعات
- **تغيير كلمة المرور الإجباري**: يُطلب تغيير كلمة المرور الافتراضية فور الدخول الأول
- **Password Strength**: مؤشر قوة كلمة المرور مع اقتراحات
- **RLS Policies**: سياسات أمان على مستوى الصفوف في Supabase

#### 📋 سجل المراجعة (Audit Log)
- تسجيل جميع العمليات (إنشاء، تعديل، حذف، دخول، خروج)
- بحث وتصفية السجلات
- تصدير السجل إلى CSV
- إحصائيات سريعة

#### 🌍 نظام التعريب (i18n)
- دعم اللغتين العربية والإنجليزية
- تغيير الاتجاه تلقائياً (RTL/LTR)
- ملفات ترجمة منفصلة

#### 🚀 تحسينات الأداء
- **Lazy Loading**: تحميل الصفحات عند الحاجة فقط
- **Debounce للبحث**: تأخير البحث 300ms لتحسين الأداء
- **Custom Hooks**: فصل المنطق عن الواجهة

#### 💾 النسخ الاحتياطي التلقائي
- تنبيه تلقائي بعد أسبوع بدون نسخ احتياطي
- حساب حجم البيانات

#### 📱 PWA Support
- إمكانية التثبيت كتطبيق على الموبايل
- manifest.json كامل
- Service Worker (جاهز للتفعيل)

#### 🧪 اختبارات
- **67 اختبار** يغطون: الأدوات، الأمان، الهوكات، التعريب، النسخ الاحتياطي
- Vitest + Testing Library
- Coverage reports

#### 🐳 DevOps
- **Dockerfile**: بناء Docker multi-stage
- **docker-compose.yml**: تشغيل سهل
- **nginx.conf**: إعدادات Nginx محسنة مع security headers
- **CI/CD Pipeline**: GitHub Actions (lint → test → build → deploy)

#### 🛡️ RLS Policies محسنة
- سياسات أمان مفصلة لكل دور (admin/teacher)
- عزل البيانات بين المستخدمين

## 🚀 التشغيل

### المتطلبات
- Node.js 18+
- npm أو yarn

### التثبيت
```bash
npm install
```

### التطوير
```bash
npm run dev
```

### الاختبارات
```bash
npm run test           # تشغيل الاختبارات
npm run test:watch     # تشغيل مع مراقبة
npm run test:coverage  # تغطية الاختبارات
```

### البناء للإنتاج
```bash
npm run build
```

### Docker
```bash
docker-compose up -d
```

## 🔑 بيانات الدخول الافتراضية

| المستخدم | كلمة المرور | الدور |
|----------|-------------|-------|
| admin | admin123 | مسؤول |

> ⚠️ **مهم**: سيتم طلب تغيير كلمة المرور الافتراضية فور أول تسجيل دخول.

## 🗄️ قاعدة البيانات

النظام يستخدم **IndexedDB** للتخزين المحلي في المتصفح.

### الجداول
- `students` - الطلاب
- `teachers` - المدرسون
- `courses` - الكورسات
- `groups` - المجموعات
- `payments` - المدفوعات
- `attendance` - الحضور
- `expenses` - المصروفات
- `exams` - الاختبارات
- `grades` - الدرجات
- `users` - المستخدمون
- `settings` - الإعدادات
- `inventory` - المخزون
- `inventory_transactions` - حركات المخزون

## ☁️ التخزين السحابي (اختياري)

يدعم النظام Supabase للتخزين السحابي. للتفعيل:

1. أنشئ مشروع على [supabase.com](https://supabase.com)
2. شغل `supabase_schema.sql` في SQL Editor (يفعّل RLS تلقائياً)
3. انسخ `.env.example` باسم `.env` وأضف القيم:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

> 🔒 **أمان**: لا تضع المفاتيح في الكود أبداً. ملف `.env` مستثنى من Git تلقائياً. لا تعطّل RLS على الجداول — بدونها أي شخص معه الـ anon key يستطيع قراءة وتعديل كل البيانات.

> ⚠️ **تنبيه**: البيانات محفوظة محلياً في متصفحك (IndexedDB). مسح بيانات المتصفح يعني فقدان كل البيانات — احرص على النسخ الاحتياطي الدوري من صفحة الإعدادات.

## 📁 هيكل المشروع

```
src/
├── components/         # المكونات
│   ├── layout/        # التخطيط (Sidebar, Header)
│   ├── ui/            # عناصر واجهة المستخدم
│   └── ProtectedRoute.tsx
├── contexts/          # React Contexts
│   ├── AuthContext.tsx
│   └── AppContext.tsx
├── hooks/             # Custom Hooks
│   └── index.ts
├── i18n/              # نظام التعريب
│   ├── index.ts
│   └── locales/       # ملفات الترجمة
│       ├── ar.json
│       └── en.json
├── lib/               # المكتبات والأدوات
│   ├── db.ts          # IndexedDB
│   ├── utils.ts       # وظائف مساعدة
│   ├── security.ts    # أدوات الأمان
│   ├── notifications.ts
│   ├── storage.ts
│   ├── supabase.ts
│   └── autoBackup.ts
├── pages/             # الصفحات
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── StudentsPage.tsx
│   ├── TeachersPage.tsx
│   ├── CoursesPage.tsx
│   ├── GroupsPage.tsx
│   ├── PaymentsPage.tsx
│   ├── AttendancePage.tsx
│   ├── ExpensesPage.tsx
│   ├── ExamsPage.tsx
│   ├── ReportsPage.tsx
│   ├── DailyReportsPage.tsx
│   ├── UsersPage.tsx
│   ├── SettingsPage.tsx
│   ├── AuditLogPage.tsx
│   ├── StudentProfilePage.tsx
│   └── TeacherProfilePage.tsx
├── test/              # الاختبارات
│   ├── setup.ts
│   ├── utils.test.ts
│   ├── security.test.ts
│   ├── hooks.test.ts
│   ├── i18n.test.ts
│   └── autoBackup.test.ts
├── App.tsx            # نقطة الدخول
├── main.tsx
└── index.css
```

## 🛠️ التقنيات المستخدمة

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS 4
- **State**: React Context API
- **Routing**: React Router v6/v7
- **Storage**: IndexedDB (idb)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Dates**: Day.js
- **Notifications**: React Hot Toast
- **Auth**: bcryptjs
- **Export**: xlsx, jspdf
- **Testing**: Vitest, Testing Library
- **DevOps**: Docker, GitHub Actions

## 🤖 CI/CD

ملف GitHub Actions جاهز في `.github/workflows/ci.yml` — يشمل:
- TypeScript type checking
- ESLint
- Unit tests
- Build verification
- Docker build
- GitHub Pages deployment

## 📝 الترخيص

MIT License

## 🤝 المساهمة

المساهمات مرحب بها! افتح Issue أو Pull Request.

---

صنع بـ ❤️ للمراكز التعليمية العربية
