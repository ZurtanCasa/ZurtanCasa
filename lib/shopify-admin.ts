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
