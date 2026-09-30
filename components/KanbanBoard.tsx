"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Envuelve las columnas del Kanban y agrega una barra de scroll horizontal
 * FIJA al pie de la pantalla, sincronizada con el tablero. Así no hay que
 * bajar hasta el final de las tarjetas para scrollear en horizontal.
 */
export default function KanbanBoard({ children }: { children: React.ReactNode }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState({ left: 0, width: 0, content: 0, show: false });

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => {
      const rect = board.getBoundingClientRect();
      setBar({
        left: rect.left,
        width: rect.width,
        content: board.scrollWidth,
        show: board.scrollWidth > board.clientWidth + 4,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(board);
    const mo = new MutationObserver(update);
    mo.observe(board, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    const t = setTimeout(update, 200);
    return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener("resize", update); clearTimeout(t); };
  }, []);

  const fromBoard = () => { if (barRef.current && boardRef.current) barRef.current.scrollLeft = boardRef.current.scrollLeft; };
  const fromBar = () => { if (barRef.current && boardRef.current) boardRef.current.scrollLeft = barRef.current.scrollLeft; };

  return (
    <>
      <div className="kanban-board kanban-board-nobar" ref={boardRef} onScroll={fromBoard}>
        {children}
      </div>
      {bar.show && (
        <div
          className="kanban-hscroll"
          ref={barRef}
          onScroll={fromBar}
          style={{ left: bar.left, width: bar.width }}
        >
          <div style={{ width: bar.content, height: 1 }} />
        </div>
      )}
    </>
  );
}
