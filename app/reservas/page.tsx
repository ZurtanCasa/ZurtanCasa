import ReservasTab from "@/components/tabs/ReservasTab";

export const revalidate = 0;

export const metadata = {
  title: "ZurtanCasa — Reservas",
  description: "Tablero de reservas ZurtanCasa",
};

export default function ReservasPage() {
  return (
    <div className="precios-standalone">
      <main className="precios-standalone-main">
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>📋 Reservas</h1>
        <ReservasTab />
      </main>
    </div>
  );
}
