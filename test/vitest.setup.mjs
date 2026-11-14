// Les globales de outils/test-run.mjs, pour que Vitest lise les mêmes tests.
import assert from 'node:assert/strict';
globalThis.assert = assert;
globalThis.group = () => {};
