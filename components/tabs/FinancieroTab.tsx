"use client";
import { useState, useEffect } from "react";

type SubTab = "ventas" | "sueldos" | "gastos" | "inversiones" | "impuestos" | "resumen";

const SUBTAB_LABELS: Record<SubTab, string> = {
  ventas: "💰 Ventas",
  sueldos: "👥 Sueldos",
  gastos: "🧾 Gastos",
  inversiones: "🚢 Inversiones",
  impuestos: "🏛️ Impuestos y cargas",
  resumen: "📊 Resumen",
};

const ESTADO_LABELS: Record<string, string> = {
  pedido: "Pedido",
  en_transito: "En tránsito",
  en_aduana: "En aduana",
  recibido: "Recibido",
};

const CATEGORIA_LABELS: Record<string, string> = {
  alfombras: "Alfombras",
  muebles: "Muebles",
  otro: "Otro",
};

interface Empleado {
  nombre: string;
  rol: string;
  sueldo_mensual_usd: number;
  comision_pct: number;
  activo: boolean;
}

interface Sueldos {
  _status: string;
  cargas_sociales_pct: number;
  empleados: Empleado[];
}

interface CategoriaGasto {
  categoria: string;
  monto_mensual_usd: number;
  iva_usd?: number;
}

interface Gastos {
  _status: string;
  categorias: CategoriaGasto[];
}

interface Embarque {
  id?: string;
  descripcion: string;
  proveedor: string;
  categoria: string;
  monto_usd: number;
  impuestos_usd: number;
  fecha_pedido: string | null;
  fecha_eta: string | null;
  estado: string;
  notas?: string;
}

interface Inversiones {
  _status: string;
  embarques: Embarque[];
}

interface Props {
  shopify: any;
  mercadolibre: any;
  locales: any;
  meta: any;
  google: any;
  sueldos: Sueldos;
  gastos: Gastos;
  inversiones: Inversiones;
  contexto: any;
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}

function fmtPct(n: number) {
  return (n * 100).toFixed(1) + "%";
}

function semClass(pct: number): string {
  if (pct >= 1) return "verde";
  if (pct >= 0.85) return "amarillo";
  return "rojo";
}

function fmtFecha(f: string | null): string {
  if (!f) return "—";
  return new Date(f).toLocaleDateString("es-UY", { timeZone: "America/Montevideo" });
}

async function apiCall(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error inesperado");
  return data;
}

const AVISO_REDEPLOY = "Guardado. Puede tardar 1-2 minutos en reflejarse en el resto del dashboard mientras se redeploya.";

function useEstadoGuardado() {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function ejecutar(fn: () => Promise<void>) {
    setGuardando(true);
    setError(null);
    try {
      await fn();
      setAviso(AVISO_REDEPLOY);
      setTimeout(() => setAviso(null), 6000);
    } catch (err: any) {
      setError(err.message || "Error inesperado");
    } finally {
      setGuardando(false);
    }
  }

  return { guardando, error, aviso, ejecutar, setError };
}

function AvisosGuardado({ error, aviso }: { error: string | null; aviso: string | null }) {
  return (
    <>
      {error && <div className="banner danger mb-16">⚠️ {error}</div>}
      {aviso && <div className="banner success mb-16">✅ {aviso}</div>}
    </>
  );
}

export default function FinancieroTab({ shopify, mercadolibre, locales, meta, google, sueldos, gastos, inversiones, contexto }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("resumen");

  // Estado "vivo": se inicializa con los datos estáticos del build y se refresca
  // con lo último guardado en GitHub apenas monta el componente. Se mantiene acá
  // (en el padre) para que sobreviva a cambios de sub-pestaña.
  const [empleados, setEmpleados] = useState<Empleado[]>(sueldos?.empleados || []);
  const [cargasSocialesPct, setCargasSocialesPct] = useState<number>(sueldos?.cargas_sociales_pct || 0);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>(gastos?.categorias || []);
  const [embarques, setEmbarques] = useState<Embarque[]>(inversiones?.embarques || []);

  useEffect(() => {
    apiCall("/api/sueldos")
      .then((data) => {
        setEmpleados(data.empleados || []);
        setCargasSocialesPct(data.cargas_sociales_pct || 0);
      })
      .catch(() => {});
    apiCall("/api/gastos")
      .then((data) => setCategorias(data.categorias || []))
      .catch(() => {});
    apiCall("/api/inversiones")
      .then((data) => setEmbarques(data.embarques || []))
      .catch(() => {});
  }, []);

  const webRevenue = shopify?.mes_actual?.revenue_bruto || 0;
  const mlRevenueBruto = mercadolibre?.mes_actual?.revenue_bruto || 0;
  const mlRevenueNeto = mercadolibre?.mes_actual?.revenue_neto_post_comision || 0;
  const comisionML = mercadolibre?.mes_actual?.comision_pagada || 0;
  const localesRevenue = locales?.locales?.reduce((s: number, l: any) => s + (l.mes_actual?.revenue || 0), 0) || 0;
  const totalVentasBruto = webRevenue + mlRevenueBruto + localesRevenue;
  const totalVentasNeto = webRevenue + mlRevenueNeto + localesRevenue;

  const factorIva = contexto?.factor_iva_real ?? 0.22;
  const ventasNetasIva = totalVentasBruto / (1 + factorIva);

  const empleadosActivos = empleados.filter((e) => e.activo);
  const totalSueldos = empleadosActivos.reduce((s, e) => s + (e.sueldo_mensual_usd || 0), 0);
  const totalComisiones = empleadosActivos.reduce((s, e) => s + ventasNetasIva * (e.comision_pct || 0), 0);
  const cargasSociales = totalSueldos * cargasSocialesPct;
  const totalCostoLaboral = totalSueldos + totalComisiones + cargasSociales;

  const totalGastos = categorias.reduce((s, c) => s + (c.monto_mensual_usd || 0), 0);
  const totalIvaGastos = categorias.reduce((s, c) => s + (c.iva_usd || 0), 0);

  const totalImpuestosInversion = embarques.reduce((s, e) => s + (e.impuestos_usd || 0), 0);

  const spendMeta = meta?.periodos?.last_30d?.spend || 0;
  const spendGoogle = google?.periodos?.last_30d?.spend || 0;
  const totalAds = spendMeta + spendGoogle;

  const resultadoNeto = totalVentasNeto - totalCostoLaboral - totalGastos - totalAds - totalImpuestosInversion;
  const breakeven = contexto?.breakeven_mensual?.usd || 0;

  const sinDatosVentas = shopify?._status === "sin_datos" && mercadolibre?._status === "sin_datos" && locales?._status === "sin_datos";
  const sinDatosSueldos = empleados.length === 0;
  const sinDatosGastos = categorias.length === 0;
  const sinDatosInversiones = embarques.length === 0;

  return (
    <div>
      <div className="period-switcher mb-16">
        {(Object.keys(SUBTAB_LABELS) as SubTab[]).map((st) => (
          <button
            key={st}
            className={`period-btn${subTab === st ? " active" : ""}`}
            onClick={() => setSubTab(st)}
          >
            {SUBTAB_LABELS[st]}
          </button>
        ))}
      </div>

      {subTab === "resumen" && (
        <ResumenSection
          totalVentasNeto={totalVentasNeto}
          totalCostoLaboral={totalCostoLaboral}
          totalGastos={totalGastos}
          totalAds={totalAds}
          totalImpuestosInversion={totalImpuestosInversion}
          resultadoNeto={resultadoNeto}
          breakeven={breakeven}
          sinDatosSueldos={sinDatosSueldos}
          sinDatosGastos={sinDatosGastos}
        />
      )}

      {subTab === "ventas" && (
        <VentasSection
          webRevenue={webRevenue}
          mlRevenueBruto={mlRevenueBruto}
          mlRevenueNeto={mlRevenueNeto}
          comisionML={comisionML}
          localesRevenue={localesRevenue}
          totalVentasBruto={totalVentasBruto}
          totalVentasNeto={totalVentasNeto}
          sinDatos={sinDatosVentas}
        />
      )}

      {subTab === "sueldos" && (
        <SueldosSection
          empleados={empleados}
          setEmpleados={setEmpleados}
          cargasSocialesPct={cargasSocialesPct}
          ventasNetasIva={ventasNetasIva}
          sinDatos={sinDatosSueldos}
        />
      )}

      {subTab === "gastos" && (
        <GastosSection
          categorias={categorias}
          setCategorias={setCategorias}
          sinDatos={sinDatosGastos}
        />
      )}

      {subTab === "inversiones" && (
        <InversionesSection embarques={embarques} setEmbarques={setEmbarques} sinDatos={sinDatosInversiones} />
      )}

      {subTab === "impuestos" && (
        <ImpuestosSection
          cargasSocialesPct={cargasSocialesPct}
          setCargasSocialesPct={setCargasSocialesPct}
          totalSueldos={totalSueldos}
          cargasSociales={cargasSociales}
          embarques={embarques}
          setEmbarques={setEmbarques}
          totalImpuestosInversion={totalImpuestosInversion}
          sinDatosInversiones={sinDatosInversiones}
          categorias={categorias}
          totalIvaGastos={totalIvaGastos}
        />
      )}
    </div>
  );
}

function ResumenSection({
  totalVentasNeto,
  totalCostoLaboral,
  totalGastos,
  totalAds,
  totalImpuestosInversion,
  resultadoNeto,
  breakeven,
  sinDatosSueldos,
  sinDatosGastos,
}: {
  totalVentasNeto: number;
  totalCostoLaboral: number;
  totalGastos: number;
  totalAds: number;
  totalImpuestosInversion: number;
  resultadoNeto: number;
  breakeven: number;
  sinDatosSueldos: boolean;
  sinDatosGastos: boolean;
}) {
  const pctVsBreakeven = breakeven > 0 ? resultadoNeto / breakeven : 0;
  const sem = semClass(resultadoNeto >= 0 ? 1 : 0);

  return (
    <div>
      {(sinDatosSueldos || sinDatosGastos) && (
        <div className="banner info mb-16">
          ℹ️ Completá los sueldos y gastos reales en las pestañas correspondientes para que este resumen sea preciso.
        </div>
      )}

      <div className="card section mb-16">
        <div className="card-title mb-12">Estado de resultados — mes actual (MTD)</div>
        <table>
          <tbody>
            <tr>
              <td>Ventas netas (Web + ML + Locales)</td>
              <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(totalVentasNeto)}</td>
            </tr>
            <tr>
              <td>− Sueldos, comisiones y cargas sociales</td>
              <td className="td-mono text-red" style={{ textAlign: "right" }}>−{fmtUSD(totalCostoLaboral)}</td>
            </tr>
            <tr>
              <td>− Gastos fijos y operativos</td>
              <td className="td-mono text-red" style={{ textAlign: "right" }}>−{fmtUSD(totalGastos)}</td>
            </tr>
            <tr>
              <td>− Inversión en Ads (últimos 30 días)</td>
              <td className="td-mono text-red" style={{ textAlign: "right" }}>−{fmtUSD(totalAds)}</td>
            </tr>
            <tr>
              <td>− Impuestos de importación (inversiones)</td>
              <td className="td-mono text-red" style={{ textAlign: "right" }}>−{fmtUSD(totalImpuestosInversion)}</td>
            </tr>
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td className="fw-600">Resultado neto</td>
              <td className={`td-mono fw-600 ${resultadoNeto >= 0 ? "text-green" : "text-red"}`} style={{ textAlign: "right" }}>{fmtUSD(resultadoNeto)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="breakeven-block">
        <div className="breakeven-title">Resultado neto vs. Breakeven Mensual</div>
        <div className="breakeven-main">
          <span className={`breakeven-val mono text-${sem === "verde" ? "green" : sem === "amarillo" ? "yellow" : "red"}`}>{fmtUSD(resultadoNeto)}</span>
          <span className="breakeven-meta">breakeven: {fmtUSD(breakeven)}</span>
          <span className={`semaforo ${sem}`}>{resultadoNeto >= 0 ? "Positivo" : "Negativo"}</span>
        </div>
        {breakeven > 0 && (
          <div className="forecast-item" style={{ marginTop: 12 }}>
            <div className="forecast-label">Variación vs breakeven</div>
            <div className={`forecast-value mono ${pctVsBreakeven >= 0 ? "text-green" : "text-red"}`}>{fmtPct(pctVsBreakeven)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function VentasSection({
  webRevenue,
  mlRevenueBruto,
  mlRevenueNeto,
  comisionML,
  localesRevenue,
  totalVentasBruto,
  totalVentasNeto,
  sinDatos,
}: {
  webRevenue: number;
  mlRevenueBruto: number;
  mlRevenueNeto: number;
  comisionML: number;
  localesRevenue: number;
  totalVentasBruto: number;
  totalVentasNeto: number;
  sinDatos: boolean;
}) {
  if (sinDatos) {
    return <div className="banner info">ℹ️ Conectá Shopify, MercadoLibre y Locales para ver el detalle de ventas.</div>;
  }

  const canales = [
    { nombre: "Web (Shopify)", bruto: webRevenue, neto: webRevenue },
    { nombre: "MercadoLibre", bruto: mlRevenueBruto, neto: mlRevenueNeto },
    { nombre: "Locales físicos", bruto: localesRevenue, neto: localesRevenue },
  ];

  return (
    <div>
      <div className="kpi-grid mb-16">
        <div className="card card-sm">
          <div className="card-title">Ventas brutas MTD</div>
          <div className="card-value-sm mono">{fmtUSD(totalVentasBruto)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Ventas netas MTD</div>
          <div className="card-value-sm mono">{fmtUSD(totalVentasNeto)}</div>
          <div className="card-sub">Después de comisión ML</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Comisión pagada ML</div>
          <div className="card-value-sm mono text-red">{fmtUSD(comisionML)}</div>
        </div>
      </div>

      <div className="card section">
        <div className="card-title mb-12">Ventas por canal — mes actual</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th style={{ textAlign: "right" }}>Bruto</th>
                <th style={{ textAlign: "right" }}>Neto</th>
                <th style={{ textAlign: "right" }}>% del total</th>
              </tr>
            </thead>
            <tbody>
              {canales.map((c) => (
                <tr key={c.nombre}>
                  <td>{c.nombre}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(c.bruto)}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(c.neto)}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{totalVentasBruto > 0 ? fmtPct(c.bruto / totalVentasBruto) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface EmpleadoForm {
  nombre: string;
  rol: string;
  sueldo_mensual_usd: string;
  comision_pct: string;
  activo: boolean;
}

const EMPLEADO_FORM_VACIO: EmpleadoForm = { nombre: "", rol: "", sueldo_mensual_usd: "", comision_pct: "0", activo: true };

function empleadoAForm(e: Empleado): EmpleadoForm {
  return {
    nombre: e.nombre,
    rol: e.rol,
    sueldo_mensual_usd: String(e.sueldo_mensual_usd),
    comision_pct: String((e.comision_pct || 0) * 100),
    activo: e.activo,
  };
}

function SueldosSection({
  empleados,
  setEmpleados,
  cargasSocialesPct,
  ventasNetasIva,
  sinDatos,
}: {
  empleados: Empleado[];
  setEmpleados: React.Dispatch<React.SetStateAction<Empleado[]>>;
  cargasSocialesPct: number;
  ventasNetasIva: number;
  sinDatos: boolean;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<EmpleadoForm>(EMPLEADO_FORM_VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const { guardando, error, aviso, ejecutar, setError } = useEstadoGuardado();

  const totalSueldos = empleados.filter((e) => e.activo).reduce((s, e) => s + (e.sueldo_mensual_usd || 0), 0);
  const totalComisiones = empleados.filter((e) => e.activo).reduce((s, e) => s + ventasNetasIva * (e.comision_pct || 0), 0);
  const cargasSociales = totalSueldos * cargasSocialesPct;
  const totalCostoLaboral = totalSueldos + totalComisiones + cargasSociales;

  function parseForm(f: EmpleadoForm) {
    const sueldo = parseFloat(f.sueldo_mensual_usd);
    const comisionPct = parseFloat(f.comision_pct || "0");
    if (!f.nombre.trim()) throw new Error("Falta el nombre.");
    if (!f.rol.trim()) throw new Error("Falta el rol.");
    if (Number.isNaN(sueldo) || sueldo < 0) throw new Error("Sueldo inválido.");
    if (Number.isNaN(comisionPct) || comisionPct < 0) throw new Error("Comisión inválida.");
    return { nombre: f.nombre.trim(), rol: f.rol.trim(), sueldo_mensual_usd: sueldo, comision_pct: comisionPct / 100, activo: f.activo };
  }

  async function handleAgregar(e: React.FormEvent) {
    e.preventDefault();
    await ejecutar(async () => {
      const parsed = parseForm(form);
      const data = await apiCall("/api/sueldos", { method: "POST", body: JSON.stringify(parsed) });
      setEmpleados((prev) => [...prev, data.empleado]);
      setForm(EMPLEADO_FORM_VACIO);
      setMostrarForm(false);
    });
  }

  async function handleGuardarEdicion(nombreOriginal: string, f: EmpleadoForm) {
    await ejecutar(async () => {
      const parsed = parseForm(f);
      const data = await apiCall("/api/sueldos", { method: "PATCH", body: JSON.stringify({ nombre_original: nombreOriginal, ...parsed }) });
      setEmpleados((prev) => prev.map((emp) => (emp.nombre === nombreOriginal ? data.empleado : emp)));
      setEditando(null);
    });
  }

  async function handleEliminar(nombre: string) {
    if (!confirm(`¿Eliminar a ${nombre}?`)) return;
    await ejecutar(async () => {
      await apiCall(`/api/sueldos?nombre=${encodeURIComponent(nombre)}`, { method: "DELETE" });
      setEmpleados((prev) => prev.filter((e) => e.nombre !== nombre));
    });
  }

  return (
    <div>
      {sinDatos && (
        <div className="banner info mb-16">
          ℹ️ Los sueldos están en 0. Usá el formulario de abajo para cargar los montos reales.
        </div>
      )}

      <AvisosGuardado error={error} aviso={aviso} />

      <div className="kpi-grid mb-16">
        <div className="card card-sm">
          <div className="card-title">Total sueldos</div>
          <div className="card-value-sm mono">{fmtUSD(totalSueldos)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Total comisiones</div>
          <div className="card-value-sm mono">{fmtUSD(totalComisiones)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Cargas sociales ({fmtPct(cargasSocialesPct)})</div>
          <div className="card-value-sm mono">{fmtUSD(cargasSociales)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Costo laboral total</div>
          <div className="card-value-sm mono text-red">{fmtUSD(totalCostoLaboral)}</div>
        </div>
      </div>

      <div className="banner info mb-16">
        ℹ️ El porcentaje de cargas sociales se edita en la pestaña "🏛️ Impuestos y cargas".
      </div>

      <div className="card section mb-16">
        <div className="flex-between mb-12">
          <div className="card-title" style={{ marginBottom: 0 }}>Equipo</div>
          <button className="btn btn-sm" onClick={() => { setMostrarForm(!mostrarForm); setError(null); }}>
            {mostrarForm ? "Cancelar" : "+ Agregar empleado"}
          </button>
        </div>

        {mostrarForm && (
          <form onSubmit={handleAgregar} className="form-grid mb-16" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
            <div>
              <label className="form-label">Nombre</label>
              <input className="form-input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">Rol</label>
              <input className="form-input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">Sueldo mensual (USD)</label>
              <input className="form-input mono" type="number" step="1" min="0" value={form.sueldo_mensual_usd} onChange={(e) => setForm({ ...form, sueldo_mensual_usd: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">Comisión sobre ventas (%)</label>
              <input className="form-input mono" type="number" step="0.1" min="0" value={form.comision_pct} onChange={(e) => setForm({ ...form, comision_pct: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={guardando}>Guardar</button>
          </form>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th style={{ textAlign: "right" }}>Sueldo mensual</th>
                <th style={{ textAlign: "right" }}>Comisión %</th>
                <th style={{ textAlign: "right" }}>Comisión ganada</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((emp) => (
                editando === emp.nombre ? (
                  <FilaEmpleadoEdicion
                    key={emp.nombre}
                    empleado={emp}
                    guardando={guardando}
                    onCancelar={() => setEditando(null)}
                    onGuardar={(f) => handleGuardarEdicion(emp.nombre, f)}
                  />
                ) : (
                  <tr key={emp.nombre}>
                    <td>{emp.nombre}</td>
                    <td className="text-dim">{emp.rol}</td>
                    <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(emp.sueldo_mensual_usd)}</td>
                    <td className="td-mono" style={{ textAlign: "right" }}>{fmtPct(emp.comision_pct || 0)}</td>
                    <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(emp.activo ? ventasNetasIva * (emp.comision_pct || 0) : 0)}</td>
                    <td className="td-mono fw-600" style={{ textAlign: "right" }}>{fmtUSD(emp.activo ? emp.sueldo_mensual_usd + ventasNetasIva * (emp.comision_pct || 0) : 0)}</td>
                    <td>{emp.activo ? "Sí" : "No"}</td>
                    <td>
                      <div className="btn-row">
                        <button className="icon-btn" title="Editar" onClick={() => setEditando(emp.nombre)}>✏️</button>
                        <button className="icon-btn" title="Eliminar" onClick={() => handleEliminar(emp.nombre)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {empleados.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-muted">Sin empleados cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilaEmpleadoEdicion({
  empleado,
  guardando,
  onCancelar,
  onGuardar,
}: {
  empleado: Empleado;
  guardando: boolean;
  onCancelar: () => void;
  onGuardar: (f: EmpleadoForm) => void;
}) {
  const [f, setF] = useState<EmpleadoForm>(empleadoAForm(empleado));

  return (
    <tr>
      <td><input className="form-input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></td>
      <td><input className="form-input" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })} /></td>
      <td><input className="form-input mono" type="number" style={{ textAlign: "right" }} value={f.sueldo_mensual_usd} onChange={(e) => setF({ ...f, sueldo_mensual_usd: e.target.value })} /></td>
      <td><input className="form-input mono" type="number" step="0.1" style={{ textAlign: "right" }} value={f.comision_pct} onChange={(e) => setF({ ...f, comision_pct: e.target.value })} /></td>
      <td className="text-muted" style={{ textAlign: "right" }}>—</td>
      <td className="text-muted" style={{ textAlign: "right" }}>—</td>
      <td>
        <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
      </td>
      <td>
        <div className="btn-row">
          <button className="icon-btn" title="Guardar" disabled={guardando} onClick={() => onGuardar(f)}>💾</button>
          <button className="icon-btn" title="Cancelar" disabled={guardando} onClick={onCancelar}>✖️</button>
        </div>
      </td>
    </tr>
  );
}

interface GastoForm {
  categoria: string;
  monto_mensual_usd: string;
  iva_usd: string;
  iva_pct: string;
}

const GASTO_FORM_VACIO: GastoForm = { categoria: "", monto_mensual_usd: "", iva_usd: "", iva_pct: "" };

// El monto ya incluye IVA: iva = monto * pct / (100 + pct) (extrae el IVA de un precio con impuesto incluido).
function calcularIvaDesdeMontoPct(montoStr: string, pctStr: string): string {
  const monto = parseFloat(montoStr);
  const pct = parseFloat(pctStr);
  if (Number.isNaN(monto) || monto <= 0 || Number.isNaN(pct) || pct < 0) return "";
  const iva = (monto * pct) / (100 + pct);
  return iva.toFixed(2);
}

// Para sugerir el % al editar un gasto que ya tiene IVA cargado.
function calcularPctDesdeMontoIva(monto: number, iva: number): string {
  if (!monto || !iva || monto <= iva) return "";
  const pct = (iva * 100) / (monto - iva);
  return pct.toFixed(2);
}

function GastosSection({
  categorias,
  setCategorias,
  sinDatos,
}: {
  categorias: CategoriaGasto[];
  setCategorias: React.Dispatch<React.SetStateAction<CategoriaGasto[]>>;
  sinDatos: boolean;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<GastoForm>(GASTO_FORM_VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<GastoForm>(GASTO_FORM_VACIO);
  const { guardando, error, aviso, ejecutar, setError } = useEstadoGuardado();

  const totalGastos = categorias.reduce((s, c) => s + (c.monto_mensual_usd || 0), 0);
  const totalIvaGastos = categorias.reduce((s, c) => s + (c.iva_usd || 0), 0);

  function parseForm(f: GastoForm) {
    const monto = parseFloat(f.monto_mensual_usd);
    const iva = parseFloat(f.iva_usd || "0");
    if (!f.categoria.trim()) throw new Error("Falta el nombre de la categoría.");
    if (Number.isNaN(monto) || monto < 0) throw new Error("Monto inválido.");
    if (Number.isNaN(iva) || iva < 0) throw new Error("IVA inválido.");
    return { categoria: f.categoria.trim(), monto_mensual_usd: monto, iva_usd: iva };
  }

  async function handleAgregar(e: React.FormEvent) {
    e.preventDefault();
    await ejecutar(async () => {
      const parsed = parseForm(form);
      const data = await apiCall("/api/gastos", { method: "POST", body: JSON.stringify(parsed) });
      setCategorias((prev) => [...prev, data.categoria]);
      setForm(GASTO_FORM_VACIO);
      setMostrarForm(false);
    });
  }

  async function handleGuardarEdicion(categoriaOriginal: string) {
    await ejecutar(async () => {
      const parsed = parseForm(editForm);
      const data = await apiCall("/api/gastos", { method: "PATCH", body: JSON.stringify({ categoria_original: categoriaOriginal, ...parsed }) });
      setCategorias((prev) => prev.map((c) => (c.categoria === categoriaOriginal ? data.categoria : c)));
      setEditando(null);
    });
  }

  async function handleEliminar(categoria: string) {
    if (!confirm(`¿Eliminar "${categoria}"?`)) return;
    await ejecutar(async () => {
      await apiCall(`/api/gastos?categoria=${encodeURIComponent(categoria)}`, { method: "DELETE" });
      setCategorias((prev) => prev.filter((c) => c.categoria !== categoria));
    });
  }

  return (
    <div>
      {sinDatos && (
        <div className="banner info mb-16">
          ℹ️ Los gastos están en 0. Usá el formulario de abajo para cargar los montos reales.
        </div>
      )}

      <AvisosGuardado error={error} aviso={aviso} />

      <div className="kpi-grid mb-16">
        <div className="card card-sm">
          <div className="card-title">Total gastos mensuales</div>
          <div className="card-value-sm mono text-red">{fmtUSD(totalGastos)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Total IVA incluido en gastos</div>
          <div className="card-value-sm mono">{fmtUSD(totalIvaGastos)}</div>
          <div className="card-sub">Ver detalle en "🏛️ Impuestos y cargas"</div>
        </div>
      </div>

      <div className="card section">
        <div className="flex-between mb-12">
          <div className="card-title" style={{ marginBottom: 0 }}>Gastos por categoría</div>
          <button className="btn btn-sm" onClick={() => { setMostrarForm(!mostrarForm); setError(null); }}>
            {mostrarForm ? "Cancelar" : "+ Agregar gasto"}
          </button>
        </div>

        {mostrarForm && (
          <form onSubmit={handleAgregar} className="form-grid mb-16" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
            <div>
              <label className="form-label">Categoría</label>
              <input className="form-input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">Monto mensual (USD)</label>
              <input
                className="form-input mono"
                type="number"
                step="1"
                min="0"
                value={form.monto_mensual_usd}
                onChange={(e) => {
                  const monto = e.target.value;
                  const iva = form.iva_pct ? calcularIvaDesdeMontoPct(monto, form.iva_pct) : form.iva_usd;
                  setForm({ ...form, monto_mensual_usd: monto, iva_usd: iva });
                }}
                required
              />
            </div>
            <div>
              <label className="form-label">IVA incluido en el monto (USD, opcional)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="form-input mono"
                  type="number"
                  step="1"
                  min="0"
                  value={form.iva_usd}
                  onChange={(e) => setForm({ ...form, iva_usd: e.target.value, iva_pct: "" })}
                  placeholder="0"
                />
                <input
                  className="form-input mono"
                  type="number"
                  step="0.1"
                  min="0"
                  style={{ maxWidth: 90 }}
                  value={form.iva_pct}
                  onChange={(e) => {
                    const pct = e.target.value;
                    const iva = calcularIvaDesdeMontoPct(form.monto_mensual_usd, pct);
                    setForm({ ...form, iva_pct: pct, iva_usd: iva || form.iva_usd });
                  }}
                  placeholder="% IVA"
                  title="Poné el % de IVA y se calcula solo el monto"
                />
              </div>
              <div className="form-hint">No es un monto extra: es la parte del monto mensual que ya corresponde a IVA. Poné el % (ej. 22) y se calcula solo, o cargá el monto directamente. Dejalo en 0 si el gasto no lleva IVA.</div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={guardando}>Guardar</button>
          </form>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th style={{ textAlign: "right" }}>Monto mensual</th>
                <th style={{ textAlign: "right" }}>IVA incluido</th>
                <th style={{ textAlign: "right" }}>% del total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => (
                editando === c.categoria ? (
                  <tr key={c.categoria}>
                    <td><input className="form-input" value={editForm.categoria} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })} /></td>
                    <td>
                      <input
                        className="form-input mono"
                        type="number"
                        style={{ textAlign: "right" }}
                        value={editForm.monto_mensual_usd}
                        onChange={(e) => {
                          const monto = e.target.value;
                          const iva = editForm.iva_pct ? calcularIvaDesdeMontoPct(monto, editForm.iva_pct) : editForm.iva_usd;
                          setEditForm({ ...editForm, monto_mensual_usd: monto, iva_usd: iva });
                        }}
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          className="form-input mono"
                          type="number"
                          style={{ textAlign: "right" }}
                          value={editForm.iva_usd}
                          onChange={(e) => setEditForm({ ...editForm, iva_usd: e.target.value, iva_pct: "" })}
                        />
                        <input
                          className="form-input mono"
                          type="number"
                          step="0.1"
                          style={{ textAlign: "right", maxWidth: 64 }}
                          value={editForm.iva_pct}
                          onChange={(e) => {
                            const pct = e.target.value;
                            const iva = calcularIvaDesdeMontoPct(editForm.monto_mensual_usd, pct);
                            setEditForm({ ...editForm, iva_pct: pct, iva_usd: iva || editForm.iva_usd });
                          }}
                          placeholder="%"
                          title="% IVA sobre el monto"
                        />
                      </div>
                    </td>
                    <td className="text-muted" style={{ textAlign: "right" }}>—</td>
                    <td>
                      <div className="btn-row">
                        <button className="icon-btn" title="Guardar" disabled={guardando} onClick={() => handleGuardarEdicion(c.categoria)}>💾</button>
                        <button className="icon-btn" title="Cancelar" disabled={guardando} onClick={() => setEditando(null)}>✖️</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.categoria}>
                    <td>{c.categoria}</td>
                    <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(c.monto_mensual_usd)}</td>
                    <td className="td-mono" style={{ textAlign: "right" }}>{c.iva_usd ? fmtUSD(c.iva_usd) : "—"}</td>
                    <td className="td-mono" style={{ textAlign: "right" }}>{totalGastos > 0 ? fmtPct(c.monto_mensual_usd / totalGastos) : "—"}</td>
                    <td>
                      <div className="btn-row">
                        <button
                          className="icon-btn"
                          title="Editar"
                          onClick={() => {
                            setEditando(c.categoria);
                            setEditForm({
                              categoria: c.categoria,
                              monto_mensual_usd: String(c.monto_mensual_usd),
                              iva_usd: String(c.iva_usd || 0),
                              iva_pct: calcularPctDesdeMontoIva(c.monto_mensual_usd, c.iva_usd || 0),
                            });
                          }}
                        >
                          ✏️
                        </button>
                        <button className="icon-btn" title="Eliminar" onClick={() => handleEliminar(c.categoria)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {categorias.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted">Sin categorías cargadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface EmbarqueForm {
  descripcion: string;
  proveedor: string;
  categoria: string;
  monto_usd: string;
  impuestos_usd: string;
  fecha_pedido: string;
  fecha_eta: string;
  estado: string;
  notas: string;
}

const EMBARQUE_FORM_VACIO: EmbarqueForm = {
  descripcion: "",
  proveedor: "",
  categoria: "alfombras",
  monto_usd: "",
  impuestos_usd: "0",
  fecha_pedido: "",
  fecha_eta: "",
  estado: "pedido",
  notas: "",
};

function embarqueAForm(e: Embarque): EmbarqueForm {
  return {
    descripcion: e.descripcion,
    proveedor: e.proveedor || "",
    categoria: e.categoria,
    monto_usd: String(e.monto_usd),
    impuestos_usd: String(e.impuestos_usd || 0),
    fecha_pedido: e.fecha_pedido || "",
    fecha_eta: e.fecha_eta || "",
    estado: e.estado,
    notas: e.notas || "",
  };
}

function InversionesSection({
  embarques,
  setEmbarques,
  sinDatos,
}: {
  embarques: Embarque[];
  setEmbarques: React.Dispatch<React.SetStateAction<Embarque[]>>;
  sinDatos: boolean;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<EmbarqueForm>(EMBARQUE_FORM_VACIO);
  const [editando, setEditando] = useState<string | undefined>(undefined);
  const { guardando, error, aviso, ejecutar, setError } = useEstadoGuardado();

  const totalInvertido = embarques.reduce((s, e) => s + (e.monto_usd || 0), 0);
  const totalRecibido = embarques.filter((e) => e.estado === "recibido").reduce((s, e) => s + (e.monto_usd || 0), 0);
  const totalPendiente = totalInvertido - totalRecibido;

  const ordenados = [...embarques].sort((a, b) => (b.fecha_pedido || "").localeCompare(a.fecha_pedido || ""));

  function parseForm(f: EmbarqueForm) {
    const monto = parseFloat(f.monto_usd);
    const impuestos = parseFloat(f.impuestos_usd || "0");
    if (!f.descripcion.trim()) throw new Error("Falta la descripción.");
    if (Number.isNaN(monto) || monto < 0) throw new Error("Monto inválido.");
    if (Number.isNaN(impuestos) || impuestos < 0) throw new Error("Impuestos inválidos.");
    return {
      descripcion: f.descripcion.trim(),
      proveedor: f.proveedor.trim(),
      categoria: f.categoria,
      monto_usd: monto,
      impuestos_usd: impuestos,
      fecha_pedido: f.fecha_pedido || null,
      fecha_eta: f.fecha_eta || null,
      estado: f.estado,
      notas: f.notas.trim(),
    };
  }

  async function handleAgregar(e: React.FormEvent) {
    e.preventDefault();
    await ejecutar(async () => {
      const parsed = parseForm(form);
      const data = await apiCall("/api/inversiones", { method: "POST", body: JSON.stringify(parsed) });
      setEmbarques((prev) => [data.embarque, ...prev]);
      setForm(EMBARQUE_FORM_VACIO);
      setMostrarForm(false);
    });
  }

  async function handleGuardarEdicion(id: string, f: EmbarqueForm) {
    await ejecutar(async () => {
      const parsed = parseForm(f);
      const data = await apiCall("/api/inversiones", { method: "PATCH", body: JSON.stringify({ id, ...parsed }) });
      setEmbarques((prev) => prev.map((emb) => (emb.id === id ? data.embarque : emb)));
      setEditando(undefined);
    });
  }

  async function handleEliminar(id: string, descripcion: string) {
    if (!confirm(`¿Eliminar "${descripcion}"?`)) return;
    await ejecutar(async () => {
      await apiCall(`/api/inversiones?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setEmbarques((prev) => prev.filter((e) => e.id !== id));
    });
  }

  async function handleMarcarRecibido(id: string) {
    await ejecutar(async () => {
      const data = await apiCall("/api/inversiones", { method: "PATCH", body: JSON.stringify({ id, estado: "recibido" }) });
      setEmbarques((prev) => prev.map((e) => (e.id === id ? data.embarque : e)));
    });
  }

  return (
    <div>
      {sinDatos && (
        <div className="banner info mb-16">
          ℹ️ No hay embarques cargados. Usá el formulario de abajo para agregar el primero.
        </div>
      )}

      <AvisosGuardado error={error} aviso={aviso} />

      <div className="kpi-grid mb-16">
        <div className="card card-sm">
          <div className="card-title">Total invertido</div>
          <div className="card-value-sm mono">{fmtUSD(totalInvertido)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Pendiente de recibir</div>
          <div className="card-value-sm mono text-yellow">{fmtUSD(totalPendiente)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Recibido</div>
          <div className="card-value-sm mono text-green">{fmtUSD(totalRecibido)}</div>
        </div>
      </div>

      <div className="card section">
        <div className="flex-between mb-12">
          <div className="card-title" style={{ marginBottom: 0 }}>Embarques e inversiones</div>
          <button className="btn btn-sm" onClick={() => { setMostrarForm(!mostrarForm); setError(null); }}>
            {mostrarForm ? "Cancelar" : "+ Agregar embarque"}
          </button>
        </div>

        {mostrarForm && (
          <form onSubmit={handleAgregar} className="form-grid mb-16" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
            <div>
              <label className="form-label">Descripción</label>
              <input className="form-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">Proveedor</label>
              <input className="form-input" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Categoría</label>
              <select className="form-select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {Object.entries(CATEGORIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Monto (USD)</label>
              <input className="form-input mono" type="number" step="1" min="0" value={form.monto_usd} onChange={(e) => setForm({ ...form, monto_usd: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">Impuestos de importación (USD)</label>
              <input className="form-input mono" type="number" step="1" min="0" value={form.impuestos_usd} onChange={(e) => setForm({ ...form, impuestos_usd: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Fecha pedido</label>
              <input className="form-input mono" type="date" value={form.fecha_pedido} onChange={(e) => setForm({ ...form, fecha_pedido: e.target.value })} />
            </div>
            <div>
              <label className="form-label">ETA</label>
              <input className="form-input mono" type="date" value={form.fecha_eta} onChange={(e) => setForm({ ...form, fecha_eta: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Estado</label>
              <select className="form-select" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                {Object.entries(ESTADO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Notas</label>
              <input className="form-input" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={guardando}>Guardar</button>
          </form>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Proveedor</th>
                <th>Categoría</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th style={{ textAlign: "right" }}>Impuestos</th>
                <th>Fecha pedido</th>
                <th>ETA</th>
                <th>Estado</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((e) => (
                editando === e.id ? (
                  <FilaEmbarqueEdicion
                    key={e.id}
                    embarque={e}
                    guardando={guardando}
                    onCancelar={() => setEditando(undefined)}
                    onGuardar={(f) => handleGuardarEdicion(e.id!, f)}
                  />
                ) : (
                  <tr key={e.id}>
                    <td>{e.descripcion}</td>
                    <td className="text-dim">{e.proveedor}</td>
                    <td>{CATEGORIA_LABELS[e.categoria] || e.categoria}</td>
                    <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(e.monto_usd)}</td>
                    <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(e.impuestos_usd || 0)}</td>
                    <td className="mono">{fmtFecha(e.fecha_pedido)}</td>
                    <td className="mono">{fmtFecha(e.fecha_eta)}</td>
                    <td>
                      <span className={`semaforo ${e.estado === "recibido" ? "verde" : e.estado === "en_aduana" ? "amarillo" : "rojo"}`}>
                        {ESTADO_LABELS[e.estado] || e.estado}
                      </span>
                    </td>
                    <td className="text-dim">{e.notas || "—"}</td>
                    <td>
                      <div className="btn-row">
                        {e.estado !== "recibido" && (
                          <button className="icon-btn" title="Marcar recibido" disabled={guardando} onClick={() => handleMarcarRecibido(e.id!)}>📦</button>
                        )}
                        <button className="icon-btn" title="Editar" onClick={() => setEditando(e.id)}>✏️</button>
                        <button className="icon-btn" title="Eliminar" onClick={() => handleEliminar(e.id!, e.descripcion)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-muted">Sin embarques cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilaEmbarqueEdicion({
  embarque,
  guardando,
  onCancelar,
  onGuardar,
}: {
  embarque: Embarque;
  guardando: boolean;
  onCancelar: () => void;
  onGuardar: (f: EmbarqueForm) => void;
}) {
  const [f, setF] = useState<EmbarqueForm>(embarqueAForm(embarque));

  return (
    <tr>
      <td><input className="form-input" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></td>
      <td><input className="form-input" value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} /></td>
      <td>
        <select className="form-select" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
          {Object.entries(CATEGORIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td><input className="form-input mono" type="number" style={{ textAlign: "right" }} value={f.monto_usd} onChange={(e) => setF({ ...f, monto_usd: e.target.value })} /></td>
      <td><input className="form-input mono" type="number" style={{ textAlign: "right" }} value={f.impuestos_usd} onChange={(e) => setF({ ...f, impuestos_usd: e.target.value })} /></td>
      <td><input className="form-input mono" type="date" value={f.fecha_pedido} onChange={(e) => setF({ ...f, fecha_pedido: e.target.value })} /></td>
      <td><input className="form-input mono" type="date" value={f.fecha_eta} onChange={(e) => setF({ ...f, fecha_eta: e.target.value })} /></td>
      <td>
        <select className="form-select" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
          {Object.entries(ESTADO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td><input className="form-input" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></td>
      <td>
        <div className="btn-row">
          <button className="icon-btn" title="Guardar" disabled={guardando} onClick={() => onGuardar(f)}>💾</button>
          <button className="icon-btn" title="Cancelar" disabled={guardando} onClick={onCancelar}>✖️</button>
        </div>
      </td>
    </tr>
  );
}

function ImpuestosSection({
  cargasSocialesPct,
  setCargasSocialesPct,
  totalSueldos,
  cargasSociales,
  embarques,
  setEmbarques,
  totalImpuestosInversion,
  sinDatosInversiones,
  categorias,
  totalIvaGastos,
}: {
  cargasSocialesPct: number;
  setCargasSocialesPct: React.Dispatch<React.SetStateAction<number>>;
  totalSueldos: number;
  cargasSociales: number;
  embarques: Embarque[];
  setEmbarques: React.Dispatch<React.SetStateAction<Embarque[]>>;
  totalImpuestosInversion: number;
  sinDatosInversiones: boolean;
  categorias: CategoriaGasto[];
  totalIvaGastos: number;
}) {
  const [cargasSocialesInput, setCargasSocialesInput] = useState(String(cargasSocialesPct * 100));
  const [editandoId, setEditandoId] = useState<string | undefined>(undefined);
  const [impuestoInput, setImpuestoInput] = useState("");
  const { guardando, error, aviso, ejecutar, setError } = useEstadoGuardado();

  async function handleGuardarCargasSociales() {
    await ejecutar(async () => {
      const pct = parseFloat(cargasSocialesInput);
      if (Number.isNaN(pct) || pct < 0) throw new Error("Cargas sociales inválidas.");
      await apiCall("/api/sueldos", { method: "POST", body: JSON.stringify({ resource: "config", cargas_sociales_pct: pct / 100 }) });
      setCargasSocialesPct(pct / 100);
    });
  }

  async function handleGuardarImpuesto(id: string) {
    await ejecutar(async () => {
      const impuestos = parseFloat(impuestoInput || "0");
      if (Number.isNaN(impuestos) || impuestos < 0) throw new Error("Impuestos inválidos.");
      const data = await apiCall("/api/inversiones", { method: "PATCH", body: JSON.stringify({ id, impuestos_usd: impuestos }) });
      setEmbarques((prev) => prev.map((e) => (e.id === id ? data.embarque : e)));
      setEditandoId(undefined);
    });
  }

  const ordenados = [...embarques].sort((a, b) => (b.fecha_pedido || "").localeCompare(a.fecha_pedido || ""));

  return (
    <div>
      <AvisosGuardado error={error} aviso={aviso} />

      <div className="kpi-grid mb-16">
        <div className="card card-sm">
          <div className="card-title">Cargas sociales ({fmtPct(cargasSocialesPct)})</div>
          <div className="card-value-sm mono">{fmtUSD(cargasSociales)}</div>
          <div className="card-sub">Sobre {fmtUSD(totalSueldos)} de sueldos fijos</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Impuestos de importación</div>
          <div className="card-value-sm mono text-red">{fmtUSD(totalImpuestosInversion)}</div>
          <div className="card-sub">Sobre embarques e inversiones</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">IVA incluido en gastos</div>
          <div className="card-value-sm mono">{fmtUSD(totalIvaGastos)}</div>
          <div className="card-sub">Ya está dentro del monto de cada gasto, no se suma aparte</div>
        </div>
      </div>

      <div className="card section mb-16">
        <div className="card-title mb-12">Cargas sociales de empleados</div>
        <div className="form-grid" style={{ maxWidth: 320 }}>
          <div>
            <label className="form-label">Cargas sociales sobre sueldo fijo (%)</label>
            <input
              className="form-input mono"
              type="number"
              step="0.1"
              min="0"
              value={cargasSocialesInput}
              onChange={(e) => setCargasSocialesInput(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" disabled={guardando} onClick={handleGuardarCargasSociales}>
            Guardar
          </button>
        </div>
      </div>

      <div className="card section">
        <div className="card-title mb-12">Impuestos de importación por embarque</div>
        {sinDatosInversiones && (
          <div className="banner info mb-16">
            ℹ️ No hay embarques cargados todavía. Agregalos desde la pestaña "🚢 Inversiones".
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Proveedor</th>
                <th style={{ textAlign: "right" }}>Monto embarque</th>
                <th style={{ textAlign: "right" }}>Impuestos</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((e) => (
                <tr key={e.id}>
                  <td>{e.descripcion}</td>
                  <td className="text-dim">{e.proveedor}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(e.monto_usd)}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>
                    {editandoId === e.id ? (
                      <input
                        className="form-input mono"
                        type="number"
                        style={{ textAlign: "right" }}
                        value={impuestoInput}
                        onChange={(ev) => setImpuestoInput(ev.target.value)}
                      />
                    ) : (
                      fmtUSD(e.impuestos_usd || 0)
                    )}
                  </td>
                  <td>
                    <span className={`semaforo ${e.estado === "recibido" ? "verde" : e.estado === "en_aduana" ? "amarillo" : "rojo"}`}>
                      {ESTADO_LABELS[e.estado] || e.estado}
                    </span>
                  </td>
                  <td>
                    {editandoId === e.id ? (
                      <div className="btn-row">
                        <button className="icon-btn" title="Guardar" disabled={guardando} onClick={() => handleGuardarImpuesto(e.id!)}>💾</button>
                        <button className="icon-btn" title="Cancelar" disabled={guardando} onClick={() => setEditandoId(undefined)}>✖️</button>
                      </div>
                    ) : (
                      <button
                        className="icon-btn"
                        title="Editar impuestos"
                        onClick={() => { setEditandoId(e.id); setImpuestoInput(String(e.impuestos_usd || 0)); setError(null); }}
                      >
                        ✏️
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted">Sin embarques cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section" style={{ marginTop: 16 }}>
        <div className="card-title mb-12">IVA incluido por gasto</div>
        <div className="banner info mb-16">
          ℹ️ El monto de IVA de cada gasto se carga desde la pestaña "🧾 Gastos" (es opcional, no todos los gastos llevan IVA). Es la parte del monto que ya corresponde a IVA, no un cargo adicional.
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoría de gasto</th>
                <th style={{ textAlign: "right" }}>Monto del gasto</th>
                <th style={{ textAlign: "right" }}>IVA incluido</th>
              </tr>
            </thead>
            <tbody>
              {categorias.filter((c) => (c.iva_usd || 0) > 0).map((c) => (
                <tr key={c.categoria}>
                  <td>{c.categoria}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(c.monto_mensual_usd)}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(c.iva_usd || 0)}</td>
                </tr>
              ))}
              {categorias.filter((c) => (c.iva_usd || 0) > 0).length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted">Ningún gasto tiene IVA registrado todavía.</td>
                </tr>
              )}
            </tbody>
            {totalIvaGastos > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td className="fw-600">Total IVA</td>
                  <td></td>
                  <td className="td-mono fw-600" style={{ textAlign: "right" }}>{fmtUSD(totalIvaGastos)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
