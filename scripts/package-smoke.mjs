import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const archive = resolve(process.argv[2] ?? '../projectmind-preview.tgz');
const root = mkdtempSync(join(tmpdir(), 'pm-package-'));
try {
  execFileSync('tar', ['-xzf', archive, '-C', root]);
  const pkgRoot = join(root, 'package');
  execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'], { cwd: pkgRoot, stdio: 'inherit' });
  const help = execFileSync(process.execPath, ['dist/apps/cli/src/index.js', '--help'], { cwd: pkgRoot, encoding: 'utf8' });
  if (!help.includes('intent bind')) throw new Error('Packaged CLI is incomplete');
  const target = join(root, 'consumer');
  mkdirSync(target);
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module', scripts: { test: 'node --test auth.test.js' } }));
  writeFileSync(join(target, 'auth.js'), 'export const login = (user) => Boolean(user && user.id);\n');
  writeFileSync(join(target, 'auth.test.js'), 'import test from "node:test"; import assert from "node:assert/strict"; import { login } from "./auth.js"; test("login", () => assert.equal(login({ id: "u1" }), true));\n');
  execFileSync('git', ['init', '-q'], { cwd: target });
  execFileSync('git', ['add', '.'], { cwd: target });
  execFileSync('git', ['-c', 'user.name=Package Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'consumer'], { cwd: target });
  const run = (...args) => execFileSync(process.execPath, [join(pkgRoot, 'dist/apps/cli/src/index.js'), ...args], { cwd: target, encoding: 'utf8' });
  run('init');
  run('intent', 'create', 'Login contract', '--require', 'Login succeeds');
  run('intent', 'bind', 'REQ-1', '--command', 'node --test --test-reporter=junit auth.test.js', '--test', 'login');
  const verified = run('verify');
  if (!verified.includes('\nVERIFIED\n')) throw new Error('Packaged verification failed');
  console.log('Packaged CLI scans and verifies a consumer repo with production dependencies only.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
