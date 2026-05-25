"use client";
import { useMemo, useState } from "react";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ArticuloPrecio {
  codigo: string;
  nombre: string;
  precio_usd: number;
  foto?: string;
}

interface PreciosData {
  _status: string;
  _ultima_actualizacion?: string;
  _fuente?: string;
  total_articulos: number;
  articulos: ArticuloPrecio[];
}

interface NeutrasGroup {
  key: string;
  tipo: string;
  medida: string;
  precio_usd: number;
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

// Regex para detectar dimensiones: 160 x 230, 080x160, 4x3, etc.
const SIZE_RE = /(\d{1,4})\s*[xX*]\s*(\d{1,4})/;

// Colores conocidos — multi-palabra primero para que el replace no los parta
const COLORS_RE =
  /\b(natural grey|light grey|natural|grey|vison|clay|graphite|latte|beige|charcol|charcoal|green|ivory|anthracite|bark)\b/gi;

function esNeutra(nombre: string) {
  const n = ` ${nombre.toLowerCase()} `;
  return n.includes(" yute ") || n.includes(" lana ") || n.includes(" pet ");
}

// ── Agrupamiento Neutras ───────────────────────────────────────────────────
function toNeutrasKey(nombre: string): { key: string; tipo: string; medida: string } {
  const m = SIZE_RE.exec(nombre);
  if (!m) return { key: nombre, tipo: nombre, medida: "" };

  const sizeIdx = m.index;
  let before = nombre.slice(0, sizeIdx);

  // Quitar patrón "- COLOR" al final del tramo previo (e.g. "HANDMADE PET DHURRIES - ANTHRACITE")
  before = before.replace(/\s*-\s*\S+\s*$/, "").trim();
  // Quitar palabras de color
  const tipo = before
    .replace(COLORS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  const n1 = parseInt(m[1], 10);
  const n2 = parseInt(m[2], 10);
  const medida = `${n1} x ${n2}`;
  const key = tipo ? `${tipo} ${medida}` : medida;

  return { key, tipo, medida };
}

function groupNeutras(articulos: ArticuloPrecio[]): NeutrasGroup[] {
  const map = new Map<string, NeutrasGroup>();
  for (const a of articulos) {
    const { key, tipo, medida } = toNeutrasKey(a.nombre);
    if (!map.has(key)) {
      map.set(key, { key, tipo, medida, precio_usd: a.precio_usd });
    }
  }
  return Array.from(map.values());
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

function sortGroups(list: NeutrasGroup[], key: SortKey, dir: SortDir) {
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (key === "precio_usd") cmp = a.precio_usd - b.precio_usd;
    else cmp = a.key.localeCompare(b.key, "es");
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Subcomponente: fila de alfombra ────────────────────────────────────────
function AlfombraRow({ a }: { a: ArticuloPrecio }) {
  const precioDesc = a.precio_usd * (1 - DESCUENTO);
  return (
    <div className="precio-row">
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

// ── Subcomponente: fila de grupo neutra (tipo + medida, sin color) ─────────
function NeutrasGroupRow({ g }: { g: NeutrasGroup }) {
  const precioDesc = g.precio_usd * (1 - DESCUENTO);
  return (
    <div className="precio-row">
      <div className="precio-row-info">
        {g.medida && (
          <div className="precio-row-codigo">{g.medida}</div>
        )}
        <div className="precio-row-nombre">{g.tipo || g.key}</div>
      </div>
      <div className="precio-row-prices">
        <div className="precio-row-precio mono">{fmtUSD(g.precio_usd)}</div>
        <div className="precio-row-descuento mono">
          {fmtUSD(precioDesc)}{" "}
          <span className="precio-row-pct">-20%</span>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponente: fila de mueble (con foto) ───────────────────────────────
function MuebleRow({ a }: { a: ArticuloPrecio }) {
  const precioDesc = a.precio_usd * (1 - DESCUENTO);
  return (
    <div className="precio-row precio-row-con-foto">
      {a.foto && (
        <div className="precio-foto-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.foto} alt={a.nombre} className="precio-foto" loading="lazy" />
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

// ── Subcomponente: encabezado de sección colapsable ────────────────────────
function SeccionHeader({
  titulo, count, open, onToggle, accentColor,
}: {
  titulo: string; count: number; open: boolean;
  onToggle: () => void; accentColor: string;
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
export default function PreciosTab({ data, muebles, showStats = true }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [openPersas, setOpenPersas]   = useState(true);
  const [openNeutras, setOpenNeutras] = useState(true);
  const [openMuebles, setOpenMuebles] = useState(true);

  const alfombras   = data?.articulos ?? [];
  const mueblesList = muebles?.articulos ?? [];

  // Separar alfombras
  const { persas, neutrasRaw } = useMemo(() => {
    const persas: ArticuloPrecio[] = [];
    const neutrasRaw: ArticuloPrecio[] = [];
    for (const a of alfombras) {
      (esNeutra(a.nombre) ? neutrasRaw : persas).push(a);
    }
    return { persas, neutrasRaw };
  }, [alfombras]);

  // Agrupar neutras por tipo + medida (sin color)
  const neutrasGroups = useMemo(() => groupNeutras(neutrasRaw), [neutrasRaw]);

  const q = query.trim().toLowerCase();

  const filtPersas = useMemo(() => {
    const f = q ? persas.filter(a =>
      a.nombre.toLowerCase().includes(q) || a.codigo.toLowerCase().includes(q)
    ) : persas;
    return sortArticulos(f, sortKey, sortDir);
  }, [persas, q, sortKey, sortDir]);

  const filtNeutras = useMemo(() => {
    const f = q ? neutrasGroups.filter(g => g.key.toLowerCase().includes(q)) : neutrasGroups;
    return sortGroups(f, sortKey, sortDir);
  }, [neutrasGroups, q, sortKey, sortDir]);

  const filtMuebles = useMemo(() => {
    const f = q ? mueblesList.filter(a =>
      a.nombre.toLowerCase().includes(q) || a.codigo.toLowerCase().includes(q)
    ) : mueblesList;
    return sortArticulos(f, sortKey, sortDir);
  }, [mueblesList, q, sortKey, sortDir]);

  const totalMostrado = filtPersas.length + filtNeutras.length + filtMuebles.length;
  const totalArticulos = alfombras.length + mueblesList.length;

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "precio_usd" ? "desc" : "asc"); }
  }
  function sortArrow(k: SortKey) {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  if (totalArticulos === 0) {
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
            <div className="card-title">Total artículos</div>
            <div className="card-value mono">{totalArticulos.toLocaleString("es-UY")}</div>
            <div className="card-sub">con precio &gt; 0</div>
          </div>
          <div className="card">
            <div className="card-title">Mostrando</div>
            <div className="card-value mono">{totalMostrado.toLocaleString("es-UY")}</div>
            <div className="card-sub">{query ? `Filtro: "${query}"` : "Sin filtro"}</div>
          </div>
          <div className="card">
            <div className="card-title">Alfombras Persas</div>
            <div className="card-value mono">{persas.length.toLocaleString("es-UY")}</div>
            <div className="card-sub">artículos</div>
          </div>
          <div className="card">
            <div className="card-title">Alfombras Neutras</div>
            <div className="card-value mono">{neutrasGroups.length.toLocaleString("es-UY")}</div>
            <div className="card-sub">tipo · medida</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
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

      {/* ── Alfombras Persas ── */}
      {filtPersas.length > 0 && (
        <div className="seccion mb-16">
          <SeccionHeader titulo="Alfombras Persas" count={filtPersas.length}
            open={openPersas} onToggle={() => setOpenPersas(!openPersas)} accentColor="#a855f7" />
          {openPersas && (
            <div className="card seccion-body">
              <div className="precios-list">
                {filtPersas.map((a) => <AlfombraRow key={a.codigo} a={a} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Alfombras Neutras (agrupadas por tipo + medida) ── */}
      {filtNeutras.length > 0 && (
        <div className="seccion mb-16">
          <SeccionHeader titulo="Alfombras Neutras" count={filtNeutras.length}
            open={openNeutras} onToggle={() => setOpenNeutras(!openNeutras)} accentColor="#4f8ef7" />
          {openNeutras && (
            <div className="card seccion-body">
              <div className="precios-list">
                {filtNeutras.map((g) => <NeutrasGroupRow key={g.key} g={g} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Muebles ── */}
      {filtMuebles.length > 0 && (
        <div className="seccion mb-16">
          <SeccionHeader titulo="Muebles" count={filtMuebles.length}
            open={openMuebles} onToggle={() => setOpenMuebles(!openMuebles)} accentColor="#22c55e" />
          {openMuebles && (
            <div className="card seccion-body">
              <div className="precios-list">
                {filtMuebles.map((a) => <MuebleRow key={`${a.codigo}|${a.nombre}`} a={a} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {totalMostrado === 0 && query && (
        <div className="card" style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
          Sin resultados para &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
