import '@testing-library/jest-dom/vitest';

// Polyfill ResizeObserver for recharts ResponsiveContainer in jsdom
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
