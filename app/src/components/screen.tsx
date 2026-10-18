"use client";

import { useEffect, useRef } from "react";

import { Avatar } from "./avatar";
import type { RoomConnection } from "@/lib/room";
import { MAX_ZOOM, MIN_ZOOM, useZoom } from "@/lib/zoom";
import type { Person } from "@/lib/types";

/**
 * O tile de uma transmissão, nos três estados que ele tem (RN-AST-16), nesta
 * ordem de precedência:
 *
 *   1. Vídeo    — a transmissão está sendo assistida
 *   2. Convite  — está no ar mas não foi pedida ("Assistir tela")
 *   3. Avatar   — a pessoa não transmite
 *
 * O canvas **não é criado aqui**. Ele vive no RoomConnection e é apenas movido
 * para dentro deste nó (RN-AST-17): detachar não apaga o conteúdo nem invalida
 * o contexto 2D, então trocar o palco não faz a imagem piscar nem custa um
 * decodificador novo.
 */
export function Screen({
  slot,
  person,
  connection,
  watching,
  drawing,
  isMe,
  kind = "screen",
  quality,
  occupancy,
  connectionQuality,
  poppedOut = false,
  compact = false,
  zoomable = false,
  onWatch,
  onStop,
  onMenu,
  className = "",
}: {
  slot: number;
  person: Person | null;
  connection: RoomConnection;
  watching: boolean;
  drawing: boolean;
  isMe: boolean;
  /** Tela ou câmera (RF-CAM-1) — só muda o ícone do selo de nome. */
  kind?: "screen" | "camera";
  /** "1080P 30FPS", quando se sabe. Vai no canto do tile, como no Discord. */
  quality?: string | null;
  /** "9/12" quando a transmissão passa de 75% do teto (RF-AST-12). */
  occupancy?: string | null;
  /** Boa, instável ou ruim — o resumo do que o painel detalha (RF-AST-17). */
  connectionQuality?: 'good' | 'unstable' | 'bad' | undefined;
  /** O canvas está na janela destacada, então aqui não há o que mostrar. */
  poppedOut?: boolean;
  /** Na faixa de miniaturas o tile tem 186×104 — avatar e botão em tamanho
   *  cheio não cabem e atropelam o nome. */
  compact?: boolean;
  /** Só a tela grande do palco amplia: na grade o duplo clique já é "pôr no
   *  palco", e numa miniatura não há o que ver de perto. */
  zoomable?: boolean;
  onWatch: () => void;
  onStop: () => void;
  /** Botão direito no tile: abre o menu de contexto (RF-AST-8). */
  onMenu?: (x: number, y: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const zoomArea = useRef<HTMLDivElement>(null);
  const canZoom = zoomable && watching && drawing && !poppedOut;
  const { zoom, zoomIn, zoomOut, reset } = useZoom(zoomArea, canZoom, slot);
  const zoomed = zoom.scale > 1;

  useEffect(() => {
    if (!watching) return;
    const canvas = connection.canvasFor(slot);
    const target = box.current;
    if (!canvas || !target) return;

    target.appendChild(canvas);
    // Não removemos o canvas na limpeza: ele pertence à conexão, e tirá-lo daqui
    // é trabalho de quem o receber a seguir. Apagar seria perder o conteúdo.
    return undefined;
  }, [watching, connection, slot, drawing]);

  const name = person?.name ?? "Alguém";

  return (
    <div
      onContextMenu={
        onMenu && watching
          ? (e) => {
              e.preventDefault();
              onMenu(e.clientX, e.clientY);
            }
          : undefined
      }
      className={
        // Preto só depois do primeiro quadro: é o fundo certo atrás de vídeo.
        // Antes disso o tile usa --tile, senão ele some no preto da página —
        // e some justamente durante a espera, que é quando a pessoa mais
        // precisa ver que há um tile ali.
        //
        // Sem borda: o Discord marca quem está no ar com o selo vermelho "AO
        // VIVO", não com moldura. A borda verde de RN-UI-4 vinha do projeto
        // antigo e, no palco, virava um retângulo verde em volta de tudo que se
        // está olhando.
        "relative grid min-h-0 place-items-center overflow-hidden rounded-tile " +
        (drawing ? "bg-fundo " : "bg-tile ") +
        className
      }
    >
      {/* Qualidade e "no ar" no canto de cima, sobre a imagem — é onde o
          Discord os põe, e é o canto que menos carrega informação da tela. */}
      <span className={`pointer-events-none absolute z-10 flex items-center gap-1.5 ${compact ? "top-1 right-1" : "top-2 right-2"}`}>
        {/* Três estados, derivados do que já é medido (RF-AST-17). O painel ⓘ
            continua existindo para o número exato — este é o resumo
            (RN-AST-35). */}
        {connectionQuality && connectionQuality !== "good" ? (
          <span
            title={connectionQuality === "bad" ? "Conexão ruim" : "Conexão instável"}
            className={
              "grid size-5 place-items-center rounded-full bg-black/65 text-[11px] backdrop-blur-[8px] " +
              (connectionQuality === "bad" ? "text-perigo" : "text-atencao")
            }
          >
            <span className="sr-only">
              {connectionQuality === "bad" ? "Conexão ruim" : "Conexão instável"}
            </span>
            <span aria-hidden="true">▲</span>
          </span>
        ) : null}

        {/* A recusa por lotação não pode chegar de surpresa (RF-AST-12). */}
        {occupancy ? (
          <span className="rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-atencao backdrop-blur-[8px]">
            {occupancy} assistindo
          </span>
        ) : null}
        {quality ? (
          <span className="rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-texto backdrop-blur-[8px]">
            {quality}
          </span>
        ) : null}
        <span className={`rounded bg-perigo-solido font-semibold tracking-wide text-white ${compact ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[11px]"}`}>
          AO VIVO
        </span>
      </span>

      {watching ? (
        <>
          {/* Invisível até o primeiro quadro: o canvas nasce em 300×150 e
              pintado de preto, e esse retângulo no meio do tile parece defeito
              — justamente durante a espera que RF-AST-5 quer explicar. */}
          {/* A área que escuta roda e arraste não se move; quem amplia é o nó
              de dentro. Medir no nó transformado daria o retângulo já
              ampliado, e o zoom fugiria do cursor. */}
          <div
            ref={zoomArea}
            className={
              "relative h-full w-full min-h-0 overflow-hidden " +
              (canZoom ? "touch-none " : "") +
              (canZoom && zoomed ? "cursor-grab active:cursor-grabbing" : "")
            }
          >
            <div
              ref={box}
              style={
                zoomed
                  ? {
                      transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                      transformOrigin: "0 0",
                    }
                  : undefined
              }
              className={`relative grid h-full w-full min-h-0 place-items-center ${drawing ? "" : "invisible"}`}
            />
          </div>
          {canZoom ? (
            <div
              role="group"
              aria-label="Zoom da tela"
              className="absolute right-2 bottom-2 z-10 flex items-center gap-0.5 rounded-full bg-black/65 p-0.5 text-texto backdrop-blur-[8px]"
            >
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoom.scale <= MIN_ZOOM}
                aria-label="Diminuir zoom"
                className="grid size-7 place-items-center rounded-full text-[16px]/none hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-texto"
              >
                −
              </button>
              <button
                type="button"
                onClick={reset}
                title="Voltar ao tamanho original (ou duplo clique na tela)"
                aria-label={`Zoom em ${Math.round(zoom.scale * 100)}%. Voltar ao tamanho original`}
                className="h-7 min-w-12 rounded-full px-1.5 text-[12px] font-semibold tabular-nums hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-texto"
              >
                {Math.round(zoom.scale * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoom.scale >= MAX_ZOOM}
                aria-label="Aumentar zoom"
                className="grid size-7 place-items-center rounded-full text-[16px]/none hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-texto"
              >
                +
              </button>
            </div>
          ) : null}
          {/* Entre pedir para assistir e o primeiro quadro cabe um keyframe
              inteiro de espera, e um tile parado é indistinguível de um
              travamento (RF-AST-5). O giro para com prefers-reduced-motion. */}
          {/* O canvas é um nó só: se ele está na outra janela, não há imagem
              aqui — e dizer isso é melhor que um retângulo preto (RN-AST-36). */}
          {poppedOut ? (
            <span className="absolute inset-0 grid place-items-center bg-tile text-suave">
              Assistindo na janela destacada
            </span>
          ) : null}
          {!drawing && !poppedOut ? (
            <span className="absolute inset-0 grid place-items-center gap-3 text-suave">
              <span className="grid justify-items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-6 animate-spin rounded-full border-2 border-linha border-t-suave motion-reduce:animate-none"
                />
                Conectando…
              </span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={onStop}
            aria-label={`Parar de assistir ${name}`}
            className="absolute top-2 left-2 z-10 grid size-7 place-items-center rounded-full bg-black/65 text-texto backdrop-blur-[8px] hover:bg-perigo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-texto"
          >
            ×
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onWatch}
          // Sem aria-label: o nome vem do conteúdo, porque o texto visível do botão
          // (as iniciais do avatar e "Assistir a tela") tem que estar contido no
          // nome acessível (WCAG 2.5.3) — um aria-label divergia disso. O avatar
          // fica fora do nome (o `alt` da foto entraria nele: "<nome> Assistir
          // tela"), e "de <nome>" vai num trecho só para leitor de tela, porque
          // "Assistir a tela" sozinho não diz de quem é.
          className="grid h-full w-full place-items-center gap-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-acento"
        >
          <span className="grid place-items-center gap-3">
            {person ? (
              <span aria-hidden="true" className="contents">
                <Avatar
                  id={person.id}
                  name={person.name}
                  avatar={person.avatar}
                  className={compact ? "w-9! text-[13px]!" : ""}
                />
              </span>
            ) : null}
            {/* Na miniatura o rótulo visível sai: em 186×104 ele encavala o nome, e
                o tile inteiro já é o botão. O nome para o leitor de tela fica. */}
            {compact ? (
              <span className="sr-only">{isMe ? "Ver minha tela" : `Assistir a tela de ${name}`}</span>
            ) : (
              <span className="rounded-full bg-acento px-4 py-2 text-[14px]/none font-medium text-white">
                {isMe ? "Ver minha tela" : "Assistir a tela"}
                {isMe ? null : <span className="sr-only"> de {name}</span>}
              </span>
            )}
          </span>
        </button>
      )}

      <span
        className={
          "absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded bg-black/65 backdrop-blur-[8px] " +
          (compact ? "px-1.5 py-0.5" : "px-2 py-1")
        }
      >
        <span aria-hidden="true" className="shrink-0 text-suave">
          {kind === "camera" ? (
            <svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current [stroke-width:2]">
              <rect x="2" y="6" width="14" height="12" rx="2" />
              <path d="M16 10.5 22 7v10l-6-3.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current [stroke-width:2]">
              <rect x="2" y="4" width="20" height="13" rx="2" />
              <path d="M8 21h8" />
            </svg>
          )}
        </span>
        <span className={`truncate font-medium text-texto ${compact ? "text-[11px]" : "text-[13px]"}`}>
          {name}
          {isMe ? " (você)" : ""}
        </span>
      </span>
    </div>
  );
}
