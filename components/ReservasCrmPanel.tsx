"use client";
import { useState } from "react";
import ReservasTab from "./tabs/ReservasTab";
import CrmTab from "./tabs/CrmTab";

export default function ReservasCrmPanel() {
  const [seccion, setSeccion] = useState<"reservas" | "crm">("reservas");
  return (
    <div>
      <div className="panel-toggle">
        <button className={`panel-toggle-btn${seccion === "reservas" ? " active" : ""}`} onClick={() => setSeccion("reservas")}>
          📋 Reservas
        </button>
        <button className={`panel-toggle-btn${seccion === "crm" ? " active" : ""}`} onClick={() => setSeccion("crm")}>
          🤝 CRM
        </button>
      </div>
      {seccion === "reservas" ? <ReservasTab /> : <CrmTab />}
    </div>
  );
}
