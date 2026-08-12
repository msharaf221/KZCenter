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

### البناء للإنتاج
```bash
npm run build
```

## 🔑 بيانات الدخول الافتراضية

| المستخدم | كلمة المرور | الدور |
|----------|-------------|-------|
| admin | admin123 | مسؤول |

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

## ☁️ التخزين السحابي (اختياري)

يدعم النظام Supabase للتخزين السحابي. للتفعيل:

1. أنشئ مشروع على [supabase.com](https://supabase.com)
2. شغل SQL Schema الموجود في الإعدادات
3. أضف متغيرات البيئة:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

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
├── lib/               # المكتبات والأدوات
│   ├── db.ts          # IndexedDB
│   ├── utils.ts       # وظائف مساعدة
│   ├── notifications.ts
│   ├── storage.ts
│   └── supabase.ts
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
│   ├── UsersPage.tsx
│   └── SettingsPage.tsx
├── App.tsx            # نقطة الدخول
├── main.tsx
└── index.css
```

## 🛠️ التقنيات المستخدمة

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS 4
- **State**: React Context API
- **Routing**: React Router v6
- **Storage**: IndexedDB (idb)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Dates**: Day.js
- **Notifications**: React Hot Toast
- **Auth**: bcryptjs
- **Export**: xlsx, jspdf

## 📝 الترخيص

MIT License

## 🤝 المساهمة

المساهمات مرحب بها! افتح Issue أو Pull Request.

---

صنع بـ ❤️ للمراكز التعليمية العربية
