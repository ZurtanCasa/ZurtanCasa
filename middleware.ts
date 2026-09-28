import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // /precios es la ÚNICA página pública (lista de precios compartible).
  // Todo el resto del dashboard (finanzas, reservas con datos de clientes, etc.)
  // requiere contraseña cuando BASIC_AUTH_USER/PASS están configurados en Vercel.
  if (req.nextUrl.pathname.startsWith("/precios")) return NextResponse.next();

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
