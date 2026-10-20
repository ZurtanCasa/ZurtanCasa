import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // /precios es la ÚNICA página pública (lista de precios compartible).
  // Todo el resto del dashboard (finanzas, reservas con datos de clientes, etc.)
  // requiere contraseña cuando BASIC_AUTH_USER/PASS están configurados en Vercel.
  if (req.nextUrl.pathname.startsWith("/precios")) return NextResponse.next();

  // Recursos estáticos que el NAVEGADOR pide solo al abrir cualquier página
  // (iconos de Apple en el iPhone, manifest, robots, imágenes, fuentes...).
  // No son sensibles y no deben disparar el cartel de usuario/contraseña:
  // esa era la causa de que /precios pidiera login todo el tiempo.
  const p = req.nextUrl.pathname;
  if (
    p.startsWith("/apple-touch-icon") ||
    p === "/manifest.json" ||
    p === "/site.webmanifest" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    /\.(png|jpe?g|gif|svg|webp|ico|bmp|woff2?|ttf|otf)$/i.test(p)
  ) {
    return NextResponse.next();
  }

  // Endpoints de Club El País: los llama la tienda Shopify (cross-origin, sin
  // credenciales) y Shopify mismo (webhook, ya protegido con firma HMAC).
  if (
    req.nextUrl.pathname.startsWith("/api/club-el-pais/") ||
    req.nextUrl.pathname.startsWith("/api/webhooks/")
  ) {
    return NextResponse.next();
  }

  // Feed de calendario (.ics) para suscripción desde el iPhone. No usa Basic
  // Auth (los calendarios suscritos no la manejan bien): se protege con un
  // token secreto en la URL, validado dentro de la propia ruta.
  if (req.nextUrl.pathname.startsWith("/api/calendario")) {
    return NextResponse.next();
  }

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const [u, p] = decoded.split(":");
      if (u === user && p === pass) return NextResponse.next();
    }
  }

  return new NextResponse("Acceso no autorizado", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ZurtanCasa Dashboard"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
