import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the pure TypeScript resolver in memory; no bundler or output files.
const source = readFileSync(new URL('../src/lib/navigation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { resolveDestination } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('schedule notifications open the correct role-specific view and schedule', () => {
  assert.deepEqual(resolveDestination('athlete', 'schedules/42'), { view: 'today', target: 42 });
  assert.deepEqual(resolveDestination('coach', 'schedules/42'), { view: 'schedules', target: 42 });
  assert.deepEqual(resolveDestination('trainer', 'schedules/42'), { view: 'sessions', target: 42 });
});

test('weather notifications work for all four roles', () => {
  for (const role of ['athlete', 'coach', 'trainer', 'admin']) {
    assert.equal(resolveDestination(role, 'weather').view, 'conditions');
  }
});

test('every role can open their operations register and account settings', () => {
  for (const role of ['athlete', 'coach', 'trainer', 'admin']) {
    assert.deepEqual(resolveDestination(role, 'operations/91'), { view: 'operations', target: 91 });
    assert.equal(resolveDestination(role, 'account').view, 'account');
  }
});

test('verification and result links preserve their result ID', () => {
  assert.deepEqual(resolveDestination('coach', 'verify/12'), { view: 'verify', target: 12 });
  assert.deepEqual(resolveDestination('trainer', 'verify/12'), { view: 'verify', target: 12 });
  assert.deepEqual(resolveDestination('athlete', 'history/12'), { view: 'history', target: 12 });
});

test('mobile destinations are available to their intended roles', () => {
  for (const [role, view] of [['athlete', 'history'], ['athlete', 'today'], ['trainer', 'sessions'], ['coach', 'equipment'], ['admin', 'members'], ['admin', 'membership']]) {
    assert.equal(resolveDestination(role, view).view, view);
  }
});

test('invalid hashes cannot open another role workspace or an external URL', () => {
  assert.equal(resolveDestination('athlete', '#membership').view, 'today');
  assert.equal(resolveDestination('coach', 'https://example.com').view, 'analytics');
  assert.equal(resolveDestination(undefined, 'members').view, '');
  assert.equal(resolveDestination('athlete', 'history/not-an-id').target, undefined);
});
