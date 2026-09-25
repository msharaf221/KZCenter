import { describe, expect, it } from 'vitest';
import { generateBarcodeSvg, generateQrSvg, getStudentCode, playScanSound } from '../lib/barcode';

describe('Barcode & QR Utilities', () => {
  it('generates consistent student code from id or uses existing code', () => {
    expect(getStudentCode({ id: '12345678-abcd', code: 'STU-1001' })).toBe('STU-1001');
    expect(getStudentCode({ id: 'abc-def-123', code: '' })).toBe('STU-ABCDEF');
    expect(getStudentCode({ id: 'xyz-987' })).toBe('STU-XYZ987');
  });

  it('generates valid SVG barcode with Code 39 bars', () => {
    const svg = generateBarcodeSvg('STU-001', { height: 40 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<rect');
    expect(svg).toContain('STU-001');
  });

  it('generates barcode without text when showText is false', () => {
    const svg = generateBarcodeSvg('STU-002', { height: 40, showText: false });
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<text');
  });

  it('generates valid SVG QR code with corner finder patterns', () => {
    const qrSvg = generateQrSvg('STU-1001', { size: 100 });
    expect(qrSvg).toContain('<svg');
    expect(qrSvg).toContain('</svg>');
    expect(qrSvg).toContain('<rect');
    expect(qrSvg).toContain('viewBox=');
  });

  it('handles playScanSound safely without throwing in test environment', () => {
    expect(() => playScanSound('success')).not.toThrow();
    expect(() => playScanSound('already')).not.toThrow();
    expect(() => playScanSound('error')).not.toThrow();
  });
});
