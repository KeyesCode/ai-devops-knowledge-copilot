/**
 * Memory debugging utilities
 */

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  heapUsedMB: string;
  heapTotalMB: string;
  externalMB: string;
  rssMB: string;
}

/**
 * Get current memory usage in a readable format
 */
export function getMemoryUsage(): MemoryUsage {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
    heapUsedMB: (usage.heapUsed / 1024 / 1024).toFixed(2),
    heapTotalMB: (usage.heapTotal / 1024 / 1024).toFixed(2),
    externalMB: (usage.external / 1024 / 1024).toFixed(2),
    rssMB: (usage.rss / 1024 / 1024).toFixed(2),
  };
}

/**
 * Format memory usage as a string
 */
export function formatMemoryUsage(usage: MemoryUsage): string {
  return `Heap: ${usage.heapUsedMB}MB / ${usage.heapTotalMB}MB | RSS: ${usage.rssMB}MB | External: ${usage.externalMB}MB`;
}

/**
 * Calculate memory delta between two measurements
 */
export function getMemoryDelta(before: MemoryUsage, after: MemoryUsage): {
  heapUsedDelta: string;
  heapTotalDelta: string;
  rssDelta: string;
} {
  return {
    heapUsedDelta: ((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2),
    heapTotalDelta: ((after.heapTotal - before.heapTotal) / 1024 / 1024).toFixed(2),
    rssDelta: ((after.rss - before.rss) / 1024 / 1024).toFixed(2),
  };
}

/**
 * Force garbage collection if available (requires --expose-gc flag)
 */
export function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

