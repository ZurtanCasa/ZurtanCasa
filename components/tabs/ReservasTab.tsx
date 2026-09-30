"use client";
import { useEffect, useMemo, useState } from "react";

// ── Estados ──────────────────────────────────────────────────────────────────
const ESTADOS_ACTIVOS = [
  { key: "Pago y Sin Entregar",         color: "#22c55e" },
  { key: "Entregado y Sin Pagar",       color: "#eab308" },
  { key: "Pedido",                      color: "#ef4444" },
  { key: "Pago y No Llegó Mercadería",  color: "#f97316" },
  { key: "Saldo a Favor",               color: "#9ca3af" },
  { key: "S/F",                         color: "#d946ef" },
  { key: "Alfombras a Medida",          color: "#a855f7" },
  { key: "Préstamos",                   color: "#14b8a6" },
];
const ESTADO_ARCHIVADO = "Pago y Entregado";
const TODOS = [...ESTADOS_ACTIVOS.map((e) => e.key), ESTADO_ARCHIVADO];
const COLOR: Record<string, string> = Object.fromEntries(
  [...ESTADOS_ACTIVOS.map((e) => [e.key, e.color]), [ESTADO_ARCHIVADO, "#4f8ef7"]]
);

interface Reserva {
  id: string;
  nombre: string;
  celular: string;
  ci: string;
  direccion: string;
  articulos: string;
  sena: string;
  sena_devuelta: boolean;
  fecha_entrega: string;
  notas: string;
  estado: string;
  created_at: string;
  updated_at: string;
}

const VACIA = { nombre: "", celular: "", ci: "", direccion: "", articulos: "", sena: "", sena_devuelta: false, fecha_entrega: "", notas: "", estado: "S/F" };

function fmtFecha(f?: string) {
  if (!f) return "";
  const [y, m, d] = f.split("-");
  return d && m && y ? `${d}/${m}/${y}` : f;
}

// Ordena por fecha de entrega ascendente (más cercana primero); sin fecha al final.
function porFechaEntrega(cards: Reserva[]) {
  return [...cards].sort((a, b) => {
    const fa = a.fecha_entrega || "", fb = b.fecha_entrega || "";
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fa.localeCompare(fb);
  });
}

export default function ReservasTab() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"kanban" | "archivadas">("kanban");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<any>(VACIA);
  const [editId, setEditId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/reservas", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar");
      setReservas(data.reservas || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Error al cargar reservas");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const q = query.trim().toLowerCase();
  const match = (r: Reserva) =>
    !q || [r.nombre, r.celular, r.ci, r.articulos].some((v) => (v || "").toLowerCase().includes(q));

  const activas = useMemo(
    () => reservas.filter((r) => r.estado !== ESTADO_ARCHIVADO && match(r)),
    [reservas, q]
  );
  const archivadas = useMemo(
    () => reservas.filter((r) => r.estado === ESTADO_ARCHIVADO && match(r))
                  .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")),
    [reservas, q]
  );

  // ── Acciones ───────────────────────────────────────────────────────────────
  async function cambiarEstado(id: string, estado: string) {
    const prev = reservas;
    setReservas((rs) => rs.map((r) => (r.id === id ? { ...r, estado } : r))); // optimista
    try {
      const res = await fetch("/api/reservas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (e: any) {
      setReservas(prev);
      alert("No se pudo cambiar el estado: " + (e.message || ""));
    }
  }

  async function guardar() {
    if (!form.nombre.trim()) { alert("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/reservas", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: editId, ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      await load();
      setFormOpen(false);
      setForm(VACIA);
      setEditId(null);
    } catch (e: any) {
      alert("No se pudo guardar: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la reserva de "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/reservas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setReservas((rs) => rs.filter((r) => r.id !== id));
    } catch (e: any) {
      alert("No se pudo eliminar: " + (e.message || ""));
    }
  }

  function abrirNueva() { setForm(VACIA); setEditId(null); setFormOpen(true); }
  function abrirEditar(r: Reserva) {
    setForm({ nombre: r.nombre, celular: r.celular, ci: r.ci, direccion: r.direccion, articulos: r.articulos, sena: r.sena, sena_devuelta: !!r.sena_devuelta, fecha_entrega: r.fecha_entrega || "", notas: r.notas, estado: r.estado });
    setEditId(r.id);
    setFormOpen(true);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar */}
      <div className="reservas-toolbar">
        <div className="reservas-tabs">
          <button className={`reservas-tab-btn${view === "kanban" ? " active" : ""}`} onClick={() => setView("kanban")}>
            🗂️ Tablero <span className="reservas-badge">{reservas.filter((r) => r.estado !== ESTADO_ARCHIVADO).length}</span>
          </button>
          <button className={`reservas-tab-btn${view === "archivadas" ? " active" : ""}`} onClick={() => setView("archivadas")}>
            ✅ Archivadas <span className="reservas-badge">{reservas.filter((r) => r.estado === ESTADO_ARCHIVADO).length}</span>
          </button>
        </div>
        <input className="precios-search reservas-search" placeholder="Buscar por nombre, celular, CI, artículo…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="reserva-nueva-btn" onClick={abrirNueva}>+ Nueva reserva</button>
      </div>

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>Cargando reservas…</div>}
      {error && <div className="banner danger">⚠ {error}</div>}

      {/* ── Kanban ── */}
      {!loading && view === "kanban" && (
        <div className="kanban-board">
          {ESTADOS_ACTIVOS.map((col) => {
            let cards = activas.filter((r) => r.estado === col.key);
            // "Pago y Sin Entregar": ordenar por fecha de entrega más cercana primero
            if (col.key === "Pago y Sin Entregar") cards = porFechaEntrega(cards);
            return (
              <div
                key={col.key}
                className="kanban-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) cambiarEstado(dragId, col.key); setDragId(null); }}
              >
                <div className="kanban-col-header" style={{ borderTopColor: col.color }}>
                  <span className="kanban-dot" style={{ background: col.color }} />
                  <span className="kanban-col-title">{col.key}</span>
                  <span className="kanban-count">{cards.length}</span>
                </div>
                <div className="kanban-col-body">
                  {cards.map((r) => (
                    <ReservaCard
                      key={r.id}
                      r={r}
                      onDragStart={() => setDragId(r.id)}
                      onDragEnd={() => setDragId(null)}
                      onEstado={(e) => cambiarEstado(r.id, e)}
                      onEdit={() => abrirEditar(r)}
                      onDelete={() => eliminar(r.id, r.nombre)}
                    />
                  ))}
                  {cards.length === 0 && <div className="kanban-empty">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Archivadas ── */}
      {!loading && view === "archivadas" && (
        <div className="card">
          {archivadas.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>Todavía no hay reservas archivadas (Pago y Entregado).</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th><th>Celular</th><th>CI</th><th>Artículos</th><th>Seña</th><th>Fecha</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {archivadas.map((r) => (
                    <tr key={r.id}>
                      <td>{r.nombre}</td>
                      <td className="td-mono">{r.celular || "—"}</td>
                      <td className="td-mono">{r.ci || "—"}</td>
                      <td style={{ maxWidth: 260, whiteSpace: "normal" }}>{r.articulos || "—"}</td>
                      <td>{r.sena || "—"}</td>
                      <td className="td-mono" style={{ whiteSpace: "nowrap" }}>{(r.updated_at || "").slice(0, 10)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="reserva-link-btn" onClick={() => abrirEditar(r)}>Ver</button>
                        <button className="reserva-link-btn" onClick={() => cambiarEstado(r.id, "S/F")}>Restaurar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal formulario ── */}
      {formOpen && (
        <div className="reserva-modal-overlay" onClick={() => !saving && setFormOpen(false)}>
          <div className="reserva-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reserva-modal-header">
              <h3>{editId ? "Editar reserva" : "Nueva reserva"}</h3>
              <button className="reserva-modal-close" onClick={() => setFormOpen(false)}>✕</button>
            </div>

            <label className="reserva-field">
              <span>Estado</span>
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} style={{ borderLeft: `4px solid ${COLOR[form.estado]}` }}>
                {TODOS.map((e) => <option key={e} value={e}>{e}{e === ESTADO_ARCHIVADO ? " (archiva)" : ""}</option>)}
              </select>
            </label>

            <label className="reserva-field"><span>Nombre *</span>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus /></label>

            <div className="reserva-field-row">
              <label className="reserva-field"><span>Celular</span>
                <input value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} inputMode="tel" /></label>
              <label className="reserva-field"><span>CI</span>
                <input value={form.ci} onChange={(e) => setForm({ ...form, ci: e.target.value })} /></label>
            </div>

            <div className="reserva-field-row">
              <label className="reserva-field"><span>Dirección</span>
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></label>
              <label className="reserva-field"><span>Fecha de entrega (opcional)</span>
                <input type="date" value={form.fecha_entrega}
                  onChange={(e) => setForm({ ...form, fecha_entrega: e.target.value })}
                  onClick={(e) => (e.currentTarget as any).showPicker?.()} /></label>
            </div>

            <label className="reserva-field"><span>Artículos</span>
              <textarea rows={3} value={form.articulos} onChange={(e) => setForm({ ...form, articulos: e.target.value })} /></label>

            <div className="reserva-field-row">
              <label className="reserva-field"><span>Seña</span>
                <input value={form.sena} onChange={(e) => setForm({ ...form, sena: e.target.value })} placeholder="ej: US$ 100 / $5.000" /></label>
              <label className="reserva-field"><span>Notas</span>
                <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></label>
            </div>

            <label className="reserva-check">
              <input type="checkbox" checked={form.sena_devuelta} onChange={(e) => setForm({ ...form, sena_devuelta: e.target.checked })} />
              <span>Se devolvió la seña</span>
            </label>

            <div className="reserva-modal-actions">
              {editId && <button className="reserva-btn-danger" onClick={() => { setFormOpen(false); eliminar(editId, form.nombre); }} disabled={saving}>Eliminar</button>}
              <div style={{ flex: 1 }} />
              <button className="reserva-btn-cancel" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</button>
              <button className="reserva-btn-save" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : editId ? "Guardar" : "Crear reserva"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tarjeta ───────────────────────────────────────────────────────────────
function ReservaCard({ r, onDragStart, onDragEnd, onEstado, onEdit, onDelete }: {
  r: Reserva;
  onDragStart: () => void; onDragEnd: () => void;
  onEstado: (e: string) => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="reserva-card" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
         style={{ borderLeftColor: COLOR[r.estado] }}>
      <div className="reserva-card-top">
        <span className="reserva-card-nombre" onClick={onEdit} title="Editar">{r.nombre}</span>
        <button className="reserva-card-x" onClick={onDelete} title="Eliminar">✕</button>
      </div>
      {r.celular && <div className="reserva-card-line">📱 {r.celular}</div>}
      {r.articulos && <div className="reserva-card-line reserva-card-arts">🛋️ {r.articulos}</div>}
      {r.sena && <div className="reserva-card-line reserva-card-sena">💵 Seña: {r.sena}</div>}
      {r.sena_devuelta && <div className="reserva-card-line reserva-card-devuelta">↩️ Seña devuelta</div>}
      {r.fecha_entrega && <div className="reserva-card-line reserva-card-fecha">📅 Entrega: {fmtFecha(r.fecha_entrega)}</div>}
      <select className="reserva-card-estado" value={r.estado} onChange={(e) => onEstado(e.target.value)}>
        {TODOS.map((e) => <option key={e} value={e}>{e}{e === ESTADO_ARCHIVADO ? " (archivar)" : ""}</option>)}
      </select>
    </div>
  );
}
