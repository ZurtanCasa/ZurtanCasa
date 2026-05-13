"use client";

interface ShopifyData {
  mes_actual: { orders_count: number; revenue_bruto: number; aov: number; refunds: number };
  _status: string;
}

interface MLData {
  mes_actual: { orders_count: number; revenue_bruto: number; revenue_neto_post_comision: number; comision_pagada: number; aov: number };
  _status: string;
}

interface FunnelTabProps {
  shopify: ShopifyData;
  ml: MLData;
  promoActiva: boolean;
  comisionML: number;
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function FunnelTab({ shopify, ml, promoActiva, comisionML }: FunnelTabProps) {
  const sinDatosShopify = shopify._status === "sin_datos";
  const sinDatosML = ml._status === "sin_datos";

  return (
    <div>
      {promoActiva && (
        <div className="banner warning">🏷️ Promo activa este mes — AOV bajo es esperado, no es una alerta.</div>
      )}

      <div className="section">
        <div className="section-title">🛒 Shopify — Web MTD</div>
        {sinDatosShopify ? (
          <div className="card"><div className="sin-datos"><div className="sin-datos-icon">🛒</div><div className="sin-datos-titulo">Sin datos de Shopify</div><div className="sin-datos-desc">Conectá Shopify para ver métricas web.</div></div></div>
        ) : (
          <div className="kpi-grid-4">
            {[
              { title: "Revenue Bruto", value: fmtUSD(shopify.mes_actual.revenue_bruto) },
              { title: "Órdenes", value: shopify.mes_actual.orders_count.toString() },
              { title: "AOV", value: fmtUSD(shopify.mes_actual.aov) },
              { title: "Refunds", value: fmtUSD(shopify.mes_actual.refunds) },
            ].map(({ title, value }) => (
              <div key={title} className="card card-sm">
                <div className="card-title">{title}</div>
                <div className="card-value-sm mono">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">🟡 MercadoLibre — Marketplace MTD</div>
        {sinDatosML ? (
          <div className="card"><div className="sin-datos"><div className="sin-datos-icon">🟡</div><div className="sin-datos-titulo">Sin datos de MercadoLibre</div><div className="sin-datos-desc">Conectá ML OAuth para ver métricas.</div></div></div>
        ) : (
          <>
            <div className="kpi-grid-4 mb-12">
              {[
                { title: "Revenue Bruto", value: fmtUSD(ml.mes_actual.revenue_bruto), sub: "Con IVA" },
                { title: "Revenue Neto", value: fmtUSD(ml.mes_actual.revenue_neto_post_comision), sub: `Post comisión ${(comisionML * 100).toFixed(0)}%` },
                { title: "Comisión Pagada", value: fmtUSD(ml.mes_actual.comision_pagada), sub: "A MercadoLibre" },
                { title: "Órdenes", value: ml.mes_actual.orders_count.toString(), sub: `AOV: ${fmtUSD(ml.mes_actual.aov)}` },
              ].map(({ title, value, sub }) => (
                <div key={title} className="card card-sm">
                  <div className="card-title">{title}</div>
                  <div className="card-value-sm mono">{value}</div>
                  <div className="card-sub">{sub}</div>
                </div>
              ))}
            </div>
            <div className="card card-sm">
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                ⚠️ El neto de MercadoLibre ya descuenta la comisión del {(comisionML * 100).toFixed(0)}%. Este es el número real que entra a la empresa.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
