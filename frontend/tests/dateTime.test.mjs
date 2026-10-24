import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/dateTime.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { utcDate, localInput, toUtcISOString } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('MySQL timestamps without an offset are interpreted as UTC', () => {
  assert.equal(utcDate('2027-01-02T00:30:00').toISOString(), '2027-01-02T00:30:00.000Z');
  assert.equal(utcDate('2027-01-02T06:00:00+05:30').toISOString(), '2027-01-02T00:30:00.000Z');
});
test('session date input round-trips through local timezone without shifting time', () => {
  assert.equal(toUtcISOString(localInput('2027-01-02T00:30:00')), '2027-01-02T00:30:00.000Z');
});
