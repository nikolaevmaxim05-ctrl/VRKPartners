// whenReady — викликає fire() коли аналітика готова (напр. window.gtag є функцією).
// Якщо ще не готова — чекає появи з інтервалом, з фолбеком по таймауту (maxAttempts).
//
// Винесено окремою чистою функцією САМЕ щоб ловити баг тайміну подій (як було з 404:
// подія летіла до готовності gtag і не доїжджала в GA4). Тестується в node без DOM
// через ін'єкцію таймерів.

export type WhenReadyOptions = {
  /** Інтервал перевірки готовності, мс (default 100). */
  intervalMs?: number;
  /** Скільки разів пробувати, далі fire() в будь-якому разі (default 40 ≈ 4 c). */
  maxAttempts?: number;
  /** Інʼєкція таймерів — для тестів. */
  setIntervalFn?: (cb: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
};

export function whenReady(
  isReady: () => boolean,
  fire: () => void,
  opts: WhenReadyOptions = {},
): () => void {
  const intervalMs = opts.intervalMs ?? 100;
  const maxAttempts = opts.maxAttempts ?? 40;
  const setI = opts.setIntervalFn ?? ((cb, ms) => setInterval(cb, ms));
  const clearI = opts.clearIntervalFn ?? ((id) => clearInterval(id));

  // Готово одразу — стріляємо синхронно
  if (isReady()) {
    fire();
    return () => {};
  }

  let attempts = 0;
  let done = false;

  const id = setI(() => {
    if (done) return;
    attempts += 1;
    if (isReady() || attempts >= maxAttempts) {
      done = true;
      clearI(id);
      fire();
    }
  }, intervalMs);

  // cleanup — скасовує очікування, якщо ще не вистрілило
  return () => {
    if (!done) {
      done = true;
      clearI(id);
    }
  };
}
