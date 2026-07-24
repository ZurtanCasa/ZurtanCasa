"use client";
import { useMemo, useState } from "react";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ArticuloPrecio {
  codigo: string;
  nombre: string;
  precio_usd: number;
  medida?: string;
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

interface StockEntry {
  local: number;
  dialcaren: number;
}

interface ColorStock {
  color: string;
  codigo: string;
  local: number;
  dialcaren: number;
}

interface StockData {
  _tiene_datos: boolean;
  articulos: Record<string, StockEntry>;
}

interface Props {
  data: PreciosData;
  muebles?: PreciosData;
  stock?: StockData;
  showStats?: boolean;
}

type SortKey = "nombre" | "codigo" | "precio_usd";
type SortDir = "asc" | "desc";

// ── Constantes ─────────────────────────────────────────────────────────────
const DESCUENTO = 0.20;

// Regex para detectar dimensiones: 160 x 230, 080x160, 4x3, etc.
const SIZE_RE = /(\d{1,4})\s*[xX*]\s*(\d{1,4})/;

// Colores genéricos que se eliminan del tipo
const COLORS_RE =
  /\b(natural grey|light grey|natural|grey|vison|beige|charcol|charcoal|green|ivory|anthracite|bark)\b/gi;

// Colores que pertenecen a la colección "Qayyum" y reemplazan el tipo base
const QAYYUM_COLORS_RE = /\b(clay|latte|graphite)\b/i;

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

  // Quitar patrón "- COLOR" al final (e.g. "HANDMADE PET DHURRIES - ANTHRACITE")
  before = before.replace(/\s*-\s*\S+\s*$/, "").trim();

  // Detectar colección Qayyum antes de eliminar colores
  const isQayyum = QAYYUM_COLORS_RE.test(before);

  // Quitar colores genéricos (Clay/Latte/Graphite también, ya que se capturó el flag)
  const tipoBase = before
    .replace(COLORS_RE, " ")
    .replace(QAYYUM_COLORS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Si era Qayyum, agregar el sufijo al tipo base
  const tipo = isQayyum ? `${tipoBase} Qayyum` : tipoBase;

  const n1 = parseInt(m[1], 10);
  const n2 = parseInt(m[2], 10);
  const medida = `${n1} x ${n2}`;
  const key = tipo ? `${tipo} ${medida}` : medida;

  return { key, tipo, medida };
}

// Extrae la etiqueta de color de una neutra (lo que distingue variantes
// dentro de un mismo grupo tipo·medida). El color suele ir después de la
// medida ("... 120 x 80 Grey"), a veces antes tras guión o como Qayyum.
function extractColor(nombre: string): string {
  const m = SIZE_RE.exec(nombre);
  if (!m) {
    const c = nombre.match(COLORS_RE);
    return c ? c[0] : "Natural";
  }
  const before = nombre.slice(0, m.index);
  const after  = nombre.slice(m.index + m[0].length).trim();
  if (after) return after.replace(/\s+/g, " ");
  const dash = before.match(/-\s*([^-]+?)\s*$/);
  if (dash) return dash[1].trim();
  const qay = before.match(QAYYUM_COLORS_RE);
  if (qay) return qay[0];
  const col = before.match(COLORS_RE);
  if (col) return col[0];
  return "Natural";
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

// ── Subcomponente: badge de stock ──────────────────────────────────────────
function StockBadge({ local, dialcaren }: { local: number; dialcaren: number }) {
  if (local === 0 && dialcaren === 0) return null;
  return (
    <div className="stock-badge">
      {local > 0 && <span className="stock-local">{local} Local</span>}
      {local > 0 && dialcaren > 0 && <span className="stock-sep">·</span>}
      {dialcaren > 0 && <span className="stock-dialcaren">{dialcaren} Dialcaren</span>}
    </div>
  );
}

// ── Subcomponente: fila de alfombra ────────────────────────────────────────
function AlfombraRow({ a }: { a: ArticuloPrecio }) {
  const precioDesc = a.precio_usd * (1 - DESCUENTO);
  return (
    <div className="precio-row">
      <div className="precio-row-info">
        <div className="precio-row-codigo mono">#{a.codigo}</div>
        <div className="precio-row-nombre">{a.nombre}</div>
        {a.medida && <div className="precio-row-medida">{a.medida} cm</div>}
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
// Si hay stock, la fila es clickeable y despliega una tabla de stock por color.
function NeutrasGroupRow({
  g, stock, colors, open, onToggle,
}: {
  g: NeutrasGroup; stock?: StockEntry;
  colors?: ColorStock[]; open: boolean; onToggle: () => void;
}) {
  const precioDesc = g.precio_usd * (1 - DESCUENTO);
  const total = (stock?.local ?? 0) + (stock?.dialcaren ?? 0);
  const expandable = !!colors && colors.length > 0 && total > 0;

  return (
    <div className="precio-group">
      <div
        className={`precio-row${expandable ? " precio-row-expandable" : ""}`}
        onClick={expandable ? onToggle : undefined}
        role={expandable ? "button" : undefined}
        aria-expanded={expandable ? open : undefined}
      >
        <div className="precio-row-info">
          {g.medida && (
            <div className="precio-row-codigo">
              {g.medida}
              {expandable && <span className="precio-caret">{open ? "▾" : "▸"}</span>}
            </div>
          )}
          <div className="precio-row-nombre">{g.tipo || g.key}</div>
          {stock && <StockBadge local={stock.local} dialcaren={stock.dialcaren} />}
        </div>
        <div className="precio-row-prices">
          <div className="precio-row-precio mono">{fmtUSD(g.precio_usd)}</div>
          <div className="precio-row-descuento mono">
            {fmtUSD(precioDesc)}{" "}
            <span className="precio-row-pct">-20%</span>
          </div>
        </div>
      </div>
      {expandable && open && (
        <div className="stock-color-table">
          <div className="stock-color-row stock-color-head">
            <span>Color</span>
            <span>Local</span>
            <span>Dialcaren</span>
          </div>
          {colors!.map((c) => (
            <div className="stock-color-row" key={c.codigo}>
              <span className="stock-color-name" title={c.codigo}>{c.color}</span>
              <span className="stock-color-local mono">{c.local}</span>
              <span className="stock-color-dial mono">{c.dialcaren}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Subcomponente: fila de mueble (con foto) ───────────────────────────────
function MuebleRow({ a, stock }: { a: ArticuloPrecio; stock?: StockEntry }) {
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
        {stock && <StockBadge local={stock.local} dialcaren={stock.dialcaren} />}
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
export default function PreciosTab({ data, muebles, stock, showStats = true }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [openPersas, setOpenPersas]   = useState(true);
  const [openNeutras, setOpenNeutras] = useState(true);
  const [openMuebles, setOpenMuebles] = useState(true);
  const [openGroups, setOpenGroups]   = useState<Set<string>>(() => new Set());

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
      a.nombre.toLowerCase().includes(q) || a.codigo.toLowerCase().startsWith(q)
    ) : persas;
    return sortArticulos(f, sortKey, sortDir);
  }, [persas, q, sortKey, sortDir]);

  const filtNeutras = useMemo(() => {
    const f = q ? neutrasGroups.filter(g => g.key.toLowerCase().includes(q)) : neutrasGroups;
    return sortGroups(f, sortKey, sortDir);
  }, [neutrasGroups, q, sortKey, sortDir]);

  const filtMuebles = useMemo(() => {
    const f = q ? mueblesList.filter(a =>
      a.nombre.toLowerCase().includes(q) || a.codigo.toLowerCase().startsWith(q)
    ) : mueblesList;
    return sortArticulos(f, sortKey, sortDir);
  }, [mueblesList, q, sortKey, sortDir]);

  // Stock por grupo de neutras (suma de todos los artículos del grupo)
  const neutrasGroupStock = useMemo(() => {
    if (!stock?._tiene_datos) return {} as Record<string, StockEntry>;
    const map: Record<string, StockEntry> = {};
    for (const a of neutrasRaw) {
      const { key } = toNeutrasKey(a.nombre);
      const s = stock.articulos[a.codigo] ?? { local: 0, dialcaren: 0 };
      if (!map[key]) map[key] = { local: 0, dialcaren: 0 };
      map[key].local     += s.local     || 0;
      map[key].dialcaren += s.dialcaren || 0;
    }
    return map;
  }, [neutrasRaw, stock]);

  // Stock por color dentro de cada grupo de neutras (para la tabla desplegable)
  const neutrasGroupColors = useMemo(() => {
    const map: Record<string, ColorStock[]> = {};
    const hasStock = !!stock?._tiene_datos;
    for (const a of neutrasRaw) {
      const { key } = toNeutrasKey(a.nombre);
      const s = hasStock
        ? (stock!.articulos[a.codigo] ?? { local: 0, dialcaren: 0 })
        : { local: 0, dialcaren: 0 };
      (map[key] ??= []).push({
        color: extractColor(a.nombre),
        codigo: a.codigo,
        local: s.local || 0,
        dialcaren: s.dialcaren || 0,
      });
    }
    for (const k in map) {
      map[k].sort((a, b) => a.color.localeCompare(b.color, "es"));
    }
    return map;
  }, [neutrasRaw, stock]);

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
                {filtPersas.map((a) => <AlfombraRow key={`${a.codigo}|${a.nombre}`} a={a} />)}
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
                {filtNeutras.map((g) => (
                  <NeutrasGroupRow
                    key={g.key}
                    g={g}
                    stock={neutrasGroupStock[g.key]}
                    colors={neutrasGroupColors[g.key]}
                    open={openGroups.has(g.key)}
                    onToggle={() => toggleGroup(g.key)}
                  />
                ))}
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
                {filtMuebles.map((a) => (
                  <MuebleRow
                    key={`${a.codigo}|${a.nombre}`}
                    a={a}
                    stock={stock?._tiene_datos ? stock.articulos[a.codigo] : undefined}
                  />
                ))}
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
