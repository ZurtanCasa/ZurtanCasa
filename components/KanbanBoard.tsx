"use client";
import { useEffect, useRef } from "react";

/**
 * Envuelve las columnas del Kanban. El tablero ocupa el alto disponible de la
 * pantalla, así su barra de scroll horizontal queda SIEMPRE visible al pie
 * (no hay que bajar hasta el final de las tarjetas). Las columnas scrollean
 * verticalmente por dentro, manteniendo los encabezados a la vista.
 */
export default function KanbanBoard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top;
      const h = window.innerHeight - top - 22; // dejar lugar para la barra
      el.style.height = Math.max(240, h) + "px";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    const t1 = setTimeout(fit, 150);
    const t2 = setTimeout(fit, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
      clearTimeout(t1); clearTimeout(t2);
    };
  }, []);

  return (
    <div className="kanban-board kanban-board-fit" ref={ref}>
      {children}
    </div>
  );
}
