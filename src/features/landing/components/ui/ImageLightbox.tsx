"use client";

// Полноэкранный лайтбокс изображения (шаг 3b мобильных анимаций): открывается тапом по миниатюре
// услуги там, где нет hover-превью (тач / < sm). Механика модалки — как в Dialog (Escape, блокировка
// прокрутки body, фокус на крестик и возврат на кнопку-триггер, fade 200 мс).
// Собственный масштаб без библиотек (решение владельца; нативный щипок масштабировал бы всю страницу):
// щипок двумя пальцами 1×–MAX_SCALE, двойной тап 1× ↔ DOUBLE_TAP_SCALE, перетаскивание одним
// пальцем при увеличении; всё через transform картинки (без layout), pointer events.
import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useSiteMessages } from "@/features/landing/lib/messages";

const EXIT_MS = 220;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

type Pt = { x: number; y: number };

interface ImageLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  /** Элемент, которому вернуть фокус после закрытия (кнопка-триггер). */
  returnFocusTo?: HTMLElement | null;
}

export function ImageLightbox({ open, onClose, src, alt, returnFocusTo }: ImageLightboxProps) {
  const { form } = useSiteMessages();
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const imgRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(open);
  const [visible, setVisible] = React.useState(false);

  // Состояние масштаба — в ref (запись transform напрямую, без ре-рендеров на каждое движение пальца).
  const state = React.useRef({ scale: 1, tx: 0, ty: 0 });
  const pointers = React.useRef(new Map<number, Pt>());
  const gesture = React.useRef<{ dist: number; scale: number; mid: Pt; tx: number; ty: number } | null>(null);
  const drag = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTap = React.useRef(0);

  const applyTransform = React.useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const { scale, tx, ty } = state.current;
    el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  }, []);

  const resetZoom = React.useCallback(() => {
    state.current = { scale: 1, tx: 0, ty: 0 };
    applyTransform();
  }, [applyTransform]);

  /** Сдвиг ограничивается так, чтобы картинка не уезжала за пределы экрана дальше своего края. */
  const clampPan = (scale: number, tx: number, ty: number): Pt => {
    const el = imgRef.current;
    if (!el) return { x: tx, y: ty };
    const maxX = Math.max(0, (el.clientWidth * (scale - 1)) / 2);
    const maxY = Math.max(0, (el.clientHeight * (scale - 1)) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, tx)), y: Math.min(maxY, Math.max(-maxY, ty)) };
  };

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      resetZoom();
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open, resetZoom]);

  // Escape, блокировка прокрутки страницы, фокус на крестик; возврат фокуса на триггер.
  React.useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const trigger = returnFocusTo;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      trigger?.focus?.();
    };
  }, [mounted, onClose, returnFocusTo]);

  // Рендерим в body (портал): в DOM лайтбокс лежит внутри окна услуг, а маска окна (< sm) создаёт
  // stacking context — без портала fixed-слой оказывался бы под шапкой и обрезался маской.
  if (!mounted || typeof document === "undefined") return null;

  const onPointerDown = (e: React.PointerEvent) => {
    // Без совместимых mouse-событий: фокус остаётся на крестике, выделение/drag картинки не стартуют.
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2) {
      // Начало щипка: запоминаем расстояние и центр.
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gesture.current = {
        dist,
        scale: state.current.scale,
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        tx: state.current.tx,
        ty: state.current.ty,
      };
      drag.current = null;
    } else if (pts.length === 1) {
      drag.current = { x: e.clientX, y: e.clientY, tx: state.current.tx, ty: state.current.ty };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2 && gesture.current) {
      const g = gesture.current;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = Math.min(MAX_SCALE, Math.max(1, (g.scale * dist) / Math.max(1, g.dist)));
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const pan = clampPan(scale, g.tx + (mid.x - g.mid.x), g.ty + (mid.y - g.mid.y));
      state.current = { scale, tx: pan.x, ty: pan.y };
      applyTransform();
    } else if (pts.length === 1 && drag.current && state.current.scale > 1) {
      const d = drag.current;
      const pan = clampPan(state.current.scale, d.tx + (e.clientX - d.x), d.ty + (e.clientY - d.y));
      state.current = { ...state.current, tx: pan.x, ty: pan.y };
      applyTransform();
    }
  };

  /** Находится ли точка тапа в пределах отрисованной картинки (object-contain с отступом 8px). */
  const insideImage = (x: number, y: number): boolean => {
    const el = imgRef.current;
    const img = el?.querySelector("img");
    if (!el || !img || !img.naturalWidth || !img.naturalHeight) return true;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const boxW = Math.max(1, r.width - pad * 2);
    const boxH = Math.max(1, r.height - pad * 2);
    const k = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight) * state.current.scale;
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    const cx = r.left + r.width / 2 + state.current.tx;
    const cy = r.top + r.height / 2 + state.current.ty;
    return Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = drag.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8 : true;
      if (moved) return;
      const now = Date.now();
      const onImage = insideImage(e.clientX, e.clientY);
      if (onImage && now - lastTap.current < DOUBLE_TAP_MS) {
        // Двойной тап по картинке — переключатель масштаба (приближение к точке тапа).
        lastTap.current = 0;
        if (state.current.scale > 1) resetZoom();
        else {
          const r = imgRef.current?.getBoundingClientRect();
          const cx = r ? e.clientX - (r.left + r.width / 2) : 0;
          const cy = r ? e.clientY - (r.top + r.height / 2) : 0;
          const pan = clampPan(DOUBLE_TAP_SCALE, -cx * (DOUBLE_TAP_SCALE - 1), -cy * (DOUBLE_TAP_SCALE - 1));
          state.current = { scale: DOUBLE_TAP_SCALE, tx: pan.x, ty: pan.y };
          applyTransform();
        }
      } else if (onImage) {
        lastTap.current = now;
      } else {
        // Тап по фону (вне картинки) — закрыть.
        onClose();
      }
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-lightbox
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-black/90 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={form.closeLabel}
        className="btn-focus absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/40 transition-colors hover:bg-black/90"
      >
        <X className="h-6 w-6" />
      </button>
      <div
        ref={imgRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-full w-full select-none touch-none will-change-transform"
        style={{ transformOrigin: "center" }}
      >
        <Image src={src} alt={alt} fill sizes="100vw" className="pointer-events-none object-contain p-2" draggable={false} />
      </div>
    </div>,
    document.body
  );
}
