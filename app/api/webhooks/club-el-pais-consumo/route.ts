import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { wsLogin, wsEnviarConsumoConMoneda } from "@/lib/club-el-pais";
import { getTarjetaForDiscountCode, yaSeReportoConsumo, marcarConsumoReportado } from "@/lib/shopify-admin";

export const dynamic = "force-dynamic";

function verifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const digestBuf = Buffer.from(digest);
  const headerBuf = Buffer.from(hmacHeader);
  return digestBuf.length === headerBuf.length && crypto.timingSafeEqual(digestBuf, headerBuf);
}

function monedaDeOrden(currency: string): "0" | "1" {
  return currency === "UYU" ? "0" : "1";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const secret = process.env.SHOPIFY_CLUBELPAIS_CLIENT_SECRET || "";

  if (!secret || !verifyHmac(rawBody, hmacHeader, secret)) {
    return new NextResponse("HMAC inválido", { status: 401 });
  }

  const order = JSON.parse(rawBody);

  try {
    const discountCode: string | undefined = (order.discount_codes || []).find((d: { code: string }) =>
      /^ELPAIS-/i.test(d.code),
    )?.code;

    if (!discountCode) {
      // Orden sin descuento de Club El País, no hay nada que reportar.
      return new NextResponse("ok", { status: 200 });
    }

    const orderGid = `gid://shopify/Order/${order.id}`;

    if (await yaSeReportoConsumo(orderGid)) {
      return new NextResponse("ya reportado", { status: 200 });
    }

    const tarjeta = await getTarjetaForDiscountCode(discountCode);
    if (!tarjeta) {
      console.error(`No se encontró la tarjeta asociada al código ${discountCode} (orden ${order.name})`);
      return new NextResponse("sin tarjeta asociada", { status: 200 });
    }

    const usuario = process.env.CLUB_EL_PAIS_PROD_USER || "";
    const password = process.env.CLUB_EL_PAIS_PROD_PASSWORD || "";
    if (!usuario || !password) {
      throw new Error("Faltan credenciales de producción de Club El País");
    }

    const login = await wsLogin("production", usuario, password);
    if (!login.tokenId) {
      throw new Error(`No se pudo autenticar contra Club El País: ${login.mensaje}`);
    }

    const consumo = await wsEnviarConsumoConMoneda(
      "production",
      login.tokenId,
      usuario,
      tarjeta,
      new Date(order.processed_at || order.created_at),
      parseFloat(order.total_price),
      order.name,
      monedaDeOrden(order.currency),
    );

    if (consumo.solicitudId === 0) {
      throw new Error(`Club El País rechazó el consumo de la orden ${order.name}: ${consumo.mensaje}`);
    }

    console.log(`Consumo reportado a Club El País: orden ${order.name}, solicitud ${consumo.solicitudId}`);

    // El consumo ya se reportó: de acá en más, un fallo NO debe devolver 500, porque
    // Shopify reintentaría el webhook y volveríamos a reportar el mismo consumo dos veces.
    try {
      await marcarConsumoReportado(orderGid);
    } catch (err) {
      console.error(
        `Se reportó el consumo de la orden ${order.name} pero no se pudo marcar como reportada (posible reintento duplicado si Shopify reenvía este webhook):`,
        err,
      );
    }

    return new NextResponse("ok", { status: 200 });
  } catch (err: any) {
    console.error(`Error reportando consumo de la orden ${order.name}:`, err);
    return new NextResponse("error", { status: 500 });
  }
}
