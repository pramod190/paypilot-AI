// Runs before every test file. DOM matchers are only registered when a DOM exists (component tests).
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}
