"use client";
import { useState } from "react";
import Sidebar, { TabId } from "./Sidebar";
import CeoTab from "./tabs/CeoTab";
import ChatTab from "./tabs/ChatTab";
import PerformanceTab from "./tabs/PerformanceTab";
import AdsTab from "./tabs/AdsTab";
import RoasTab from "./tabs/RoasTab";
import FunnelTab from "./tabs/FunnelTab";
import LocalesTab from "./tabs/LocalesTab";
import PlanTab from "./tabs/PlanTab";
import ArticulosTab from "./tabs/ArticulosTab";
import PreciosTab from "./tabs/PreciosTab";
import TutorialTab from "./tabs/TutorialTab";

interface DashboardProps {
  shopify: any;
  mercadolibre: any;
  meta: any;
  google: any;
  ga4: any;
  locales: any;
  articulos: any;
  precios: any;
  muebles: any;
  plan: any;
  contexto: any;
  ceo: any;
}

const TAB_TITLES: Record<TabId, string> = {
  ceo: "🧠 Análisis CEO",
  chat: "💬 Chat con el CEO",
  performance: "📊 Performance",
  ads: "📈 Ads Daily",
  roas: "🎯 ROAS Triangulado",
  funnel: "🛒 Funnel & Marketplace",
  locales: "🏪 Locales Físicos",
  articulos: "📦 Artículos & Categorías",
  precios: "💰 Lista de Precios",
  plan: "📅 Plan vs Real",
  tutorial: "📚 Tutorial",
};

function buildPlanRows(plan: any, shopify: any, ml: any, locales: any): any[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const share = plan.targets_por_canal || {};
    const totalPlan = (share.fisico || 0) + (share.web || 0) + (share.marketplace || 0);
    const planTotal = totalPlan / 12;

    const realWeb = shopify.historico_mensual?.find((r: any) => r.year === new Date().getFullYear() && r.month === m)?.revenue_bruto || 0;
    const realML = ml.historico_mensual?.find((r: any) => r.year === new Date().getFullYear() && r.month === m)?.revenue_bruto || 0;
    const realFisico = locales.locales?.reduce((s: number, l: any) => {
      return s + (l.historico_mensual?.find((r: any) => r.year === new Date().getFullYear() && r.month === m)?.revenue || 0);
    }, 0) || 0;

    return {
      mes: m,
      plan_fisico: (share.fisico || 0) / 12,
      real_fisico: realFisico,
      plan_web: (share.web || 0) / 12,
      real_web: realWeb,
      plan_ml: (share.marketplace || 0) / 12,
      real_ml: realML,
      plan_total: planTotal,
      real_total: realWeb + realML + realFisico,
    };
  });
}

export default function Dashboard({ shopify, mercadolibre, meta, google, ga4, locales, articulos, precios, muebles, plan, contexto, ceo }: DashboardProps) {
  const [tab, setTab] = useState<TabId>("ceo");

  const lastRefresh = ceo._ultima_actualizacion || shopify._ultima_actualizacion || null;

  const sinDatosAll = shopify._status === "sin_datos" && mercadolibre._status === "sin_datos";
  const sinDatosAds = meta._status === "sin_datos" && google._status === "sin_datos";
  const sinDatosLocales = locales._status === "sin_datos";

  const metaHistorico = meta.historico_mensual?.map((r: any) => ({
    year: r.year, month: r.month,
    roas_plataforma: r.roas_plataforma || 0,
    roas_shopify: r.roas_shopify || 0,
    roas_ga4: r.roas_ga4 || 0,
  })) || [];

  const googleHistorico = google.historico_mensual?.map((r: any) => ({
    year: r.year, month: r.month,
    roas_plataforma: r.roas_plataforma || 0,
    roas_shopify: r.roas_shopify || 0,
    roas_ga4: r.roas_ga4 || 0,
  })) || [];

  const planRows = buildPlanRows(plan, shopify, mercadolibre, locales);
  const realAnualYTD = planRows.slice(0, new Date().getMonth() + 1).reduce((s, r) => s + r.real_total, 0);

  return (
    <div className="layout">
      <Sidebar activeTab={tab} onTabChange={setTab} lastRefresh={lastRefresh} />
      <main className="main">
        <div className="tab-header">
          <h1>{TAB_TITLES[tab]}</h1>
          <span className="refresh-info">
            {lastRefresh
              ? `Actualizado: ${new Date(lastRefresh).toLocaleString("es-UY", { timeZone: "America/Montevideo" })}`
              : "Datos pendientes de integración"}
          </span>
        </div>
        <div className="tab-content">
          {tab === "ceo" && <CeoTab data={ceo} />}
          {tab === "chat" && <ChatTab />}
          {tab === "performance" && (
            <PerformanceTab
              data={{ shopify, mercadolibre, locales, plan, contexto }}
            />
          )}
          {tab === "ads" && (
            <AdsTab metaData={meta} googleData={google} />
          )}
          {tab === "roas" && (
            <RoasTab
              metaHistorico={metaHistorico}
              googleHistorico={googleHistorico}
              totalSpendMeta={meta.periodos?.last_30d?.spend || 0}
              totalSpendGoogle={google.periodos?.last_30d?.spend || 0}
              sinDatos={sinDatosAds}
            />
          )}
          {tab === "funnel" && (
            <FunnelTab
              shopify={shopify}
              ml={mercadolibre}
              promoActiva={contexto.promo_activa_actual?.activa || false}
              comisionML={contexto.comision_marketplace_pct || 0.17}
            />
          )}
          {tab === "locales" && (
            <LocalesTab
              locales={locales.locales || []}
              localConfigs={contexto.locales || []}
              planesLocales={plan.targets_por_local || {}}
              sinDatos={sinDatosLocales}
            />
          )}
          {tab === "articulos" && <ArticulosTab data={articulos} />}
          {tab === "precios" && <PreciosTab data={precios} muebles={muebles} />}
          {tab === "plan" && (
            <PlanTab
              rows={planRows}
              targetAnual={plan.target_anual_usd || 0}
              realAnual={realAnualYTD}
              sinDatos={sinDatosAll}
            />
          )}
          {tab === "tutorial" && <TutorialTab />}
        </div>
      </main>
    </div>
  );
}
