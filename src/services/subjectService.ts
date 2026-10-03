import type { Subject, SubjectId } from '../lib/subjects';
import { getAllSubjects, normalizeSubjectText } from '../lib/subjects';

/**
 * توليد معرّف فريد ونظيف للمادة
 */
export function generateSubjectId(name: string): SubjectId {
  const norm = normalizeSubjectText(name).replace(/\s+/g, '_');
  const timestamp = Date.now().toString(36);
  return norm ? `${norm}_${timestamp}` : `sub_${timestamp}`;
}

/**
 * حفظ مادة (إضافة مادة جديدة أو تحديث مادة حالية)
 * ترجع قائمة `customSubjects` المحدثة لحفظها في الإعدادات
 */
export function saveSubject(
  subjectData: Partial<Subject> & { name: string },
  currentCustomSubjects: Subject[] = [],
): Subject[] {
  const customList = [...currentCustomSubjects];
  const isExisting = subjectData.id && getAllSubjects(customList).some(s => s.id === subjectData.id);

  if (isExisting && subjectData.id) {
    const existingIndex = customList.findIndex(s => s.id === subjectData.id);
    const updatedSubject: Subject = {
      id: subjectData.id,
      name: subjectData.name.trim(),
      nameEn: (subjectData.nameEn || '').trim(),
      monthlyPrice: Number(subjectData.monthlyPrice) || 0,
      category: (subjectData.category || 'عام').trim(),
      icon: subjectData.icon || '📚',
      color: subjectData.color || '#6366f1',
      description: (subjectData.description || '').trim(),
      aliases: subjectData.aliases || [subjectData.name, subjectData.nameEn || ''].filter(Boolean),
      isCustom: true,
      deleted: false,
    };

    if (existingIndex >= 0) {
      customList[existingIndex] = updatedSubject;
    } else {
      // Overriding a built-in subject
      customList.push(updatedSubject);
    }
  } else {
    // New subject
    const newId = subjectData.id || generateSubjectId(subjectData.name);
    const newSubject: Subject = {
      id: newId,
      name: subjectData.name.trim(),
      nameEn: (subjectData.nameEn || '').trim(),
      monthlyPrice: Number(subjectData.monthlyPrice) || 0,
      category: (subjectData.category || 'عام').trim(),
      icon: subjectData.icon || '📚',
      color: subjectData.color || '#6366f1',
      description: (subjectData.description || '').trim(),
      aliases: subjectData.aliases || [subjectData.name, subjectData.nameEn || ''].filter(Boolean),
      isCustom: true,
      deleted: false,
    };
    customList.push(newSubject);
  }

  return customList;
}

/**
 * حذف مادة دراسية (إزالتها إذا كانت مخصصة أو وضع علامة deleted إذا كانت مادة أساسية)
 */
export function removeSubject(
  id: SubjectId,
  currentCustomSubjects: Subject[] = [],
): Subject[] {
  const customList = [...currentCustomSubjects];
  const existingIndex = customList.findIndex(s => s.id === id);

  if (existingIndex >= 0) {
    // If it was already in customSubjects, mark as deleted
    customList[existingIndex] = {
      ...customList[existingIndex],
      deleted: true,
    };
  } else {
    // Built-in subject being hidden
    customList.push({
      id,
      name: id,
      nameEn: id,
      monthlyPrice: 0,
      category: 'عام',
      icon: '📚',
      color: '#6366f1',
      aliases: [],
      description: '',
      isCustom: false,
      deleted: true,
    });
  }

  return customList;
}
