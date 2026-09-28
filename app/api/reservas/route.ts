import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readDataFile, writeDataFile } from "@/lib/githubData";

export const dynamic = "force-dynamic";

const FILE_PATH = "data/reservas.json";

// Estados válidos. "Pago y Entregado" es el estado archivado (no aparece en el Kanban).
const ESTADOS = [
  "Pago y Sin Entregar",
  "Entregado y Sin Pagar",
  "Pedido",
  "Pago y No Llegó Mercadería",
  "Saldo a Favor",
  "S/F",
  "Pago y Entregado",
];

function nowISO() {
  return new Date().toISOString();
}

function normalizar(body: any) {
  const nombre = (body.nombre ?? "").toString().trim();
  if (!nombre) throw new Error("El nombre es obligatorio.");
  const estado = (body.estado ?? "S/F").toString();
  if (!ESTADOS.includes(estado)) throw new Error(`Estado inválido: ${estado}`);
  return {
    nombre,
    celular: (body.celular ?? "").toString().trim(),
    ci: (body.ci ?? "").toString().trim(),
    direccion: (body.direccion ?? "").toString().trim(),
    articulos: (body.articulos ?? "").toString().trim(),
    sena: (body.sena ?? "").toString().trim(),
    sena_devuelta: body.sena_devuelta === true,
    fecha_entrega: (body.fecha_entrega ?? "").toString().trim(),
    notas: (body.notas ?? "").toString().trim(),
    estado,
  };
}

export async function GET() {
  try {
    // Dev sin GITHUB_API_TOKEN: leer el archivo local (en prod se usa GitHub).
    if (!process.env.GITHUB_API_TOKEN) {
      const local = await fs.readFile(path.join(process.cwd(), FILE_PATH), "utf-8");
      return NextResponse.json(JSON.parse(local));
    }
    const { content } = await readDataFile(FILE_PATH);
    return NextResponse.json(content);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const datos = normalizar(body);

    const { content, sha } = await readDataFile(FILE_PATH);
    const reserva = {
      id: (globalThis.crypto?.randomUUID?.() ?? `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      ...datos,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    content.reservas = [...(content.reservas || []), reserva];
    content._status = "ok";
    content._ultima_actualizacion = nowISO();

    await writeDataFile(FILE_PATH, content, sha, `reservas: nueva reserva ${reserva.nombre}`);
    return NextResponse.json({ reserva });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id;
    if (!id) throw new Error("Falta el id de la reserva.");

    const { content, sha } = await readDataFile(FILE_PATH);
    const idx = (content.reservas || []).findIndex((r: any) => r.id === id);
    if (idx === -1) throw new Error("No se encontró la reserva.");

    const actual = content.reservas[idx];

    // Cambio de estado solo (mover en el Kanban / archivar)
    if (body.estado !== undefined && Object.keys(body).length <= 2) {
      if (!ESTADOS.includes(body.estado)) throw new Error(`Estado inválido: ${body.estado}`);
      content.reservas[idx] = { ...actual, estado: body.estado, updated_at: nowISO() };
    } else {
      // Edición completa de datos
      const datos = normalizar({ ...actual, ...body });
      content.reservas[idx] = { ...actual, ...datos, updated_at: nowISO() };
    }

    content._ultima_actualizacion = nowISO();
    const msg = body.estado !== undefined && Object.keys(body).length <= 2
      ? `reservas: ${actual.nombre} → ${body.estado}`
      : `reservas: editar ${actual.nombre}`;
    await writeDataFile(FILE_PATH, content, sha, msg);
    return NextResponse.json({ reserva: content.reservas[idx] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || (await req.json().catch(() => ({}))).id;
    if (!id) throw new Error("Falta el id de la reserva.");

    const { content, sha } = await readDataFile(FILE_PATH);
    const reserva = (content.reservas || []).find((r: any) => r.id === id);
    if (!reserva) throw new Error("No se encontró la reserva.");
    content.reservas = (content.reservas || []).filter((r: any) => r.id !== id);
    content._ultima_actualizacion = nowISO();

    await writeDataFile(FILE_PATH, content, sha, `reservas: eliminar ${reserva.nombre}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}
