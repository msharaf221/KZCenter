/**
 * Security Tests
 * اختبارات الأمان
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  recordLoginAttempt,
  checkPasswordStrength,
  sanitizeInput,
  sanitizeObject,
  isSessionExpired,
  setSessionTimestamp,
  refreshSession,
  clearSession,
} from '../lib/security';

// Clear state between tests
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('Rate Limiting', () => {
  it('allows first attempt', () => {
    const result = checkRateLimit('test-user');
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBe(5);
  });

  it('tracks failed attempts', () => {
    recordLoginAttempt('test-user', false);
    recordLoginAttempt('test-user', false);
    const result = checkRateLimit('test-user');
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBe(3);
  });

  it('blocks after max attempts', () => {
    for (let i = 0; i < 5; i++) {
      recordLoginAttempt('test-user', false);
    }
    const result = checkRateLimit('test-user');
    expect(result.allowed).toBe(false);
    expect(result.remainingAttempts).toBe(0);
    expect(result.blockedUntil).toBeDefined();
  });

  it('resets on successful login', () => {
    recordLoginAttempt('test-user', false);
    recordLoginAttempt('test-user', false);
    recordLoginAttempt('test-user', true);
    const result = checkRateLimit('test-user');
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBe(5);
  });

  it('isolates different users', () => {
    for (let i = 0; i < 5; i++) {
      recordLoginAttempt('user1', false);
    }
    const user1 = checkRateLimit('user1');
    const user2 = checkRateLimit('user2');
    expect(user1.allowed).toBe(false);
    expect(user2.allowed).toBe(true);
  });
});

describe('Password Strength', () => {
  it('scores weak password', () => {
    const result = checkPasswordStrength('123');
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('scores medium password', () => {
    const result = checkPasswordStrength('password123');
    expect(result.score).toBeGreaterThanOrEqual(2);
  });

  it('scores strong password', () => {
    const result = checkPasswordStrength('MyP@ssw0rd!');
    expect(result.score).toBe(4);
  });

  it('provides suggestions', () => {
    const result = checkPasswordStrength('abc');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('returns label and color', () => {
    const result = checkPasswordStrength('test');
    expect(result.label).toBeDefined();
    expect(result.color).toBeDefined();
  });
});

describe('Input Sanitization', () => {
  it('removes HTML tags', () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).not.toContain('<script>');
  });

  it('removes javascript protocol', () => {
    expect(sanitizeInput('javascript:alert(1)')).not.toContain('javascript:');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('sanitizes object values', () => {
    const input = { name: '<b>Test</b>', age: 25 };
    const result = sanitizeObject(input);
    expect(result.name).not.toContain('<b>');
    expect(result.age).toBe(25);
  });
});

describe('Session Management', () => {
  it('detects expired session when no timestamp', () => {
    expect(isSessionExpired()).toBe(true);
  });

  it('detects valid session', () => {
    setSessionTimestamp();
    expect(isSessionExpired()).toBe(false);
  });

  it('refreshes session', () => {
    setSessionTimestamp();
    refreshSession();
    expect(isSessionExpired()).toBe(false);
  });

  it('clears session', () => {
    setSessionTimestamp();
    clearSession();
    expect(isSessionExpired()).toBe(true);
  });
});
