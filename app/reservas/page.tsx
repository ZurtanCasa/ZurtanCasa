import ReservasCrmPanel from "@/components/ReservasCrmPanel";

export const revalidate = 0;

export const metadata = {
  title: "ZurtanCasa — Reservas & CRM",
  description: "Tablero de reservas y CRM ZurtanCasa",
};

export default function ReservasPage() {
  return (
    <div className="precios-standalone">
      <main className="precios-standalone-main">
        <ReservasCrmPanel />
      </main>
    </div>
  );
}
