"use client";
import { useEffect, useMemo, useState } from "react";

// Columnas del embudo (color = etapa)
const ESTADOS = [
  { key: "Interesado",                  color: "#4f8ef7" },
  { key: "Se llevó anotadas",           color: "#06b6d4" },
  { key: "No concretó",                 color: "#6b7280" },
  { key: "Dejó separadas para probar",  color: "#a855f7" },
  { key: "Precio no le convenció",      color: "#f97316" },
  { key: "En seguimiento",              color: "#eab308" },
  { key: "Compró",                      color: "#22c55e" },
];
const KEYS = ESTADOS.map((e) => e.key);
const CERRADOS = ["Compró", "No concretó"];
const VENDEDORES = ["Nico", "Nacho", "Clara", "María", "Gerardo"];

// Color de la tarjeta según el estado de la próxima acción
const ACCION: Record<string, { color: string; icon: string; label: string }> = {
  aldia:   { color: "#22c55e", icon: "🟢", label: "Al día" },
  sin:     { color: "#eab308", icon: "🟡", label: "Sin acción definida" },
  vencida: { color: "#ef4444", icon: "🔴", label: "Acción vencida" },
  cerrado: { color: "#2a2f3a", icon: "",   label: "" },
};

interface Lead {
  id: string;
  nombre: string;
  celular: string;
  interes: string;
  vendedor: string;
  proxima_accion: string;
  fecha_accion: string;
  notas: string;
  estado: string;
  created_at: string;
  updated_at: string;
}

const VACIO = { nombre: "", celular: "", interes: "", vendedor: "", proxima_accion: "", fecha_accion: "", notas: "", estado: "Interesado" };

function hoyISO() { return new Date().toISOString().slice(0, 10); }
function fmtFecha(f?: string) {
  if (!f) return "";
  const [y, m, d] = f.split("-");
  return d && m && y ? `${d}/${m}/${y}` : f;
}
function accionKey(l: Lead): string {
  if (CERRADOS.includes(l.estado)) return "cerrado";
  if (!l.fecha_accion) return "sin";
  return l.fecha_accion < hoyISO() ? "vencida" : "aldia";
}
function ordenarLeads(leads: Lead[], estado: string) {
  if (CERRADOS.includes(estado)) return leads;
  const rank: Record<string, number> = { vencida: 0, aldia: 1, sin: 2 };
  return [...leads].sort((a, b) => {
    const ra = rank[accionKey(a)] ?? 3, rb = rank[accionKey(b)] ?? 3;
    if (ra !== rb) return ra - rb;
    const fa = a.fecha_accion || "", fb = b.fecha_accion || "";
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fa.localeCompare(fb);
  });
}

export default function CrmTab() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(VACIO);
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/crm", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar");
      setLeads(data.leads || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Error al cargar el CRM");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const q = query.trim().toLowerCase();
  const visibles = useMemo(
    () => leads.filter((l) => !q || [l.nombre, l.celular, l.interes, l.vendedor].some((v) => (v || "").toLowerCase().includes(q))),
    [leads, q]
  );

  // Notificaciones: leads abiertos vencidos / sin acción
  const abiertos = leads.filter((l) => !CERRADOS.includes(l.estado));
  const nVencidas = abiertos.filter((l) => l.fecha_accion && l.fecha_accion < hoyISO()).length;
  const nSin = abiertos.filter((l) => !l.fecha_accion).length;

  async function cambiarEstado(id: string, estado: string) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, estado } : l)));
    try {
      const res = await fetch("/api/crm", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, estado }) });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (e: any) {
      setLeads(prev);
      alert("No se pudo cambiar el estado: " + (e.message || ""));
    }
  }

  async function guardar() {
    if (!form.nombre.trim()) { alert("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/crm", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: editId, ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      await load();
      setFormOpen(false); setForm(VACIO); setEditId(null);
    } catch (e: any) {
      alert("No se pudo guardar: " + (e.message || ""));
    } finally { setSaving(false); }
  }

  async function eliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar el lead "${nombre}"?`)) return;
    try {
      const res = await fetch(`/api/crm?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setLeads((ls) => ls.filter((l) => l.id !== id));
    } catch (e: any) { alert("No se pudo eliminar: " + (e.message || "")); }
  }

  function abrirNuevo() { setForm(VACIO); setEditId(null); setFormOpen(true); }
  function abrirEditar(l: Lead) {
    setForm({ nombre: l.nombre, celular: l.celular, interes: l.interes, vendedor: l.vendedor, proxima_accion: l.proxima_accion, fecha_accion: l.fecha_accion || "", notas: l.notas, estado: l.estado });
    setEditId(l.id); setFormOpen(true);
  }

  return (
    <div>
      <div className="reservas-toolbar">
        <input className="precios-search reservas-search" placeholder="Buscar por nombre, celular, interés, vendedor…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="reserva-nueva-btn" onClick={abrirNuevo}>+ Nuevo lead</button>
      </div>

      {/* Notificaciones de acciones */}
      {!loading && (nVencidas > 0 || nSin > 0) && (
        <div className="crm-alert">
          {nVencidas > 0 && <span className="crm-alert-red">🔴 {nVencidas} con acción vencida</span>}
          {nVencidas > 0 && nSin > 0 && <span className="crm-alert-sep">·</span>}
          {nSin > 0 && <span className="crm-alert-yellow">🟡 {nSin} sin acción definida</span>}
        </div>
      )}

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>Cargando CRM…</div>}
      {error && <div className="banner danger">⚠ {error}</div>}

      {!loading && (
        <div className="kanban-board">
          {ESTADOS.map((col) => {
            const cards = ordenarLeads(visibles.filter((l) => l.estado === col.key), col.key);
            return (
              <div key={col.key} className="kanban-col"
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={() => { if (dragId) cambiarEstado(dragId, col.key); setDragId(null); }}>
                <div className="kanban-col-header" style={{ borderTopColor: col.color }}>
                  <span className="kanban-dot" style={{ background: col.color }} />
                  <span className="kanban-col-title">{col.key}</span>
                  <span className="kanban-count">{cards.length}</span>
                </div>
                <div className="kanban-col-body">
                  {cards.map((l) => {
                    const ak = accionKey(l);
                    return (
                      <div key={l.id} className="reserva-card" draggable
                           onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)}
                           style={{ borderLeftColor: ACCION[ak].color }}>
                        <div className="reserva-card-top">
                          <span className="reserva-card-nombre" onClick={() => abrirEditar(l)} title="Editar">{l.nombre}</span>
                          <button className="reserva-card-x" onClick={() => eliminar(l.id, l.nombre)} title="Eliminar">✕</button>
                        </div>
                        {l.celular && <div className="reserva-card-line">📱 {l.celular}</div>}
                        {l.interes && <div className="reserva-card-line reserva-card-arts">🎯 {l.interes}</div>}
                        {l.vendedor && <div className="reserva-card-line">👤 {l.vendedor}</div>}
                        {ak !== "cerrado" && (
                          <div className="crm-accion" style={{ color: ACCION[ak].color }}>
                            {ACCION[ak].icon} {l.proxima_accion || "Sin acción definida"}
                            {l.fecha_accion && ` · ${fmtFecha(l.fecha_accion)}`}
                          </div>
                        )}
                        <select className="reserva-card-estado" value={l.estado} onChange={(e) => cambiarEstado(l.id, e.target.value)}>
                          {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  {cards.length === 0 && <div className="kanban-empty">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {formOpen && (
        <div className="reserva-modal-overlay" onClick={() => !saving && setFormOpen(false)}>
          <div className="reserva-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reserva-modal-header">
              <h3>{editId ? "Editar lead" : "Nuevo lead"}</h3>
              <button className="reserva-modal-close" onClick={() => setFormOpen(false)}>✕</button>
            </div>

            <label className="reserva-field"><span>Estado</span>
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}
                      style={{ borderLeft: `4px solid ${(ESTADOS.find((x) => x.key === form.estado) || {}).color || "#4f8ef7"}` }}>
                {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>

            <label className="reserva-field"><span>Nombre *</span>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus /></label>

            <div className="reserva-field-row">
              <label className="reserva-field"><span>Celular</span>
                <input value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} inputMode="tel" /></label>
              <label className="reserva-field"><span>Vendedor</span>
                <select value={form.vendedor} onChange={(e) => setForm({ ...form, vendedor: e.target.value })}>
                  <option value="">—</option>
                  {VENDEDORES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select></label>
            </div>

            <label className="reserva-field"><span>Qué le interesa</span>
              <textarea rows={2} value={form.interes} onChange={(e) => setForm({ ...form, interes: e.target.value })} /></label>

            <div className="reserva-field-row">
              <label className="reserva-field"><span>Próxima acción</span>
                <input value={form.proxima_accion} onChange={(e) => setForm({ ...form, proxima_accion: e.target.value })} placeholder="ej: Llamar con descuento" /></label>
              <label className="reserva-field"><span>Fecha de la acción</span>
                <input type="date" value={form.fecha_accion}
                  onChange={(e) => setForm({ ...form, fecha_accion: e.target.value })}
                  onClick={(e) => (e.currentTarget as any).showPicker?.()} /></label>
            </div>

            <label className="reserva-field"><span>Notas</span>
              <textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></label>

            <div className="reserva-modal-actions">
              {editId && <button className="reserva-btn-danger" onClick={() => { setFormOpen(false); eliminar(editId, form.nombre); }} disabled={saving}>Eliminar</button>}
              <div style={{ flex: 1 }} />
              <button className="reserva-btn-cancel" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</button>
              <button className="reserva-btn-save" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : editId ? "Guardar" : "Crear lead"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
