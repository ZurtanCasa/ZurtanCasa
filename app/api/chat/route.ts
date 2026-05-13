import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function nowUY(): string {
  return new Date().toLocaleString("es-UY", { timeZone: "America/Montevideo" });
}

function todayUY(): string {
  return new Date().toLocaleDateString("es-UY", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" });
}

function loadJSON(name: string) {
  try {
    const p = path.join(process.cwd(), "data", name);
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

const TOOLS = [
  {
    name: "read_dashboard_data",
    description: "Lee todos los datos del dashboard: shopify, mercadolibre, meta_ads, google_ads, ga4, locales, plan_anual, contexto_negocio, ceo_analysis.",
    input_schema: {
      type: "object",
      properties: {
        fuente: { type: "string", enum: ["shopify", "mercadolibre", "meta_ads", "google_ads", "ga4", "locales", "plan_anual", "contexto_negocio", "ceo_analysis", "all"] }
      },
      required: ["fuente"]
    }
  },
  {
    name: "compute_total",
    description: "Calcula totales de revenue MTD o YTD sumando todos los canales.",
    input_schema: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["mtd", "ytd"] }
      },
      required: ["periodo"]
    }
  },
  {
    name: "query_ads",
    description: "Consulta métricas de ads para un período específico.",
    input_schema: {
      type: "object",
      properties: {
        plataforma: { type: "string", enum: ["meta", "google", "ambas"] },
        periodo: { type: "string", enum: ["today", "yesterday", "last_7d", "last_30d"] }
      },
      required: ["plataforma", "periodo"]
    }
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  if (name === "read_dashboard_data") {
    const fuente = input.fuente as string;
    if (fuente === "all") {
      const files = ["shopify", "mercadolibre", "meta_ads", "google_ads", "ga4", "locales", "plan_anual", "contexto_negocio", "ceo_analysis"];
      const result: Record<string, unknown> = {};
      for (const f of files) result[f] = loadJSON(f + ".json");
      return JSON.stringify(result, null, 2);
    }
    return JSON.stringify(loadJSON(fuente + ".json"), null, 2);
  }

  if (name === "compute_total") {
    const shopify = loadJSON("shopify.json");
    const ml = loadJSON("mercadolibre.json");
    const locales = loadJSON("locales.json");
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (input.periodo === "mtd") {
      const web = shopify?.mes_actual?.revenue_bruto || 0;
      const marketplace = ml?.mes_actual?.revenue_bruto || 0;
      const fisico = (locales?.locales || []).reduce((s: number, l: any) => s + (l.mes_actual?.revenue || 0), 0);
      return JSON.stringify({ web, marketplace, fisico, total: web + marketplace + fisico, periodo: "MTD" });
    }

    if (input.periodo === "ytd") {
      let web = 0, marketplace = 0, fisico = 0;
      for (let m = 1; m <= currentMonth; m++) {
        web += shopify?.historico_mensual?.find((r: any) => r.year === currentYear && r.month === m)?.revenue_bruto || 0;
        marketplace += ml?.historico_mensual?.find((r: any) => r.year === currentYear && r.month === m)?.revenue_bruto || 0;
        fisico += (locales?.locales || []).reduce((s: number, l: any) => {
          return s + (l.historico_mensual?.find((r: any) => r.year === currentYear && r.month === m)?.revenue || 0);
        }, 0);
      }
      return JSON.stringify({ web, marketplace, fisico, total: web + marketplace + fisico, periodo: "YTD" });
    }
  }

  if (name === "query_ads") {
    const { plataforma, periodo } = input as { plataforma: string; periodo: string };
    const result: Record<string, unknown> = {};
    if (plataforma === "meta" || plataforma === "ambas") {
      const meta = loadJSON("meta_ads.json");
      result.meta = meta?.periodos?.[periodo] || { _status: "sin_datos" };
    }
    if (plataforma === "google" || plataforma === "ambas") {
      const google = loadJSON("google_ads.json");
      result.google = google?.periodos?.[periodo] || { _status: "sin_datos" };
    }
    return JSON.stringify(result);
  }

  return "Tool no reconocida";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ content: "ANTHROPIC_API_KEY no configurada. Agregala en las variables de entorno de Vercel." }, { status: 200 });
  }

  const { messages } = await req.json();
  const contexto = loadJSON("contexto_negocio.json");

  const systemPrompt = `Sos el CEO IA de ZurtanCasa, una empresa de decoración (alfombras y muebles) en Uruguay.
Fecha y hora actual en Uruguay: ${nowUY()} (${todayUY()})
Moneda principal: USD
Breakeven mensual: USD ${contexto?.breakeven_mensual?.usd || 13000}
Margen neto: ${((contexto?.margen_neto_pct || 0.28) * 100).toFixed(0)}%
Comisión MercadoLibre: ${((contexto?.comision_marketplace_pct || 0.17) * 100).toFixed(0)}%

Equipo: Gerardo (Dueño), Ignacio (Marketing), Clara (Community), María (Vendedora), Nicolás (Sistemas/Logística).

Reglas:
- Nunca inventes datos. Si no tenés datos, decilo claramente.
- Juzgá las campañas de performance por ROAS, NUNCA las de alcance/branding.
- No alertes por AOV bajo si hay promo activa.
- Respondé en castellano rioplatense, directo y sin vueltas.
- Usá las tools para acceder a datos reales antes de responder.`;

  let anthropicMessages = [...messages];

  for (let iter = 0; iter < 5; iter++) {
    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages: anthropicMessages,
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.stop_reason === "end_turn") {
      const textBlock = data.content?.find((c: any) => c.type === "text");
      return NextResponse.json({ content: textBlock?.text || "Sin respuesta" });
    }

    if (data.stop_reason === "tool_use") {
      anthropicMessages.push({ role: "assistant", content: data.content });
      const toolResults = [];
      for (const block of data.content) {
        if (block.type === "tool_use") {
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
      }
      anthropicMessages.push({ role: "user", content: toolResults });
      continue;
    }

    if (data.error) {
      return NextResponse.json({ content: `Error API: ${data.error.message}` });
    }

    break;
  }

  return NextResponse.json({ content: "No se pudo obtener respuesta." });
}
