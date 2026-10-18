import { useEffect, useState, type RefObject } from 'react';

/**
 * Zoom e arraste sobre a tela no palco, como o Discord faz na transmissão.
 *
 *   roda do mouse / pinça no trackpad   amplia no ponto do cursor
 *   pinça com dois dedos (toque)         idem, no meio dos dedos
 *   arrastar com a imagem ampliada       move o recorte
 *   duplo clique                         volta ao tamanho original
 *
 * A transformação vai no nó que embrulha o canvas, nunca no canvas: ele é da
 * conexão e passeia entre tiles (RN-AST-17), e levaria o zoom junto.
 *
 * Translação e escala com `transform-origin: 0 0`, presas para a imagem
 * nunca descolar da borda: ampliada, ela sempre cobre o tile inteiro.
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
const STEP = 1.25;

export interface Zoom {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Zoom = { scale: 1, x: 0, y: 0 };

function clamp(z: Zoom, width: number, height: number): Zoom {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z.scale));
  if (scale === 1) return IDENTITY;
  return {
    scale,
    x: Math.min(0, Math.max(width - width * scale, z.x)),
    y: Math.min(0, Math.max(height - height * scale, z.y)),
  };
}

const bound = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

/** Nova escala ancorada em (px, py), relativo ao canto do nó. */
function zoomAt(z: Zoom, scale: number, px: number, py: number): Zoom {
  const ratio = scale / z.scale;
  return { scale, x: px - (px - z.x) * ratio, y: py - (py - z.y) * ratio };
}

export function useZoom(target: RefObject<HTMLElement | null>, enabled: boolean, resetKey: unknown) {
  const [zoom, setZoom] = useState<Zoom>(IDENTITY);

  // Trocar de tela no palco, ou parar de assistir, volta ao enquadramento
  // original: o recorte de uma tela não diz nada sobre a outra. Ajuste
  // durante o render, e não em efeito, para não pintar um quadro com o zoom
  // velho na tela nova.
  const key = `${String(resetKey)}:${enabled}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setZoom(IDENTITY);
  }

  useEffect(() => {
    const el = target.current;
    if (!el || !enabled) return;

    // Sempre atualização funcional: os ouvintes nativos vivem enquanto o tile
    // vive, e um valor capturado na criação deles estaria velho no segundo
    // evento.
    const update = (change: (z: Zoom) => Zoom) =>
      setZoom((z) => clamp(change(z), el.clientWidth, el.clientHeight));

    const local = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    // Não-passivo: a pinça do trackpad chega como `wheel` com ctrlKey, e sem
    // preventDefault o navegador amplia a página inteira junto.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Pinça manda deltas pequenos e frequentes; a roda, poucos e grandes.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const p = local(e.clientX, e.clientY);
      update((z) => zoomAt(z, bound(z.scale * factor), p.x, p.y));
    };

    // Ponteiros ativos: um arrasta, dois fazem pinça.
    const pointers = new Map<number, { x: number; y: number }>();
    const pair = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? { a, b } : null;
    };
    let lastDistance = 0;

    const onDown = (e: PointerEvent) => {
      // Só o botão principal; o direito é do menu de contexto (RF-AST-8). E
      // nunca sobre botão: o "×" e os controles de zoom continuam clicáveis.
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      const both = pair();
      if (both) lastDistance = Math.hypot(both.a.x - both.b.x, both.a.y - both.b.y);
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const both = pair();
      if (both) {
        const d = Math.hypot(both.a.x - both.b.x, both.a.y - both.b.y);
        const ratio = lastDistance > 0 ? d / lastDistance : 1;
        lastDistance = d;
        const mid = local((both.a.x + both.b.x) / 2, (both.a.y + both.b.y) / 2);
        update((z) => zoomAt(z, bound(z.scale * ratio), mid.x, mid.y));
      } else {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        update((z) => (z.scale > 1 ? { ...z, x: z.x + dx, y: z.y + dy } : z));
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
    };

    const onDoubleClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      setZoom(IDENTITY);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('dblclick', onDoubleClick);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('dblclick', onDoubleClick);
    };
  }, [target, enabled]);

  /** Botões: ampliam pelo centro, que é o que se espera sem cursor. */
  const step = (direction: 1 | -1) => {
    const el = target.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    setZoom((z) => clamp(zoomAt(z, bound(direction === 1 ? z.scale * STEP : z.scale / STEP), w / 2, h / 2), w, h));
  };

  return {
    zoom,
    zoomIn: () => step(1),
    zoomOut: () => step(-1),
    reset: () => setZoom(IDENTITY),
  };
}
