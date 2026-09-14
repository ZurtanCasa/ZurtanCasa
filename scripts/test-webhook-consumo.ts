import { config } from "dotenv";
import crypto from "crypto";
import { createSaleAwarePercentageDiscount } from "../lib/shopify-admin";

config({ path: ".env.local" });

async function main() {
  const code = `ELPAIS-TEST${Date.now().toString(36).toUpperCase()}`;
  console.log("1) Creando descuento de prueba con tarjeta de test asociada...");
  await createSaleAwarePercentageDiscount({
    code,
    percentage: 20,
    title: "Club El País 20% - TEST WEBHOOK",
    expiresInMinutes: 30,
    tarjeta: "6328125328570020", // tarjeta de testing, va a fallar en produccion (esperado)
  });
  console.log("   -> código creado:", code);

  const fakeOrder = {
    id: 999999999,
    name: "#TEST-WEBHOOK",
    currency: "USD",
    total_price: "100.00",
    created_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    discount_codes: [{ code, amount: "20.00", type: "percentage" }],
  };
  const rawBody = JSON.stringify(fakeOrder);
  const secret = process.env.SHOPIFY_CLUBELPAIS_CLIENT_SECRET || "";
  const hmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  console.log("\n2) Enviando webhook simulado...");
  const res = await fetch("https://zurtancasa-dashboard.vercel.app/api/webhooks/club-el-pais-consumo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shopify-hmac-sha256": hmac,
    },
    body: rawBody,
  });
  console.log("   -> HTTP", res.status);
  console.log("   -> body:", await res.text());
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
