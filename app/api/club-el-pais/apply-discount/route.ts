import { NextRequest, NextResponse } from "next/server";
import { wsLogin, wsValidaDocumentoYTarjeta, wsTarjetaHabilitada, ClubElPaisEnv } from "@/lib/club-el-pais";
import { createSaleAwarePercentageDiscount } from "@/lib/shopify-admin";
import { porcentajeDescuentoVigenteUY } from "@/lib/club-el-pais-descuento";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const porcentaje = porcentajeDescuentoVigenteUY();
    if (porcentaje === null) {
      return json({ ok: false, mensaje: "El descuento de Club El País solo aplica lunes, martes y miércoles." }, 400);
    }

    const body = await req.json();
    // Sin espacios ni guiones (tarjeta) ni puntos/guiones/espacios (cédula): el Club los guarda solo con dígitos.
    const tarjeta = String(body.tarjeta || "").replace(/[\s-]/g, "");
    const ci = String(body.ci || "").replace(/[\s.-]/g, "");

    if (!tarjeta || !ci) {
      return json({ ok: false, mensaje: "Faltan datos: tarjeta y cédula son obligatorios." }, 400);
    }

    const env: ClubElPaisEnv = (process.env.CLUB_EL_PAIS_ENV as ClubElPaisEnv) || "testing";
    const usuario =
      env === "production" ? process.env.CLUB_EL_PAIS_PROD_USER : process.env.CLUB_EL_PAIS_TEST_USER;
    const password =
      env === "production" ? process.env.CLUB_EL_PAIS_PROD_PASSWORD : process.env.CLUB_EL_PAIS_TEST_PASSWORD;

    if (!usuario || !password) {
      throw new Error(`Faltan credenciales de Club El País para el ambiente "${env}"`);
    }

    const login = await wsLogin(env, usuario, password);
    if (!login.tokenId) {
      throw new Error(`No se pudo autenticar contra Club El País: ${login.mensaje}`);
    }

    const validacion = await wsValidaDocumentoYTarjeta(env, login.tokenId, usuario, tarjeta, "CI", ci);
    if (!validacion.socioHabilitado) {
      let soloTarjeta = "sin dato";
      try {
        const h = await wsTarjetaHabilitada(env, login.tokenId, usuario, tarjeta);
        soloTarjeta = `${h.socioHabilitado ? "HABILITADA" : "no habilitada"} (${h.mensaje})`;
      } catch (e: any) {
        soloTarjeta = `error ${e?.message ?? e}`;
      }
      console.warn(
        `Club El País rechazó la validación [ambiente=${env}]: tarjeta ****${tarjeta.slice(-4)} (${tarjeta.length} dígitos), ci de ${ci.length} caracteres, mensaje="${validacion.mensaje}", solo tarjeta: ${soloTarjeta}`,
      );
      return json({ ok: false, mensaje: validacion.mensaje || "La tarjeta no está habilitada o no coincide con la cédula ingresada." });
    }

    const discountCode = `ELPAIS-${Date.now().toString(36).toUpperCase()}`;
    const codigoCreado = await createSaleAwarePercentageDiscount({
      code: discountCode,
      percentage: porcentaje,
      title: `Club El País ${porcentaje}% - tarjeta ${tarjeta.slice(-4)}`,
      expiresInMinutes: 10,
      tarjeta,
    });

    return json({ ok: true, discountCode: codigoCreado });
  } catch (err: any) {
    console.error("Error en club-el-pais/apply-discount:", err);
    return json({ ok: false, mensaje: "Ocurrió un error validando la tarjeta. Intentá nuevamente." }, 500);
  }
}
