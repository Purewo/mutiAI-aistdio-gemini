import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [sourceRepo, fromRevision, toRevision, targetFile] = process.argv.slice(2);

if (!sourceRepo || !fromRevision || !toRevision || !targetFile) {
  throw new Error(
    'Usage: node scripts/apply-openapi-delta.mjs <source-repo> <from-revision> <to-revision> <target-file>',
  );
}

function readRevision(revision) {
  return JSON.parse(
    execFileSync(
      'git',
      ['-C', sourceRepo, 'show', `${revision}:contracts/openapi/openapi.v1.json`],
      { encoding: 'utf8' },
    ),
  );
}

function applyChangedEntries(target, before, after, section) {
  const oldEntries = before[section];
  const newEntries = after[section];
  const targetEntries = target[section];

  for (const key of new Set([...Object.keys(oldEntries), ...Object.keys(newEntries)])) {
    const oldValue = oldEntries[key];
    const newValue = newEntries[key];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

    if (newValue === undefined) delete targetEntries[key];
    else targetEntries[key] = newValue;
  }
}

const before = readRevision(fromRevision);
const after = readRevision(toRevision);
const target = JSON.parse(readFileSync(targetFile, 'utf8'));

applyChangedEntries(target, before, after, 'paths');
applyChangedEntries(
  target.components,
  before.components,
  after.components,
  'schemas',
);

writeFileSync(targetFile, `${JSON.stringify(target, null, 2)}\n`, 'utf8');
