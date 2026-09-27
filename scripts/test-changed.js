#!/usr/bin/env node
// Runs only the checks the changed files can affect. Changes come from git (working tree vs
// HEAD plus untracked), or from paths passed as arguments. `--dry` prints the plan only.
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const explicit = args.filter((a) => !a.startsWith('--'));

function changedFiles() {
  if (explicit.length) return explicit;
  try {
    const run = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    return [...run('git diff --name-only HEAD'), ...run('git ls-files --others --exclude-standard')];
  } catch {
    console.error('Not a git checkout and no paths given: pass the changed paths as arguments.');
    process.exit(2);
  }
}

// Order matters only for output. Each check runs at most once.
const CHECKS = {
  typecheck: { cmd: 'npx tsc --noEmit', why: 'TypeScript API' },
  lint: { cmd: 'npx eslint src/', why: 'TypeScript API' },
  jest: { cmd: 'CI=1 npx jest', why: 'rule builders, presets, replay parsing' },
  swiftCore: { cmd: 'sh scripts/test-ios-core.sh', why: 'Swift core behaviour and golden traces' },
  kotlinCore: { cmd: 'sh scripts/test-android-core.sh', why: 'Kotlin core behaviour and golden traces' },
  example: { cmd: 'npx --prefix example tsc --noEmit -p example', why: 'example app types' },
};

const RULES = [
  [/^src\//, ['typecheck', 'lint', 'jest']],
  [/^ios\/(Core|Tests)\//, ['swiftCore']],
  [/^android\/src\/(main\/java\/expo\/modules\/bodyvision\/core|test)\//, ['kotlinCore']],
  [/^android\/core-tests\//, ['kotlinCore']],
  // Fixtures and presets are shared by both cores and the JS preset test.
  [/^fixtures\/|^scripts\/generate-fixtures\.js$/, ['swiftCore', 'kotlinCore', 'jest']],
  [/^example\//, ['example']],
];

const MANUAL = [
  [/^ios\/[^/]+\.(swift|podspec)$/, 'iOS shell changed: build the example (npm run example:ios) and run the relevant Maestro tag'],
  [/^android\/(src\/main\/java\/expo\/modules\/bodyvision\/[^/]+\.kt|build\.gradle)$/, 'Android shell changed: build the example (npm run example:android) and run the relevant Maestro tag'],
  [/^maestro\//, 'Maestro flows changed: run them with npm run test:e2e'],
  [/^app\.plugin\.js$/, 'Config plugin changed: run expo prebuild --clean in example/'],
];

const files = changedFiles();
const planned = new Set();
const notes = new Set();
for (const f of files) {
  for (const [re, checks] of RULES) if (re.test(f)) checks.forEach((c) => planned.add(c));
  for (const [re, note] of MANUAL) if (re.test(f)) notes.add(note);
}

console.log(`${files.length} changed file(s).`);
if (!planned.size) console.log('No automated checks affected.');
for (const name of Object.keys(CHECKS).filter((c) => planned.has(c))) {
  const check = CHECKS[name];
  console.log(`\n> ${check.cmd}   (${check.why})`);
  if (dry) continue;
  const result = spawnSync(check.cmd, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n${name} failed.`);
    process.exit(result.status ?? 1);
  }
}
for (const note of notes) console.log(`\nNot run: ${note}.`);
