import assert from 'node:assert/strict';
import test from 'node:test';

import { exceedsSizeLimit } from '../scripts/check-artifact-size.mjs';

test('artifact size failure requires both limits to be exceeded', () => {
  const baseline = 30_000_000;
  assert.equal(exceedsSizeLimit(baseline + 524_288, baseline), false);
  assert.equal(exceedsSizeLimit(baseline + 524_289, baseline), false);
  assert.equal(exceedsSizeLimit(baseline + 600_001, baseline), true);
});

test('artifact size boundaries are strict', () => {
  const baseline = 10_000_000;
  assert.equal(exceedsSizeLimit(baseline + 524_288, baseline), false);
  assert.equal(exceedsSizeLimit(baseline + 524_289, baseline), true);
});
