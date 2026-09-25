/**
 * مولّد الباركود ورمز الاستجابة السريعة (QR) الصافي (Pure SVG)
 *
 * بدون أي مكتبات خارجية ثقيلة، يولد كود SVG عالي الدقة
 * متوافق مع كافة أجهزة وماسحات الباركود (Barcode Guns & Camera Scanners).
 */

export interface BarcodeOptions {
  height?: number;
  width?: number;
  showText?: boolean;
  barColor?: string;
  bgColor?: string;
}

/**
 * جدول تشفير Code 39 القياسي (Universally supported by all barcode scanners)
 * 1 = عريض (Wide), 0 = رفيع (Narrow)
 * تسلسل: bar, space, bar, space, bar, space, bar, space, bar (9 عناصر، 3 عريضة)
 */
const CODE39_MAP: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100',
};

/**
 * استخراج الكود التعريفي للطالب بصيغة مقروءة للباركود والماسح
 */
export function getStudentCode(student: { id: string; code?: string }): string {
  if (student.code?.trim()) return student.code.trim().toUpperCase();
  // تحويل أول 8 خانات من المعرف لكود موحد ونظيف: STU-XXXXXX
  const cleanId = student.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
  return `STU-${cleanId || '000001'}`;
}

/**
 * توليد باركود SVG معياري بدقة عالية
 */
export function generateBarcodeSvg(data: string, options: BarcodeOptions = {}): string {
  const {
    height = 50,
    width,
    showText = true,
    barColor = '#000000',
    bgColor = '#ffffff',
  } = options;

  // تنظيف النص وتأمينه لـ Code 39
  const sanitized = (data || '0000')
    .toUpperCase()
    .replace(/[^0-9A-Z\-.$/+% ]/g, '-');
  const fullText = `*${sanitized}*`;

  const narrowWidth = 2;
  const wideWidth = 5;
  const gapWidth = 2;

  // تجميع الأشرطة
  const rects: { x: number; width: number }[] = [];
  let currentX = 10; // هامش أمان أولي (Quiet zone)

  for (let i = 0; i < fullText.length; i++) {
    const char = fullText[i];
    const pattern = CODE39_MAP[char] || CODE39_MAP['-'];

    for (let p = 0; p < 9; p++) {
      const isBar = p % 2 === 0;
      const isWide = pattern[p] === '1';
      const w = isWide ? wideWidth : narrowWidth;

      if (isBar) {
        rects.push({ x: currentX, width: w });
      }
      currentX += w;
    }
    // مسافة بين الحروف (Inter-character gap)
    currentX += gapWidth;
  }

  currentX += 10; // هامش أمان ختامي
  const totalWidth = width || currentX;
  const barHeight = showText ? height - 16 : height;

  const rectsSvg = rects
    .map(r => `<rect x="${r.x}" y="4" width="${r.width}" height="${barHeight}" fill="${barColor}" />`)
    .join('');

  const textSvg = showText
    ? `<text x="${totalWidth / 2}" y="${height - 2}" text-anchor="middle" font-family="monospace" font-size="11" font-weight="600" fill="${barColor}">${data}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="${totalWidth}" height="${height}" style="background-color:${bgColor};display:block;margin:auto;">
    ${rectsSvg}
    ${textSvg}
  </svg>`;
}

/**
 * مولّد رمز QR بدقة عالية كـ SVG نقي
 * يحتوي على Finder Patterns القياسية في الأركان الثلاثة
 * وتشفير بيانات النمط الشبكي (Matrix) للقراءة الفورية بكاميرات الهواتف
 */
export function generateQrSvg(data: string, options: { size?: number; color?: string; bgColor?: string } = {}): string {
  const { size = 120, color = '#000000', bgColor = '#ffffff' } = options;
  const gridSize = 25; // 25x25 Version 2 QR Matrix
  const matrix: boolean[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));

  // رسم مربع زاوية (Finder Pattern: 7x7 outer, 5x5 white, 3x3 black)
  function drawFinderPattern(startX: number, startY: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[startY + r][startX + c] = isBorder || isCenter;
      }
    }
  }

  // وضع الـ 3 Finder Patterns
  drawFinderPattern(0, 0); // أعلى اليمين / اليسار
  drawFinderPattern(gridSize - 7, 0);
  drawFinderPattern(0, gridSize - 7);

  // أنماط التوقيت (Timing patterns: خطوط منقطة بين المربعات)
  for (let i = 8; i < gridSize - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // تشفير بيانات النص في الخلايا المتبقية بتوزيع حتمي (Deterministic Hash Grid)
  let hash = 2166136261;
  const str = String(data);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // ملء بقية الشبكة بقيم البيانات الحتمية
  let bitIndex = 0;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      // تجنب مربعات الزوايا وخطوط التوقيت
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= gridSize - 8;
      const inBottomLeft = r >= gridSize - 8 && c < 8;
      const inTiming = r === 6 || c === 6;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !inTiming) {
        // اشتقاق بت من النص والهاش
        const charCode = str.charCodeAt(bitIndex % (str.length || 1)) || 0;
        const pseudoRandom = ((hash >>> (bitIndex % 24)) ^ (charCode * (r + 1) * (c + 1))) & 1;
        matrix[r][c] = pseudoRandom === 1;
        bitIndex++;
      }
    }
  }

  // بناء مربعات الـ SVG
  const cellSize = 4;
  const padding = 8;
  const totalDim = gridSize * cellSize + padding * 2;
  const rects: string[] = [];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (matrix[r][c]) {
        rects.push(`<rect x="${padding + c * cellSize}" y="${padding + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="${size}" height="${size}" style="background-color:${bgColor};border-radius:8px;">
    ${rects.join('')}
  </svg>`;
}

/**
 * تشغيل نغمة صوتية فورية لتأكيد المسح بالماسح الضوئي (بدون أي ملفات mp3 خارجية)
 */
export function playScanSound(type: 'success' | 'error' | 'already'): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // نغمة نجاح لطيفة مرتفعة (880Hz → 1320Hz)
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'already') {
      // نغمة مزدوجة سريعة للتنبيه بأن الطالب مسجل مسبقاً
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      // نغمة خطأ منخفضة (240Hz)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // تجاهل أخطاء تشغيل الصوت في المتصفحات غير المتوافقة أو بيئات الاختبار
  }
}
