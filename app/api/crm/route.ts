import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readDataFile, writeDataFile } from "@/lib/githubData";

export const dynamic = "force-dynamic";

const FILE_PATH = "data/crm.json";

const ESTADOS = [
  "Interesado",
  "Se llevó anotadas",
  "Dejó separadas para probar",
  "Muestra prestada",
  "Precio no le convenció",
  "En seguimiento",
  "Compró",
  "No concretó",
];

function nowISO() {
  return new Date().toISOString();
}

function normalizar(body: any) {
  const nombre = (body.nombre ?? "").toString().trim();
  if (!nombre) throw new Error("El nombre es obligatorio.");
  const estado = (body.estado ?? "Interesado").toString();
  if (!ESTADOS.includes(estado)) throw new Error(`Estado inválido: ${estado}`);
  return {
    nombre,
    celular: (body.celular ?? "").toString().trim(),
    interes: (body.interes ?? "").toString().trim(),
    vendedor: (body.vendedor ?? "").toString().trim(),
    proxima_accion: (body.proxima_accion ?? "").toString().trim(),
    fecha_accion: (body.fecha_accion ?? "").toString().trim(),
    notas: (body.notas ?? "").toString().trim(),
    estado,
  };
}

export async function GET() {
  try {
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
    const lead = {
      id: (globalThis.crypto?.randomUUID?.() ?? `l_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      ...datos,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    content.leads = [...(content.leads || []), lead];
    content._status = "ok";
    content._ultima_actualizacion = nowISO();
    await writeDataFile(FILE_PATH, content, sha, `crm: nuevo lead ${lead.nombre}`);
    return NextResponse.json({ lead });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id;
    if (!id) throw new Error("Falta el id del lead.");
    const { content, sha } = await readDataFile(FILE_PATH);
    const idx = (content.leads || []).findIndex((l: any) => l.id === id);
    if (idx === -1) throw new Error("No se encontró el lead.");
    const actual = content.leads[idx];

    if (body.estado !== undefined && Object.keys(body).length <= 2) {
      if (!ESTADOS.includes(body.estado)) throw new Error(`Estado inválido: ${body.estado}`);
      content.leads[idx] = { ...actual, estado: body.estado, updated_at: nowISO() };
    } else {
      const datos = normalizar({ ...actual, ...body });
      content.leads[idx] = { ...actual, ...datos, updated_at: nowISO() };
    }
    content._ultima_actualizacion = nowISO();
    const msg = body.estado !== undefined && Object.keys(body).length <= 2
      ? `crm: ${actual.nombre} → ${body.estado}`
      : `crm: editar ${actual.nombre}`;
    await writeDataFile(FILE_PATH, content, sha, msg);
    return NextResponse.json({ lead: content.leads[idx] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || (await req.json().catch(() => ({}))).id;
    if (!id) throw new Error("Falta el id del lead.");
    const { content, sha } = await readDataFile(FILE_PATH);
    const lead = (content.leads || []).find((l: any) => l.id === id);
    if (!lead) throw new Error("No se encontró el lead.");
    content.leads = (content.leads || []).filter((l: any) => l.id !== id);
    content._ultima_actualizacion = nowISO();
    await writeDataFile(FILE_PATH, content, sha, `crm: eliminar ${lead.nombre}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}
