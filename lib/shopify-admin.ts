const API_VERSION = "2024-10";

function shopifyGraphqlEndpoint(): string {
  const storeUrl = (process.env.SHOPIFY_STORE_URL || "").replace(/\/$/, "");
  if (!storeUrl) throw new Error("Falta SHOPIFY_STORE_URL");
  return `${storeUrl}/admin/api/${API_VERSION}/graphql.json`;
}

async function shopifyGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  const token = accessToken || process.env.SHOPIFY_ACCESS_TOKEN || "";
  if (!token) throw new Error("Falta un access token de Shopify");

  const res = await fetch(shopifyGraphqlEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data as T;
}

const CREATE_APP_DISCOUNT_MUTATION = `
  mutation discountCodeAppCreate($codeAppDiscount: DiscountCodeAppInput!) {
    discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
      codeAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Crea un código de descuento de un solo uso que corre la función "club-el-pais-sin-sale":
 * aplica el porcentaje solo a las líneas que NO están en oferta (no acumulable con sale).
 */
// Colección automática "sin precio tachado" (Club El País - productos sin oferta). Se usa cuando Shopify
// no deja activar la función "club-el-pais-sin-sale" (exige plan Plus para apps custom): el descuento
// normal se limita a esa colección, así los productos en oferta quedan afuera igual.
const COLECCION_SIN_OFERTA_ID =
  process.env.CLUB_EL_PAIS_COLECCION_SIN_OFERTA_ID || "gid://shopify/Collection/512776765625";

const CREATE_BASIC_DISCOUNT_MUTATION = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

const SET_DISCOUNT_TARJETA_MUTATION = `
  mutation setTarjeta($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

async function createBasicPercentageDiscountSinOferta(
  params: { code: string; percentage: number; title: string; expiresInMinutes: number; tarjeta: string },
  accessToken: string,
): Promise<string> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + params.expiresInMinutes * 60 * 1000);
  const data = await shopifyGraphql<{
    discountCodeBasicCreate: {
      codeDiscountNode: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    CREATE_BASIC_DISCOUNT_MUTATION,
    {
      basicCodeDiscount: {
        title: params.title,
        code: params.code,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: { all: true },
        combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: false },
        customerGets: {
          value: { percentage: params.percentage / 100 },
          items: { collections: { add: [COLECCION_SIN_OFERTA_ID] } },
        },
      },
    },
    accessToken,
  );
  const r = data.discountCodeBasicCreate;
  if (r.userErrors.length > 0) {
    throw new Error(`No se pudo crear el descuento (básico): ${r.userErrors.map((e) => e.message).join(", ")}`);
  }
  if (!r.codeDiscountNode) throw new Error("Shopify no devolvió el descuento básico creado");

  const m = await shopifyGraphql<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    SET_DISCOUNT_TARJETA_MUTATION,
    {
      metafields: [
        {
          ownerId: r.codeDiscountNode.id,
          namespace: "club_el_pais",
          key: "tarjeta_socio",
          type: "single_line_text_field",
          value: params.tarjeta,
        },
      ],
    },
    accessToken,
  );
  if (m.metafieldsSet.userErrors.length > 0) {
    throw new Error(`No se pudo guardar la tarjeta en el descuento: ${m.metafieldsSet.userErrors.map((e) => e.message).join(", ")}`);
  }
  return params.code;
}

export async function createSaleAwarePercentageDiscount(params: {
  code: string;
  percentage: number;
  title: string;
  expiresInMinutes: number;
  tarjeta: string;
}): Promise<string> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + params.expiresInMinutes * 60 * 1000);
  const accessToken = process.env.SHOPIFY_CLUBELPAIS_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta SHOPIFY_CLUBELPAIS_ACCESS_TOKEN");

  let data;
  try {
    data = await shopifyGraphql<{
    discountCodeAppCreate: {
      codeAppDiscount: { discountId: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    CREATE_APP_DISCOUNT_MUTATION,
    {
      codeAppDiscount: {
        title: params.title,
        code: params.code,
        functionHandle: "club-el-pais-sin-sale",
        discountClasses: ["PRODUCT"],
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        combinesWith: {
          productDiscounts: false,
          orderDiscounts: false,
          shippingDiscounts: false,
        },
        metafields: [
          {
            namespace: "$app:club-el-pais-sin-sale",
            key: "function-configuration",
            type: "json",
            value: JSON.stringify({ percentage: params.percentage }),
          },
          {
            // Namespace propio (no $app) para que el webhook de consumo, que corre
            // con el mismo token de esta app, pueda leerlo al confirmarse la orden.
            namespace: "club_el_pais",
            key: "tarjeta_socio",
            type: "single_line_text_field",
            value: params.tarjeta,
          },
        ],
      },
    },
    accessToken,
  );
  } catch (err: any) {
    if (String(err?.message ?? "").includes("Plus plan")) {
      console.warn("Función de descuento no disponible en este plan; usando descuento básico sobre la colección sin oferta.");
      return createBasicPercentageDiscountSinOferta(params, accessToken);
    }
    throw err;
  }

  const result = data.discountCodeAppCreate;
  if (result.userErrors.some((e) => e.message.includes("Plus plan"))) {
    console.warn("Función de descuento no disponible en este plan; usando descuento básico sobre la colección sin oferta.");
    return createBasicPercentageDiscountSinOferta(params, accessToken);
  }
  if (result.userErrors.length > 0) {
    throw new Error(`No se pudo crear el descuento: ${result.userErrors.map((e) => e.message).join(", ")}`);
  }
  if (!result.codeAppDiscount) {
    throw new Error("Shopify no devolvió el descuento creado");
  }
  return params.code;
}

const GET_DISCOUNT_TARJETA_QUERY = `
  query getDiscountTarjeta($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      id
      metafield(namespace: "club_el_pais", key: "tarjeta_socio") {
        value
      }
    }
  }
`;

/**
 * Busca la tarjeta de Club El País asociada a un código de descuento ELPAIS-*
 * previamente creado por createSaleAwarePercentageDiscount.
 */
export async function getTarjetaForDiscountCode(code: string): Promise<string | null> {
  const accessToken = process.env.SHOPIFY_CLUBELPAIS_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta SHOPIFY_CLUBELPAIS_ACCESS_TOKEN");

  const data = await shopifyGraphql<{
    codeDiscountNodeByCode: { metafield: { value: string } | null } | null;
  }>(GET_DISCOUNT_TARJETA_QUERY, { code }, accessToken);

  return data.codeDiscountNodeByCode?.metafield?.value ?? null;
}

const ORDER_METAFIELD_NAMESPACE = "club_el_pais";
const ORDER_METAFIELD_KEY = "consumo_reportado";

/**
 * Chequea si ya se reportó el consumo de una orden a Club El País (idempotencia
 * ante reintentos del webhook de Shopify).
 */
export async function yaSeReportoConsumo(orderId: string): Promise<boolean> {
  const accessToken = process.env.SHOPIFY_CLUBELPAIS_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta SHOPIFY_CLUBELPAIS_ACCESS_TOKEN");

  const data = await shopifyGraphql<{
    order: { metafield: { value: string } | null } | null;
  }>(
    `query orderReportado($id: ID!) {
      order(id: $id) {
        metafield(namespace: "${ORDER_METAFIELD_NAMESPACE}", key: "${ORDER_METAFIELD_KEY}") {
          value
        }
      }
    }`,
    { id: orderId },
    accessToken,
  );

  return data.order?.metafield?.value === "true";
}

/** Marca una orden como ya reportada a Club El País. */
export async function marcarConsumoReportado(orderId: string): Promise<void> {
  const accessToken = process.env.SHOPIFY_CLUBELPAIS_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta SHOPIFY_CLUBELPAIS_ACCESS_TOKEN");

  await shopifyGraphql(
    `mutation setReportado($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: orderId,
          namespace: ORDER_METAFIELD_NAMESPACE,
          key: ORDER_METAFIELD_KEY,
          type: "boolean",
          value: "true",
        },
      ],
    },
    accessToken,
  );
}
