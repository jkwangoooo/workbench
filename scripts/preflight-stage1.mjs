#!/usr/bin/env node
// Controlled preflight: accepts only an explicit JSON fixture path and prints counts.
// It never writes files, calls a database, or prints student values.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const inputPath = process.argv[2];
if (!inputPath || inputPath.includes('private-data') || !path.isAbsolute(inputPath)) {
  console.error('Usage: node scripts/preflight-stage1.mjs /absolute/path/to/redacted-fixture.json');
  process.exit(2);
}
const payload = JSON.parse(await readFile(inputPath, 'utf8'));
const existing = Array.isArray(payload.existing) ? payload.existing : [];
const incoming = Array.isArray(payload.incoming) ? payload.incoming : [];
const classId = String(payload.classId || '8');
const keys = new Map();
for (const row of existing.filter((item) => item.classId === classId)) {
  for (const key of [row.provincialStudentNo && `p:${row.provincialStudentNo.trim()}`, row.identityDocumentNo && `i:${row.identityDocumentNo.trim()}`].filter(Boolean)) keys.set(key, row.id);
}
const seen = new Set(); let added = 0; let matched = 0; let conflicts = 0;
for (const row of incoming.filter((item) => item.classId === classId)) {
  if (classId !== '8' && row.profile && Object.keys(row.profile).length) { conflicts += 1; continue; }
  const matches = [...new Set([row.provincialStudentNo && keys.get(`p:${row.provincialStudentNo.trim()}`), row.identityDocumentNo && keys.get(`i:${row.identityDocumentNo.trim()}`)].filter(Boolean))];
  if (matches.length > 1) conflicts += 1;
  else if (matches.length) { matched += 1; seen.add(matches[0]); }
  else added += 1;
}
const missing = existing.filter((item) => item.classId === classId && !seen.has(item.id)).length;
console.log(JSON.stringify({ added, matched, missing, conflicts }));
