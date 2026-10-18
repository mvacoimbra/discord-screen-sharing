"use client";

import { occupancyOf, PersonTile } from "./grid";
import { Screen } from "./screen";
import type { RoomConnection, RoomSnapshot } from "@/lib/room";

/**
 * O foco: uma tela grande, e o resto numa faixa horizontal embaixo.
 *
 * É o outro modo de ver a sala — o padrão é a grade (RF-AST-13). Quem escolhe é
 * quem assiste, pelo menu do "…".
 *
 * Telas primeiro, pessoas depois na faixa (RN-AST-10): tela é o que se olha,
 * pessoa é o que se confere.
 */
export function Stage({
  room,
  connection,
  myId,
  fullscreen,
  showWithoutVideo,
  focused,
  pinned,
  onFocus,
  onUnpin,
  onMenu,
  poppedOut,
}: {
  room: RoomSnapshot;
  connection: RoomConnection;
  myId: string;
  fullscreen: boolean;
  showWithoutVideo: boolean;
  focused: number | null;
  /** A tela fixada não é substituída sozinha quando outra some (RF-AST-16). */
  pinned: number | null;
  onFocus: (slot: number) => void;
  onUnpin: () => void;
  onMenu: (slot: number, userId: string, x: number, y: number) => void;
  /** O slot que está na janela destacada, se houver (RF-AST-19). */
  poppedOut: number | null;
}) {
  const watching = new Set(room.watching);
  const drawing = new Set(room.drawing);
  const personOf = (id: string) => room.participants.find((p) => p.id === id) ?? null;

  // Sempre há uma tela em destaque quando existe transmissão (RN-AST-9): chegar
  // numa sala com tela no ar e ver só avatares esconderia o que importa.
  // Fixada, ela não é substituída automaticamente; se sair do ar, o palco fica
  // vazio dizendo isso, em vez de trocar por outra pelas costas (RF-AST-16).
  const thePinned = pinned === null ? undefined : room.streams.find((s) => s.slot === pinned);
  if (pinned !== null && !thePinned) {
    return (
      <div className="grid h-full w-full place-items-center p-respiro text-center">
        <div>
          <p className="text-lg font-semibold text-texto">A tela fixada saiu do ar</p>
          <button
            type="button"
            onClick={onUnpin}
            className="mt-3 rounded-full bg-tile px-4 py-2 text-[14px] font-medium text-texto hover:bg-tile-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-texto"
          >
            Soltar
          </button>
        </div>
      </div>
    );
  }

  const onStage = thePinned ?? room.streams.find((s) => s.slot === focused) ?? room.streams[0] ?? null;
  if (!onStage) return null;

  const others = room.streams.filter((s) => s.slot !== onStage.slot);
  const withoutScreen = showWithoutVideo
    ? room.participants.filter((p) => !room.streams.some((s) => s.userId === p.id))
    : [];

  return (
    <div className="flex h-full w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Tela cheia é layout, não Fullscreen API (RN-AST-13): a Permissions
            Policy do iframe nega requestFullscreen, então o padding vai a zero
            e o raio some. Funciona nos dois contextos. */}
        <div className={`min-h-0 flex-1 ${fullscreen ? "p-0" : "px-respiro pt-respiro"}`}>
          <Screen
            slot={onStage.slot}
            person={personOf(onStage.userId)}
            connection={connection}
            watching={watching.has(onStage.slot)}
            drawing={drawing.has(onStage.slot)}
            isMe={onStage.userId === myId}
            kind={onStage.kind}
            onWatch={() => connection.watch(onStage.slot)}
            onStop={() => connection.unwatch(onStage.slot)}
            occupancy={occupancyOf(onStage.watchers.length)}
            connectionQuality={room.quality[onStage.slot]}
            poppedOut={poppedOut === onStage.slot}
            onMenu={(x, y) => onMenu(onStage.slot, onStage.userId, x, y)}
            zoomable
            className={`h-full w-full ${fullscreen ? "rounded-none border-0" : ""}`}
          />
        </div>

        {/* A faixa some em tela cheia: é ela que dá lugar à imagem. */}
        {fullscreen || (others.length === 0 && withoutScreen.length === 0) ? null : (
          <div className="flex shrink-0 justify-center gap-grade overflow-x-auto px-respiro pt-grade">
            {others.map((s) => (
              // Div, e não botão: o tile já traz um botão dentro. Ver a nota
              // em grade.tsx.
              <div
                key={s.slot}
                onDoubleClick={() => onFocus(s.slot)}
                className="h-[104px] w-[186px] shrink-0"
              >
                <Screen
                  slot={s.slot}
                  person={personOf(s.userId)}
                  connection={connection}
                  watching={watching.has(s.slot)}
                  drawing={drawing.has(s.slot)}
                  isMe={s.userId === myId}
                  kind={s.kind}
                  onWatch={() => connection.watch(s.slot)}
                  onStop={() => connection.unwatch(s.slot)}
                  onMenu={(x, y) => onMenu(s.slot, s.userId, x, y)}
                  compact
                  className="h-full w-full"
                />
              </div>
            ))}

            {withoutScreen.map((p) => (
              <PersonTile
                key={p.id}
                person={p}
                isMe={p.id === myId}
                compact
                className="h-[104px] w-[186px] shrink-0"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
