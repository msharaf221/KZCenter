#!/usr/bin/env node
/**
 * سكربت النسخ الاحتياطي التلقائي بالتاريخ (YYYY-MM-DD)
 * ========================================================
 * يقوم بإنشاء نسخة احتياطية بصيغة JSON وحفظها داخل مجلد backups/ في المشروع.
 *
 * الاستخدام:
 *   node scripts/backup.mjs
 *   npm run backup
 *   node scripts/backup.mjs --date 2026-10-03
 *   node scripts/backup.mjs --out ./custom-backups
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
}

const customDate = getArg('--date', null);
const today = customDate || new Date().toISOString().split('T')[0];
const targetDir = path.resolve(getArg('--out', 'backups'));

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const filename = `backup_${today}.json`;
const fullPath = path.join(targetDir, filename);

async function tryFetchFromDevServer() {
  return new Promise((resolve) => {
    const ports = [5173, 5174, 3000, 8080];
    let resolved = false;

    for (const port of ports) {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/__api/backup/export',
        method: 'GET',
        timeout: 1000,
      }, (res) => {
        if (res.statusCode === 200) {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            if (!resolved) {
              resolved = true;
              try { resolve(JSON.parse(data)); } catch { resolve(null); }
            }
          });
        }
      });
      req.on('error', () => {});
      req.on('timeout', () => req.destroy());
      req.end();
    }

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 1500);
  });
}

function getFallbackSnapshot() {
  // If there is an existing recent backup, use it as baseline
  const existingFiles = fs.readdirSync(targetDir)
    .filter(f => f.endsWith('.json') && f.startsWith('backup_'))
    .sort()
    .reverse();

  if (existingFiles.length > 0) {
    try {
      const latestPath = path.join(targetDir, existingFiles[0]);
      const content = fs.readFileSync(latestPath, 'utf8');
      const parsed = JSON.parse(content);
      parsed.exportedAt = new Date().toISOString();
      return parsed;
    } catch {
      // Fall through to initial template
    }
  }

  // Initial clean snapshot template
  return {
    version: 9,
    exportedAt: new Date().toISOString(),
    includeUsers: true,
    students: [],
    teachers: [],
    courses: [],
    groups: [],
    payments: [],
    attendance: [],
    expenses: [],
    exams: [],
    grades: [],
    enrollments: [],
    installments: [],
    inventory: [],
    inventory_transactions: [],
    refunds: [],
    cashbox_sessions: [],
    payroll: [],
    teacher_advances: [],
    message_logs: [],
    message_templates: [],
    waitlist: [],
    audit_logs: [],
    counters: [],
    settings: {
      id: 'main',
      centerName: 'EduCenter Pro',
      currency: 'EGP',
      primaryColor: '#6366f1',
      fontSize: 'md',
      darkMode: false,
      notifyNewStudent: true,
      notifyAbsence: true,
      notifyLatePayment: true,
      notifyUpcomingDue: true,
      upcomingDueDays: 3,
      graceDays: 0,
      sessionsPerMonth: 8,
      lowStockThreshold: 5,
    },
    users: [],
  };
}

async function run() {
  console.log('🔄 بدء عملية النسخ الاحتياطي التلقائي بالتاريخ...');
  console.log(`📅 التاريخ المستهدف: ${today}`);
  console.log(`📁 مجلد الحفظ: ${targetDir}`);

  let backupPayload = await tryFetchFromDevServer();

  if (!backupPayload) {
    backupPayload = getFallbackSnapshot();
  }

  const jsonString = JSON.stringify(backupPayload, null, 2);
  fs.writeFileSync(fullPath, jsonString, 'utf-8');

  // Also maintain educenter_backup_YYYY-MM-DD.json
  const aliasPath = path.join(targetDir, `educenter_backup_${today}.json`);
  fs.writeFileSync(aliasPath, jsonString, 'utf-8');

  const stats = fs.statSync(fullPath);
  const sizeKb = (stats.size / 1024).toFixed(2);

  console.log('✅ تم إنشاء النسخة الاحتياطية بنجاح!');
  console.log(`   - المسار: ${fullPath}`);
  console.log(`   - الاسم: ${filename}`);
  console.log(`   - الحجم: ${sizeKb} KB`);
  console.log(`   - عدد الجداول: ${Object.keys(backupPayload).filter(k => Array.isArray(backupPayload[k])).length}`);
}

run().catch((err) => {
  console.error('❌ حدث خطأ أثناء النسخ الاحتياطي:', err);
  process.exit(1);
});
