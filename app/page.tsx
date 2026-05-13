import Dashboard from "@/components/Dashboard";
import shopifyRaw from "@/data/shopify.json";
import mlRaw from "@/data/mercadolibre.json";
import metaRaw from "@/data/meta_ads.json";
import googleRaw from "@/data/google_ads.json";
import ga4Raw from "@/data/ga4.json";
import localesRaw from "@/data/locales.json";
import planRaw from "@/data/plan_anual.json";
import contextoRaw from "@/data/contexto_negocio.json";
import ceoRaw from "@/data/ceo_analysis.json";

export const revalidate = 0;

export default function Home() {
  return (
    <Dashboard
      shopify={shopifyRaw as any}
      mercadolibre={mlRaw as any}
      meta={metaRaw as any}
      google={googleRaw as any}
      ga4={ga4Raw as any}
      locales={localesRaw as any}
      plan={planRaw as any}
      contexto={contextoRaw as any}
      ceo={ceoRaw as any}
    />
  );
}
