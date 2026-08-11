import { NextRequest, NextResponse } from "next/server";
import { readDataFile, writeDataFile } from "@/lib/githubData";

const FILE_PATH = "data/sueldos.json";

function validarEmpleado(body: any) {
  if (!body.nombre || typeof body.nombre !== "string") throw new Error("Falta el nombre.");
  if (!body.rol || typeof body.rol !== "string") throw new Error("Falta el rol.");
  if (typeof body.sueldo_mensual_usd !== "number" || body.sueldo_mensual_usd < 0) {
    throw new Error("El sueldo tiene que ser un número mayor o igual a 0.");
  }
  if (body.comision_pct !== undefined && (typeof body.comision_pct !== "number" || body.comision_pct < 0)) {
    throw new Error("La comisión tiene que ser un número mayor o igual a 0.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.resource === "config") {
      if (typeof body.cargas_sociales_pct !== "number" || body.cargas_sociales_pct < 0) {
        throw new Error("Cargas sociales inválidas.");
      }
      const { content, sha } = await readDataFile(FILE_PATH);
      content.cargas_sociales_pct = body.cargas_sociales_pct;
      content._ultima_actualizacion = new Date().toISOString();
      await writeDataFile(FILE_PATH, content, sha, "chore: actualizar cargas sociales");
      return NextResponse.json({ cargas_sociales_pct: content.cargas_sociales_pct });
    }

    validarEmpleado(body);
    const { content, sha } = await readDataFile(FILE_PATH);
    if ((content.empleados || []).some((e: any) => e.nombre === body.nombre)) {
      throw new Error("Ya existe un empleado con ese nombre.");
    }
    const empleado = {
      nombre: body.nombre,
      rol: body.rol,
      sueldo_mensual_usd: body.sueldo_mensual_usd,
      comision_pct: body.comision_pct || 0,
      activo: body.activo !== undefined ? body.activo : true,
    };
    content.empleados = [...(content.empleados || []), empleado];
    content._status = "ok";
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: agregar empleado "${empleado.nombre}"`);
    return NextResponse.json({ empleado });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.nombre_original) throw new Error("Falta el nombre original del empleado.");

    const { content, sha } = await readDataFile(FILE_PATH);
    const idx = (content.empleados || []).findIndex((e: any) => e.nombre === body.nombre_original);
    if (idx === -1) throw new Error("No se encontró el empleado.");

    const { nombre_original, ...cambios } = body;
    const updated = { ...content.empleados[idx], ...cambios };
    validarEmpleado(updated);

    content.empleados[idx] = updated;
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: actualizar empleado "${updated.nombre}"`);
    return NextResponse.json({ empleado: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const nombre = req.nextUrl.searchParams.get("nombre");
    if (!nombre) throw new Error("Falta el nombre del empleado.");

    const { content, sha } = await readDataFile(FILE_PATH);
    const before = (content.empleados || []).length;
    content.empleados = (content.empleados || []).filter((e: any) => e.nombre !== nombre);
    if (content.empleados.length === before) throw new Error("No se encontró el empleado.");
    content._ultima_actualizacion = new Date().toISOString();

    await writeDataFile(FILE_PATH, content, sha, `chore: eliminar empleado "${nombre}"`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 400 });
  }
}
