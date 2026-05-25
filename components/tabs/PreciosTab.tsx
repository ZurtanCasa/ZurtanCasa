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
  /** Si false, oculta los KPIs y muestra solo la lista (modo standalone). */
  showStats?: boolean;
}

type SortKey = "nombre" | "codigo" | "precio_usd";
type SortDir = "asc" | "desc";

const DESCUENTO = 0.20;

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

  function sortArrow(k: SortKey) {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
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
        <div className="precios-toolbar">
          <input
            type="text"
            placeholder="Buscar por nombre o código…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="precios-search"
            inputMode="search"
          />
          <div className="precios-sort">
            <span className="precios-sort-label">Ordenar:</span>
            <button
              className={`precios-sort-btn${sortKey === "nombre" ? " active" : ""}`}
              onClick={() => toggleSort("nombre")}
            >
              Nombre{sortArrow("nombre")}
            </button>
            <button
              className={`precios-sort-btn${sortKey === "codigo" ? " active" : ""}`}
              onClick={() => toggleSort("codigo")}
            >
              Código{sortArrow("codigo")}
            </button>
            <button
              className={`precios-sort-btn${sortKey === "precio_usd" ? " active" : ""}`}
              onClick={() => toggleSort("precio_usd")}
            >
              Precio{sortArrow("precio_usd")}
            </button>
          </div>
        </div>

        <div className="precios-list">
          {filtered.map((a) => {
            const precioDesc = a.precio_usd * (1 - DESCUENTO);
            return (
              <div key={a.codigo} className="precio-row">
                <div className="precio-row-info">
                  <div className="precio-row-codigo mono">#{a.codigo}</div>
                  <div className="precio-row-nombre">{a.nombre}</div>
                </div>
                <div className="precio-row-prices">
                  <div className="precio-row-precio mono">{fmtUSD(a.precio_usd)}</div>
                  <div className="precio-row-descuento mono">
                    {fmtUSD(precioDesc)} <span className="precio-row-pct">-20%</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
              Sin resultados para "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
