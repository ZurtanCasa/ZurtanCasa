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

  const data = await shopifyGraphql<{
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

  const result = data.discountCodeAppCreate;
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
