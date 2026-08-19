import { NextRequest, NextResponse } from "next/server";
import { readDataFile, writeDataFile } from "@/lib/githubData";

export const dynamic = "force-dynamic";

const FILE_PATH = "data/gastos.json";

export async function GET() {
  try {
    const { content } = await readDataFile(FILE_PATH);
    return NextResponse.json(content);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 500 });
  }
}

function validarCategoria(body: any) {
  if (!body.categoria || typeof body.categoria !== "string") throw new Error("Falta el nombre de la categoría.");
  if (typeof body.monto_mensual_usd !== "number" || body.monto_mensual_usd < 0) {
    throw new Error("El monto tiene que ser un número mayor o igual a 0.");
  }
  if (body.iva_usd !== undefined && (typeof body.iva_usd !== "number" || Number.isNaN(body.iva_usd) || body.iva_usd < 0)) {
    throw new Error("El IVA tiene que ser un número mayor o igual a 0.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    validarCategoria(body);

    const { content, sha } = await readDataFile(FILE_PATH);
    if ((content.categorias || []).some((c: any) => c.categoria === body.categoria)) {
      throw new Error("Ya existe una categoría con ese nombre.");
    }
    const categoria = { categoria: body.categoria, monto_mensual_usd: body.monto_mensual_usd, iva_usd: body.iva_usd || 0 };
    content.categorias = [...(content.categorias || []), categoria];
    content._status = "ok";
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: agregar gasto "${categoria.categoria}"`);
    return NextResponse.json({ categoria });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.categoria_original) throw new Error("Falta la categoría original.");

    const { content, sha } = await readDataFile(FILE_PATH);
    const idx = (content.categorias || []).findIndex((c: any) => c.categoria === body.categoria_original);
    if (idx === -1) throw new Error("No se encontró la categoría.");

    const { categoria_original, ...cambios } = body;
    const updated = { ...content.categorias[idx], ...cambios };
    validarCategoria(updated);

    content.categorias[idx] = updated;
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: actualizar gasto "${updated.categoria}"`);
    return NextResponse.json({ categoria: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const categoria = req.nextUrl.searchParams.get("categoria");
    if (!categoria) throw new Error("Falta la categoría.");

    const { content, sha } = await readDataFile(FILE_PATH);
    const before = (content.categorias || []).length;
    content.categorias = (content.categorias || []).filter((c: any) => c.categoria !== categoria);
    if (content.categorias.length === before) throw new Error("No se encontró la categoría.");
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: eliminar gasto "${categoria}"`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}
