import { XMLParser } from "fast-xml-parser";

export type ClubElPaisEnv = "testing" | "production";

const CONFIG: Record<ClubElPaisEnv, { baseUrl: string; namespace: string }> = {
  testing: {
    baseUrl: "http://consumostesting.clubelpais.com.uy/awsconsumoelclub.aspx",
    namespace: "TestingWebConsumos",
  },
  production: {
    baseUrl: "http://consumos.clubelpais.com.uy/awsconsumoelclub.aspx",
    namespace: "WebClubConsumos",
  },
};

export class ClubElPaisError extends Error {}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatFechaHora(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function callOperation(
  env: ClubElPaisEnv,
  operation: string,
  fields: [string, string][],
): Promise<Record<string, string>> {
  const { baseUrl, namespace } = CONFIG[env];
  const body = fields.map(([key, value]) => `<web:${key}>${escapeXml(value)}</web:${key}>`).join("\n      ");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${namespace}">
  <soapenv:Header/>
  <soapenv:Body>
    <web:WSConsumoElClub.${operation}>
      ${body}
    </web:WSConsumoElClub.${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;

  const soapAction = `${namespace}action/AWSCONSUMOELCLUB.${operation}`;

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
    },
    body: xml,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new ClubElPaisError(`HTTP ${res.status} llamando a ${operation}: ${text.slice(0, 500)}`);
  }

  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true }).parse(text);
  const responseBody = parsed?.Envelope?.Body;
  const responseKey = responseBody ? Object.keys(responseBody).find((k) => k.endsWith("Response")) : undefined;
  if (!responseKey) {
    throw new ClubElPaisError(`Respuesta inesperada de ${operation}: ${text.slice(0, 500)}`);
  }
  return responseBody[responseKey];
}

export async function wsLogin(env: ClubElPaisEnv, usuarioLogin: string, password: string) {
  const r = await callOperation(env, "WSLOGIN", [
    ["Usuariologin", usuarioLogin],
    ["Password", password],
  ]);
  return { tokenId: String(r.Tokenid ?? ""), mensaje: String(r.Mensaje ?? "") };
}

export async function wsTarjetaHabilitada(
  env: ClubElPaisEnv,
  tokenId: string,
  usuarioLogin: string,
  socioTarjeta: string,
) {
  const r = await callOperation(env, "WSTARJETAHABILITADA", [
    ["Tokenid", tokenId],
    ["Usuariologin", usuarioLogin],
    ["Sociotarjeta", socioTarjeta],
  ]);
  return { socioHabilitado: String(r.Sociohabilitado ?? "") === "S", mensaje: String(r.Mensaje ?? "") };
}

export async function wsValidaDocumentoYTarjeta(
  env: ClubElPaisEnv,
  tokenId: string,
  usuarioLogin: string,
  socioTarjeta: string,
  socioTipoDoc: "CD" | "CI" | "DE" | "DNI" | "PST",
  socioCi: string,
) {
  const r = await callOperation(env, "WSVALIDADOCUMENTOYTARJETA", [
    ["Tokenid", tokenId],
    ["Usuariologin", usuarioLogin],
    ["Sociotarjeta", socioTarjeta],
    ["Sociotipodoc", socioTipoDoc],
    ["Socioci", socioCi],
  ]);
  return { socioHabilitado: String(r.Sociohabilitado ?? "") === "S", mensaje: String(r.Mensaje ?? "") };
}

export async function wsEnviarConsumoConMoneda(
  env: ClubElPaisEnv,
  tokenId: string,
  usuarioLogin: string,
  consumoSocioTarjeta: string,
  consumoFechaHora: Date,
  consumoImporte: number,
  consumoComprobante: string,
  consumoMoneda: "0" | "1",
) {
  const r = await callOperation(env, "WSENVIARCONSUMOCONMONEDA", [
    ["Tokenid", tokenId],
    ["Usuariologin", usuarioLogin],
    ["Consumosociotarjeta", consumoSocioTarjeta],
    ["Consumofechahora", formatFechaHora(consumoFechaHora)],
    ["Consumoimporte", consumoImporte.toFixed(2)],
    ["Consumocomprobante", consumoComprobante],
    ["Consumomoneda", consumoMoneda],
  ]);
  return { solicitudId: Number(r.Solicitudid ?? 0), mensaje: String(r.Mensaje ?? "") };
}
