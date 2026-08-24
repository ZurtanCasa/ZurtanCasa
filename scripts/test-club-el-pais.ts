/**
 * Prueba manual del WS de Consumos de Club El País contra el ambiente de testing.
 * Uso: npx tsx scripts/test-club-el-pais.ts
 *
 * Requiere en .env.local (o exportadas en el shell):
 *   CLUB_EL_PAIS_TEST_USER
 *   CLUB_EL_PAIS_TEST_PASSWORD
 */
import { config } from "dotenv";
import {
  wsLogin,
  wsValidaDocumentoYTarjeta,
  wsEnviarConsumoConMoneda,
} from "../lib/club-el-pais";

config({ path: ".env.local" });

const TARJETAS_PRUEBA = [
  { nombre: "DIAZ ANDREA", ci: "48527139", tarjeta: "6328125328570020" },
  { nombre: "KAVECKIS JAVIER", ci: "39721568", tarjeta: "6328125446380013" },
  { nombre: "OIS ANA", ci: "10696396", tarjeta: "6328125072310086" },
];

async function main() {
  const usuario = process.env.CLUB_EL_PAIS_TEST_USER;
  const password = process.env.CLUB_EL_PAIS_TEST_PASSWORD;

  if (!usuario || !password) {
    console.error("Faltan CLUB_EL_PAIS_TEST_USER / CLUB_EL_PAIS_TEST_PASSWORD en .env.local");
    process.exit(1);
  }

  console.log("1) WSLogin...");
  const login = await wsLogin("testing", usuario, password);
  console.log("   ->", login);
  if (!login.tokenId) {
    console.error("No se obtuvo TokenId, abortando.");
    process.exit(1);
  }

  for (const socio of TARJETAS_PRUEBA) {
    console.log(`\n2) WSValidaDocumentoYTarjeta para ${socio.nombre} (CI ${socio.ci})...`);
    const validacion = await wsValidaDocumentoYTarjeta(
      "testing",
      login.tokenId,
      usuario,
      socio.tarjeta,
      "CI",
      socio.ci,
    );
    console.log("   ->", validacion);
  }

  const socioParaConsumo = TARJETAS_PRUEBA[0];
  console.log(`\n3) WSEnviarConsumoConMoneda de prueba para ${socioParaConsumo.nombre} ($100 UYU)...`);
  const consumo = await wsEnviarConsumoConMoneda(
    "testing",
    login.tokenId,
    usuario,
    socioParaConsumo.tarjeta,
    new Date(),
    100,
    `TEST-${Date.now()}`,
    "0",
  );
  console.log("   ->", consumo);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
