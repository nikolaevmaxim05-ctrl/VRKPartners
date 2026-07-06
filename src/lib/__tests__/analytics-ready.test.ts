// Тест whenReady — ловить баг тайміну подій (як було з 404):
// подія НЕ повинна летіти, поки аналітика не готова.

import { describe, it, expect, vi } from "vitest";
import { whenReady } from "@/lib/analytics-ready";

describe("whenReady", () => {
  it("готово одразу → fire() синхронно один раз", () => {
    const fire = vi.fn();
    whenReady(() => true, fire);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("НЕ готово → fire() НЕ викликається одразу (це і є баг 404)", () => {
    const fire = vi.fn();
    let ready = false;
    whenReady(() => ready, fire, { setIntervalFn: () => 0 as unknown as ReturnType<typeof setInterval> });
    // Жодного тіку ще не було — подія не мусила вистрілити
    expect(fire).not.toHaveBeenCalled();
  });

  it("стріляє щойно стане готово", () => {
    vi.useFakeTimers();
    try {
      const fire = vi.fn();
      let ready = false;
      whenReady(() => ready, fire, { intervalMs: 100 });

      vi.advanceTimersByTime(100);
      expect(fire).not.toHaveBeenCalled(); // ще не готово

      ready = true;
      vi.advanceTimersByTime(100);
      expect(fire).toHaveBeenCalledTimes(1); // зʼявився gtag → стрельнуло
    } finally {
      vi.useRealTimers();
    }
  });

  it("фолбек: стріляє після maxAttempts навіть якщо так і не готово", () => {
    vi.useFakeTimers();
    try {
      const fire = vi.fn();
      whenReady(() => false, fire, { intervalMs: 100, maxAttempts: 3 });
      vi.advanceTimersByTime(100 * 3);
      expect(fire).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleanup до готовності → fire() не викликається", () => {
    vi.useFakeTimers();
    try {
      const fire = vi.fn();
      let ready = false;
      const cleanup = whenReady(() => ready, fire, { intervalMs: 100 });
      cleanup();
      ready = true;
      vi.advanceTimersByTime(1000);
      expect(fire).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
