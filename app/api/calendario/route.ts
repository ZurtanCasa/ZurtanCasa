import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readDataFile } from "@/lib/githubData";

export const dynamic = "force-dynamic";

const FILE_PATH = "data/reservas.json";

// Estados cuyas reservas se vuelcan al calendario.
const ESTADOS_CALENDARIO = ["Pago y Sin Entregar", "Ir a probar"];

function esc(v: string): string {
  // Escape de texto para iCalendar (RFC 5545).
  return (v || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  // Plegado de líneas largas: máx 75 octetos, continúa con espacio inicial.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    parts.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    i += 73;
  }
  return parts.join("\r\n");
}

function soloFecha(iso: string): string | null {
  // YYYY-MM-DD -> YYYYMMDD (formato DATE de iCal). null si no parsea.
  const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

function masUnDia(yyyymmdd: string): string {
  const y = +yyyymmdd.slice(0, 4);
  const mo = +yyyymmdd.slice(4, 6);
  const d = +yyyymmdd.slice(6, 8);
  const dt = new Date(Date.UTC(y, mo - 1, d + 1));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}`;
}

function dtstamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function leerReservas() {
  if (!process.env.GITHUB_API_TOKEN) {
    const local = await fs.readFile(path.join(process.cwd(), FILE_PATH), "utf-8");
    return JSON.parse(local);
  }
  const { content } = await readDataFile(FILE_PATH);
  return content;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const esperado = process.env.CALENDARIO_TOKEN || "";

  // En prod exige token. En dev (sin token configurado) se permite para probar.
  if (esperado && token !== esperado) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  let data: any;
  try {
    data = await leerReservas();
  } catch (err: any) {
    return new NextResponse(`Error leyendo reservas: ${err.message}`, { status: 500 });
  }

  const reservas: any[] = (data?.reservas || []).filter(
    (r: any) => ESTADOS_CALENDARIO.includes(r.estado) && soloFecha(r.fecha_entrega || "")
  );

  const stamp = dtstamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZurtanCasa//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ZurtanCasa — Entregas",
    "X-WR-TIMEZONE:America/Montevideo",
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const r of reservas) {
    const inicio = soloFecha(r.fecha_entrega)!;
    const fin = masUnDia(inicio);
    const seq = Math.max(0, Math.floor(Date.parse(r.updated_at || r.created_at || "") / 1000) || 0);

    const detalle: string[] = [];
    if ((r.celular || "").trim()) detalle.push(`📱 ${r.celular.trim()}`);
    if ((r.direccion || "").trim()) detalle.push(`📍 ${r.direccion.trim()}`);
    if ((r.articulos || "").trim()) detalle.push(`🛋️ ${r.articulos.trim()}`);
    if ((r.notas || "").trim()) detalle.push(`📝 ${r.notas.trim()}`);
    detalle.push(`Estado: ${r.estado}`);
    const descripcion = detalle.join("\n");

    lines.push("BEGIN:VEVENT");
    lines.push(fold(`UID:${r.id || "r_" + inicio}@zurtancasa`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SEQUENCE:${seq}`);
    lines.push(`DTSTART;VALUE=DATE:${inicio}`);
    lines.push(`DTEND;VALUE=DATE:${fin}`);
    lines.push(fold(`SUMMARY:${esc("🛋️ Entrega: " + (r.nombre || "(sin nombre)"))}`));
    if ((r.direccion || "").trim()) lines.push(fold(`LOCATION:${esc(r.direccion.trim())}`));
    lines.push(fold(`DESCRIPTION:${esc(descripcion)}`));
    // Recordatorio el día PREVIO a las 09:00 (evento all-day arranca 00:00).
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(fold(`DESCRIPTION:${esc("Entrega mañana: " + (r.nombre || ""))}`));
    lines.push("TRIGGER:-PT15H");
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="zurtancasa-entregas.ics"',
      "Cache-Control": "no-cache, max-age=0",
    },
  });
}
