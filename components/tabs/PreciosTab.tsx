"use client";
import { useMemo, useState } from "react";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ArticuloPrecio {
  codigo: string;
  nombre: string;
  precio_usd: number;
  foto?: string;          // solo muebles
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
  muebles?: PreciosData;
  showStats?: boolean;
}

type SortKey = "nombre" | "codigo" | "precio_usd";
type SortDir = "asc" | "desc";

// ── Constantes ─────────────────────────────────────────────────────────────
const DESCUENTO = 0.20;

const NEUTRAS_KW = ["yute", "lana", " pet "];  // pet con espacios para evitar falsos positivos
// También detectar "PET" al inicio o fin de la descripción
function esNeutra(nombre: string) {
  const n = ` ${nombre.toLowerCase()} `;
  return n.includes(" yute ") || n.includes(" lana ") || n.includes(" pet ");
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function sortArticulos(list: ArticuloPrecio[], key: SortKey, dir: SortDir) {
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (key === "precio_usd") cmp = a.precio_usd - b.precio_usd;
    else if (key === "codigo") cmp = a.codigo.localeCompare(b.codigo, "es");
    else cmp = a.nombre.localeCompare(b.nombre, "es");
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Subcomponente: fila de artículo ────────────────────────────────────────
function ArticuloRow({
  a,
  conFoto,
}: {
  a: ArticuloPrecio;
  conFoto: boolean;
}) {
  const precioDesc = a.precio_usd * (1 - DESCUENTO);
  return (
    <div className={`precio-row${conFoto ? " precio-row-con-foto" : ""}`}>
      {conFoto && a.foto && (
        <div className="precio-foto-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.foto}
            alt={a.nombre}
            className="precio-foto"
            loading="lazy"
          />
        </div>
      )}
      <div className="precio-row-info">
        <div className="precio-row-codigo mono">#{a.codigo}</div>
        <div className="precio-row-nombre">{a.nombre}</div>
      </div>
      <div className="precio-row-prices">
        <div className="precio-row-precio mono">{fmtUSD(a.precio_usd)}</div>
        <div className="precio-row-descuento mono">
          {fmtUSD(precioDesc)}{" "}
          <span className="precio-row-pct">-20%</span>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponente: sección colapsable ──────────────────────────────────────
function SeccionHeader({
  titulo,
  count,
  open,
  onToggle,
  accentColor,
}: {
  titulo: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  accentColor: string;
}) {
  return (
    <button
      className="seccion-header"
      onClick={onToggle}
      style={{ "--seccion-color": accentColor } as React.CSSProperties}
    >
      <span className="seccion-dot" />
      <span className="seccion-titulo">{titulo}</span>
      <span className="seccion-count">{count}</span>
      <span className="seccion-arrow">{open ? "▲" : "▼"}</span>
    </button>
  );
}

// ── Componente principal ───────────────────────────────────────────────────
export default function PreciosTab({
  data,
  muebles,
  showStats = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [openPersas, setOpenPersas] = useState(true);
  const [openNeutras, setOpenNeutras] = useState(true);
  const [openMuebles, setOpenMuebles] = useState(true);

  // Separar alfombras en Persas / Neutras
  const alfombras = data?.articulos ?? [];
  const mueblesList = muebles?.articulos ?? [];

  const { persas, neutras } = useMemo(() => {
    const persas: ArticuloPrecio[] = [];
    const neutras: ArticuloPrecio[] = [];
    for (const a of alfombras) {
      (esNeutra(a.nombre) ? neutras : persas).push(a);
    }
    return { persas, neutras };
  }, [alfombras]);

  // Filtrar + ordenar cada sección
  const q = query.trim().toLowerCase();

  function filterSort(list: ArticuloPrecio[]) {
    const filtered = q
      ? list.filter(
          (a) =>
            a.nombre.toLowerCase().includes(q) ||
            a.codigo.toLowerCase().includes(q)
        )
      : list;
    return sortArticulos(filtered, sortKey, sortDir);
  }

  const filtPersas  = useMemo(() => filterSort(persas),    [persas,    q, sortKey, sortDir]);
  const filtNeutras = useMemo(() => filterSort(neutras),   [neutras,   q, sortKey, sortDir]);
  const filtMuebles = useMemo(() => filterSort(mueblesList),[mueblesList,q,sortKey, sortDir]);

  const totalMostrado = filtPersas.length + filtNeutras.length + filtMuebles.length;

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "precio_usd" ? "desc" : "asc");
    }
  }

  function sortArrow(k: SortKey) {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const totalArticulos = alfombras.length + mueblesList.length;

  if (totalArticulos === 0) {
    return (
      <div className="card">
        <div className="sin-datos">
          <div className="sin-datos-icon">💰</div>
          <div className="sin-datos-titulo">Sin datos de precios</div>
          <div className="sin-datos-desc">
            El scraper aún no descargó la lista de precios.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showStats && (
        <div className="kpi-grid mb-16">
          <div className="card">
            <div className="card-title">Total artículos</div>
            <div className="card-value mono">
              {totalArticulos.toLocaleString("es-UY")}
            </div>
            <div className="card-sub">con precio &gt; 0</div>
          </div>
          <div className="card">
            <div className="card-title">Mostrando</div>
            <div className="card-value mono">
              {totalMostrado.toLocaleString("es-UY")}
            </div>
            <div className="card-sub">
              {query ? `Filtro: "${query}"` : "Sin filtro"}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Alfombras Persas</div>
            <div className="card-value mono">
              {persas.length.toLocaleString("es-UY")}
            </div>
            <div className="card-sub">artículos</div>
          </div>
          <div className="card">
            <div className="card-title">Alfombras Neutras</div>
            <div className="card-value mono">
              {neutras.length.toLocaleString("es-UY")}
            </div>
            <div className="card-sub">Yute · Lana · PET</div>
          </div>
        </div>
      )}

      {/* Toolbar: búsqueda + orden */}
      <div className="card mb-16">
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
      </div>

      {/* ── Sección: Alfombras Persas ── */}
      {filtPersas.length > 0 && (
        <div className="seccion mb-16">
          <SeccionHeader
            titulo="Alfombras Persas"
            count={filtPersas.length}
            open={openPersas}
            onToggle={() => setOpenPersas(!openPersas)}
            accentColor="#a855f7"
          />
          {openPersas && (
            <div className="card seccion-body">
              <div className="precios-list">
                {filtPersas.map((a) => (
                  <ArticuloRow key={a.codigo} a={a} conFoto={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sección: Alfombras Neutras ── */}
      {filtNeutras.length > 0 && (
        <div className="seccion mb-16">
          <SeccionHeader
            titulo="Alfombras Neutras"
            count={filtNeutras.length}
            open={openNeutras}
            onToggle={() => setOpenNeutras(!openNeutras)}
            accentColor="#4f8ef7"
          />
          {openNeutras && (
            <div className="card seccion-body">
              <div className="precios-list">
                {filtNeutras.map((a) => (
                  <ArticuloRow key={a.codigo} a={a} conFoto={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sección: Muebles ── */}
      {filtMuebles.length > 0 && (
        <div className="seccion mb-16">
          <SeccionHeader
            titulo="Muebles"
            count={filtMuebles.length}
            open={openMuebles}
            onToggle={() => setOpenMuebles(!openMuebles)}
            accentColor="#22c55e"
          />
          {openMuebles && (
            <div className="card seccion-body">
              <div className="precios-list">
                {filtMuebles.map((a) => (
                  <ArticuloRow
                    key={`${a.codigo}|${a.nombre}`}
                    a={a}
                    conFoto={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sin resultados */}
      {totalMostrado === 0 && query && (
        <div
          className="card"
          style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}
        >
          Sin resultados para &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
