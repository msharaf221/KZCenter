import type { SheetParseResult, TableParseResult } from '../../domain/imports/types';
import { parseAnyTable, parseSheetBuffer } from '../../services/imports/readFiles';
import type { FilePreview } from './useFilePreview';

export async function readTablePreview(file: File): Promise<FilePreview<TableParseResult>> {
  const result = await parseAnyTable({ name: file.name, buffer: await file.arrayBuffer() });
  if (!result.records.length)
    return { parsed: null, warning: 'مفيش سجلات في الملف — لازم يكون فيه عمود لاسم الطالب على الأقل' };
  return {
    parsed: result,
    warning: result.looksLikeTable
      ? undefined
      : 'الملف مش شكله جدول سجلات — جرّب «استيراد شيت إكسيل» لو ده شيت المركز القديم',
  };
}

export async function readSheetPreview(file: File): Promise<FilePreview<SheetParseResult>> {
  const result = await parseSheetBuffer(await file.arrayBuffer());
  if (!result.teachers.length)
    return { parsed: null, warning: 'مفيش مدرسين أو طلاب في الشيت — اتأكد إنه نفس شكل شيت المركز' };
  if (!result.looksLikeCenterSheet)
    return {
      parsed: null,
      warning: 'الملف ده مش شيت المركز — العناوين لازم يكون فيها اليوم والميعاد (مثال: «s.r 1 السبت من 4/5»)',
    };
  return { parsed: result };
}
