/**
 * اختبارات كاتالوج المواد وأسعارها — src/lib/subjects.ts
 *
 * الأهم هنا: «ماث/math» (250) لازم **ما تتخلطش** بـ«حساب/رياضيات» بالعربي (200)،
 * لأن دي أكتر حاجة ممكن تغلط في الفلوس.
 */
import { describe, it, expect } from 'vitest';
import {
  SUBJECTS,
  DEFAULT_SUBJECT_PRICES,
  getSubject,
  matchSubject,
  matchSubjectId,
  normalizeSubjectText,
  subjectPrice,
  subjectsWithPrices,
} from '../lib/subjects';

describe('كاتالوج المواد', () => {
  it('فيه المواد الخمسة بأسعارها المعتمدة', () => {
    expect(SUBJECTS.map(s => s.id).sort()).toEqual(
      ['arabic', 'english', 'hesab', 'math', 'quran']
    );
    expect(DEFAULT_SUBJECT_PRICES).toEqual({
      english: 250,
      math: 250,
      hesab: 200,
      arabic: 200,
      quran: 200,
    });
  });

  it('كل مادة ليها اسم وأيقونة ولون ووصف', () => {
    for (const s of SUBJECTS) {
      expect(s.name.trim()).not.toBe('');
      expect(s.nameEn.trim()).not.toBe('');
      expect(s.icon.trim()).not.toBe('');
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(s.monthlyPrice).toBeGreaterThan(0);
    }
  });

  it('getSubject بترجّع undefined للمعرفات الغلط', () => {
    expect(getSubject('english')?.monthlyPrice).toBe(250);
    expect(getSubject('science')).toBeUndefined();
    expect(getSubject(undefined)).toBeUndefined();
    expect(getSubject(null)).toBeUndefined();
  });
});

describe('normalizeSubjectText', () => {
  it('بيوحّد الهمزات والتاء المربوطة والتشكيل', () => {
    expect(normalizeSubjectText('قُرْآن')).toBe('قران');
    expect(normalizeSubjectText('قرأن')).toBe('قران');
    expect(normalizeSubjectText('لغة عربيّة')).toBe('لغه عربيه');
  });

  it('بيصغّر اللاتيني ويشيل الرموز', () => {
    expect(normalizeSubjectText('S.R  (Level-3)')).toBe('s r level 3');
    expect(normalizeSubjectText('  MATH ')).toBe('math');
  });
});

describe('matchSubject — التمييز بين ماث والحساب', () => {
  it('«ماث» و«math» = مادة الماث بـ250', () => {
    for (const text of ['ماث', 'Math', 'MATHS', 'math 3', 'ماث الصف الرابع']) {
      const s = matchSubject(text);
      expect(s?.id, text).toBe('math');
      expect(s?.monthlyPrice).toBe(250);
    }
  });

  it('«حساب» و«رياضيات» بالعربي = مادة تانية بـ200', () => {
    for (const text of ['حساب', 'الحساب', 'رياضيات', 'مناهج حساب 2']) {
      const s = matchSubject(text);
      expect(s?.id, text).toBe('hesab');
      expect(s?.monthlyPrice).toBe(200);
    }
  });

  it('«english math» بتترجّح للماث (أطول alias الأول)', () => {
    expect(matchSubjectId('English Math')).toBe('math');
  });
});

describe('matchSubject — باقي المواد', () => {
  it('الإنجليزي بكل أشكاله في الشيتات', () => {
    for (const text of ['English', 'انجليزي', 'grammer 2', 's.r 1', 'level 3', 'phonics']) {
      expect(matchSubjectId(text), text).toBe('english');
    }
  });

  it('العربي والقراءة', () => {
    for (const text of ['عربي', 'لغة عربية', 'اقرا', 'نحو', 'Arabic']) {
      expect(matchSubjectId(text), text).toBe('arabic');
    }
  });

  it('القرآن بكل كتاباته', () => {
    for (const text of ['قرآن', 'قرأن', 'قران', 'تحفيظ', 'تجويد', 'Quran', 'القاعدة النورانية']) {
      expect(matchSubjectId(text), text).toBe('quran');
    }
  });

  it('بيرجّع null لو مفيش مادة واضحة', () => {
    expect(matchSubject('مجموعة 4')).toBeNull();
    expect(matchSubject('')).toBeNull();
    expect(matchSubject(undefined, null)).toBeNull();
  });

  it('بيجرّب النصوص بالترتيب (اسم المجموعة الأول)', () => {
    expect(matchSubjectId('قرآن السبت', 'ماث')).toBe('quran');
    expect(matchSubjectId('مجموعة 4', 'ماث')).toBe('math');
  });

  it('ما بيطابقش جزء من كلمة تانية', () => {
    // «حسابات المركز» فيها «حسابات» وهي alias مقصودة، لكن «مناهج» مش مادة
    expect(matchSubject('مناهج')).toBeNull();
  });
});

describe('subjectPrice', () => {
  it('بيرجّع الافتراضي من غير تعديلات', () => {
    expect(subjectPrice('english')).toBe(250);
    expect(subjectPrice('quran', null)).toBe(200);
  });

  it('بيستخدم تعديل المستخدم لما يكون صالح', () => {
    expect(subjectPrice('english', { english: 300 })).toBe(300);
    expect(subjectPrice('math', { english: 300 })).toBe(250);
  });

  it('بيتجاهل القيم الغلط ويرجع للافتراضي', () => {
    expect(subjectPrice('arabic', { arabic: 0 })).toBe(200);
    expect(subjectPrice('arabic', { arabic: -50 })).toBe(200);
    expect(subjectPrice('arabic', { arabic: NaN })).toBe(200);
  });

  it('subjectsWithPrices بترجّع كل المواد بأسعارها الفعلية', () => {
    const rows = subjectsWithPrices({ hesab: 220 });
    expect(rows).toHaveLength(5);
    expect(rows.find(r => r.id === 'hesab')?.price).toBe(220);
    expect(rows.find(r => r.id === 'english')?.price).toBe(250);
  });
});
