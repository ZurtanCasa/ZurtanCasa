import { NextRequest, NextResponse } from "next/server";
import { readDataFile, writeDataFile } from "@/lib/githubData";

const FILE_PATH = "data/inversiones.json";
const ESTADOS = ["pedido", "en_transito", "en_aduana", "recibido"];
const CATEGORIAS = ["alfombras", "muebles", "otro"];

function validarEmbarque(body: any) {
  if (!body.descripcion || typeof body.descripcion !== "string") throw new Error("Falta la descripción.");
  if (typeof body.monto_usd !== "number" || Number.isNaN(body.monto_usd) || body.monto_usd < 0) {
    throw new Error("El monto tiene que ser un número mayor o igual a 0.");
  }
  if (body.categoria && !CATEGORIAS.includes(body.categoria)) throw new Error("Categoría inválida.");
  if (body.estado && !ESTADOS.includes(body.estado)) throw new Error("Estado inválido.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    validarEmbarque(body);

    const { content, sha } = await readDataFile(FILE_PATH);
    const embarque = {
      id: crypto.randomUUID(),
      descripcion: body.descripcion,
      proveedor: body.proveedor || "",
      categoria: body.categoria || "otro",
      monto_usd: body.monto_usd,
      fecha_pedido: body.fecha_pedido || null,
      fecha_eta: body.fecha_eta || null,
      estado: body.estado || "pedido",
      notas: body.notas || "",
    };

    content.embarques = [embarque, ...(content.embarques || [])];
    content._status = "ok";
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: agregar embarque "${embarque.descripcion}"`);
    return NextResponse.json({ embarque });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) throw new Error("Falta el id del embarque.");

    const { content, sha } = await readDataFile(FILE_PATH);
    const idx = (content.embarques || []).findIndex((e: any) => e.id === body.id);
    if (idx === -1) throw new Error("No se encontró el embarque.");

    const updated = { ...content.embarques[idx], ...body };
    if (updated.estado && !ESTADOS.includes(updated.estado)) throw new Error("Estado inválido.");
    if (updated.categoria && !CATEGORIAS.includes(updated.categoria)) throw new Error("Categoría inválida.");

    content.embarques[idx] = updated;
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: actualizar embarque "${updated.descripcion}"`);
    return NextResponse.json({ embarque: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new Error("Falta el id del embarque.");

    const { content, sha } = await readDataFile(FILE_PATH);
    const before = (content.embarques || []).length;
    content.embarques = (content.embarques || []).filter((e: any) => e.id !== id);
    if (content.embarques.length === before) throw new Error("No se encontró el embarque.");
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: eliminar embarque ${id}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}
