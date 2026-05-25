"use client";
import { useMemo, useState } from "react";

interface ArticuloPrecio {
  codigo: string;
  nombre: string;
  precio_usd: number;
}

interface PreciosData {
  _status: string;
  _ultima_actualizacion?: string;
  _fuente?: string;
  total_articulos: number;
  articulos: ArticuloPrecio[];
}

interface Props {
  data: PreciosData;
  /** Si false, oculta los KPIs y muestra solo la tabla (modo standalone). */
  showStats?: boolean;
}

type SortKey = "nombre" | "codigo" | "precio_usd";
type SortDir = "asc" | "desc";

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PreciosTab({ data, showStats = true }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const articulos = data?.articulos ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = articulos;
    if (q) {
      list = articulos.filter(
        (a) => a.nombre.toLowerCase().includes(q) || a.codigo.toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "precio_usd") cmp = a.precio_usd - b.precio_usd;
      else if (sortKey === "codigo") cmp = a.codigo.localeCompare(b.codigo, "es");
      else cmp = a.nombre.localeCompare(b.nombre, "es");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [articulos, query, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "precio_usd" ? "desc" : "asc"); }
  }

  function sortIcon(k: SortKey) {
    if (sortKey !== k) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  const precioPromedio = filtered.length > 0
    ? filtered.reduce((s, a) => s + a.precio_usd, 0) / filtered.length
    : 0;

  if (!articulos || articulos.length === 0) {
    return (
      <div className="card">
        <div className="sin-datos">
          <div className="sin-datos-icon">💰</div>
          <div className="sin-datos-titulo">Sin datos de precios</div>
          <div className="sin-datos-desc">El scraper aún no descargó la lista de precios.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showStats && (
        <div className="kpi-grid mb-16">
          <div className="card">
            <div className="card-title">Artículos con precio</div>
            <div className="card-value mono">{articulos.length.toLocaleString("es-UY")}</div>
            <div className="card-sub">USD &gt; 0</div>
          </div>
          <div className="card">
            <div className="card-title">Mostrando</div>
            <div className="card-value mono">{filtered.length.toLocaleString("es-UY")}</div>
            <div className="card-sub">{query ? `Filtro: "${query}"` : "Sin filtro"}</div>
          </div>
          <div className="card">
            <div className="card-title">Precio promedio</div>
            <div className="card-value mono">{fmtUSD(precioPromedio)}</div>
            <div className="card-sub">de la selección actual</div>
          </div>
          <div className="card">
            <div className="card-title">Fuente</div>
            <div className="card-value-sm mono">{data._fuente ?? "Zeta"}</div>
            <div className="card-sub">
              {data._ultima_actualizacion
                ? new Date(data._ultima_actualizacion).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" })
                : "—"}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex-between mb-8" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Lista de Precios</div>
          <input
            type="text"
            placeholder="Buscar por nombre o código…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "var(--text)",
              fontSize: 13,
              minWidth: 260,
              outline: "none",
            }}
          />
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="precios-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort("codigo")} style={{ cursor: "pointer", width: 110 }}>
                  Código <span style={{ opacity: 0.6 }}>{sortIcon("codigo")}</span>
                </th>
                <th onClick={() => toggleSort("nombre")} style={{ cursor: "pointer" }}>
                  Nombre <span style={{ opacity: 0.6 }}>{sortIcon("nombre")}</span>
                </th>
                <th
                  onClick={() => toggleSort("precio_usd")}
                  style={{ cursor: "pointer", textAlign: "right", width: 140 }}
                >
                  Precio (USD) <span style={{ opacity: 0.6 }}>{sortIcon("precio_usd")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.codigo}>
                  <td className="mono" style={{ color: "var(--text-muted)" }}>{a.codigo}</td>
                  <td>{a.nombre}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtUSD(a.precio_usd)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                    Sin resultados para "{query}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
