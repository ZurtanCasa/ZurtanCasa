"use client";
import { useState } from "react";

type SubTab = "ventas" | "sueldos" | "gastos" | "inversiones" | "resumen";

const SUBTAB_LABELS: Record<SubTab, string> = {
  ventas: "💰 Ventas",
  sueldos: "👥 Sueldos",
  gastos: "🧾 Gastos",
  inversiones: "🚢 Inversiones",
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
}

interface Gastos {
  _status: string;
  categorias: CategoriaGasto[];
}

interface Embarque {
  descripcion: string;
  proveedor: string;
  categoria: string;
  monto_usd: number;
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

export default function FinancieroTab({ shopify, mercadolibre, locales, meta, google, sueldos, gastos, inversiones, contexto }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("resumen");

  const webRevenue = shopify?.mes_actual?.revenue_bruto || 0;
  const mlRevenueBruto = mercadolibre?.mes_actual?.revenue_bruto || 0;
  const mlRevenueNeto = mercadolibre?.mes_actual?.revenue_neto_post_comision || 0;
  const comisionML = mercadolibre?.mes_actual?.comision_pagada || 0;
  const localesRevenue = locales?.locales?.reduce((s: number, l: any) => s + (l.mes_actual?.revenue || 0), 0) || 0;
  const totalVentasBruto = webRevenue + mlRevenueBruto + localesRevenue;
  const totalVentasNeto = webRevenue + mlRevenueNeto + localesRevenue;

  const empleadosActivos = (sueldos?.empleados || []).filter((e) => e.activo);
  const totalSueldos = empleadosActivos.reduce((s, e) => s + (e.sueldo_mensual_usd || 0), 0);
  const cargasSociales = totalSueldos * (sueldos?.cargas_sociales_pct || 0);
  const totalCostoLaboral = totalSueldos + cargasSociales;

  const totalGastos = (gastos?.categorias || []).reduce((s, c) => s + (c.monto_mensual_usd || 0), 0);

  const embarques = inversiones?.embarques || [];
  const totalInvertido = embarques.reduce((s, e) => s + (e.monto_usd || 0), 0);
  const totalRecibido = embarques.filter((e) => e.estado === "recibido").reduce((s, e) => s + (e.monto_usd || 0), 0);
  const totalPendiente = totalInvertido - totalRecibido;

  const spendMeta = meta?.periodos?.last_30d?.spend || 0;
  const spendGoogle = google?.periodos?.last_30d?.spend || 0;
  const totalAds = spendMeta + spendGoogle;

  const resultadoNeto = totalVentasNeto - totalCostoLaboral - totalGastos - totalAds;
  const breakeven = contexto?.breakeven_mensual?.usd || 0;

  const sinDatosVentas = shopify?._status === "sin_datos" && mercadolibre?._status === "sin_datos" && locales?._status === "sin_datos";
  const sinDatosSueldos = sueldos?._status === "sin_datos";
  const sinDatosGastos = gastos?._status === "sin_datos";
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
          empleados={sueldos?.empleados || []}
          cargasSocialesPct={sueldos?.cargas_sociales_pct || 0}
          totalSueldos={totalSueldos}
          cargasSociales={cargasSociales}
          totalCostoLaboral={totalCostoLaboral}
          sinDatos={sinDatosSueldos}
        />
      )}

      {subTab === "gastos" && (
        <GastosSection
          categorias={gastos?.categorias || []}
          totalGastos={totalGastos}
          sinDatos={sinDatosGastos}
        />
      )}

      {subTab === "inversiones" && (
        <InversionesSection
          embarques={embarques}
          totalInvertido={totalInvertido}
          totalRecibido={totalRecibido}
          totalPendiente={totalPendiente}
          sinDatos={sinDatosInversiones}
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
  resultadoNeto,
  breakeven,
  sinDatosSueldos,
  sinDatosGastos,
}: {
  totalVentasNeto: number;
  totalCostoLaboral: number;
  totalGastos: number;
  totalAds: number;
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
          ℹ️ Completá <span className="mono">data/sueldos.json</span> y <span className="mono">data/gastos.json</span> con los montos reales para que este resumen sea preciso.
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
              <td>− Sueldos y cargas sociales</td>
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

function SueldosSection({
  empleados,
  cargasSocialesPct,
  totalSueldos,
  cargasSociales,
  totalCostoLaboral,
  sinDatos,
}: {
  empleados: Empleado[];
  cargasSocialesPct: number;
  totalSueldos: number;
  cargasSociales: number;
  totalCostoLaboral: number;
  sinDatos: boolean;
}) {
  return (
    <div>
      {sinDatos && (
        <div className="banner info mb-16">
          ℹ️ Los sueldos están en 0. Editá <span className="mono">data/sueldos.json</span> con los montos reales de cada persona (y opcionalmente <span className="mono">cargas_sociales_pct</span>).
        </div>
      )}

      <div className="kpi-grid mb-16">
        <div className="card card-sm">
          <div className="card-title">Total sueldos</div>
          <div className="card-value-sm mono">{fmtUSD(totalSueldos)}</div>
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

      <div className="card section">
        <div className="card-title mb-12">Equipo — sueldo mensual</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th style={{ textAlign: "right" }}>Sueldo mensual</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((e) => (
                <tr key={e.nombre}>
                  <td>{e.nombre}</td>
                  <td className="text-dim">{e.rol}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(e.sueldo_mensual_usd)}</td>
                </tr>
              ))}
              {empleados.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted">Sin empleados cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GastosSection({
  categorias,
  totalGastos,
  sinDatos,
}: {
  categorias: CategoriaGasto[];
  totalGastos: number;
  sinDatos: boolean;
}) {
  return (
    <div>
      {sinDatos && (
        <div className="banner info mb-16">
          ℹ️ Los gastos están en 0. Editá <span className="mono">data/gastos.json</span> con los montos reales de cada categoría (podés agregar o quitar categorías).
        </div>
      )}

      <div className="kpi-grid mb-16">
        <div className="card card-sm">
          <div className="card-title">Total gastos mensuales</div>
          <div className="card-value-sm mono text-red">{fmtUSD(totalGastos)}</div>
        </div>
      </div>

      <div className="card section">
        <div className="card-title mb-12">Gastos por categoría</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th style={{ textAlign: "right" }}>Monto mensual</th>
                <th style={{ textAlign: "right" }}>% del total</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => (
                <tr key={c.categoria}>
                  <td>{c.categoria}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(c.monto_mensual_usd)}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{totalGastos > 0 ? fmtPct(c.monto_mensual_usd / totalGastos) : "—"}</td>
                </tr>
              ))}
              {categorias.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted">Sin categorías cargadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InversionesSection({
  embarques,
  totalInvertido,
  totalRecibido,
  totalPendiente,
  sinDatos,
}: {
  embarques: Embarque[];
  totalInvertido: number;
  totalRecibido: number;
  totalPendiente: number;
  sinDatos: boolean;
}) {
  const ordenados = [...embarques].sort((a, b) => (b.fecha_pedido || "").localeCompare(a.fecha_pedido || ""));

  return (
    <div>
      {sinDatos && (
        <div className="banner info mb-16">
          ℹ️ No hay embarques cargados. Editá <span className="mono">data/inversiones.json</span> agregando un objeto por cada embarque (alfombras, muebles, etc.) en <span className="mono">embarques</span>.
        </div>
      )}

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
        <div className="card-title mb-12">Embarques e inversiones</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Proveedor</th>
                <th>Categoría</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th>Fecha pedido</th>
                <th>ETA</th>
                <th>Estado</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((e, i) => (
                <tr key={i}>
                  <td>{e.descripcion}</td>
                  <td className="text-dim">{e.proveedor}</td>
                  <td>{CATEGORIA_LABELS[e.categoria] || e.categoria}</td>
                  <td className="td-mono" style={{ textAlign: "right" }}>{fmtUSD(e.monto_usd)}</td>
                  <td className="mono">{fmtFecha(e.fecha_pedido)}</td>
                  <td className="mono">{fmtFecha(e.fecha_eta)}</td>
                  <td>
                    <span className={`semaforo ${e.estado === "recibido" ? "verde" : e.estado === "en_aduana" ? "amarillo" : "rojo"}`}>
                      {ESTADO_LABELS[e.estado] || e.estado}
                    </span>
                  </td>
                  <td className="text-dim">{e.notas || "—"}</td>
                </tr>
              ))}
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-muted">Sin embarques cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
