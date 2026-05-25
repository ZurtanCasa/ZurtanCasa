import PreciosTab from "@/components/tabs/PreciosTab";
import preciosRaw from "@/data/precios.json";
import mueblesRaw from "@/data/muebles.json";

export const revalidate = 0;

export const metadata = {
  title: "ZurtanCasa — Lista de Precios",
  description: "Catálogo de precios ZurtanCasa",
};

export default function PreciosPage() {
  return (
    <div className="precios-standalone">
      <main className="precios-standalone-main">
        <PreciosTab
          data={preciosRaw as any}
          muebles={mueblesRaw as any}
          showStats={false}
        />
      </main>
    </div>
  );
}
