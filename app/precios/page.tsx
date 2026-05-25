import PreciosTab from "@/components/tabs/PreciosTab";
import preciosRaw from "@/data/precios.json";

export const revalidate = 0;

export const metadata = {
  title: "ZurtanCasa — Lista de Precios",
  description: "Catálogo de precios ZurtanCasa",
};

export default function PreciosPage() {
  return (
    <div className="precios-standalone">
      <header className="precios-standalone-header">
        <div className="precios-standalone-brand">
          <span style={{ fontSize: 24 }}>🏠</span>
          <div>
            <div className="precios-standalone-title">ZurtanCasa</div>
            <div className="precios-standalone-sub">Lista de Precios</div>
          </div>
        </div>
      </header>
      <main className="precios-standalone-main">
        <PreciosTab data={preciosRaw as any} />
      </main>
    </div>
  );
}
