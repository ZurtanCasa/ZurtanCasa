const API_VERSION = "2024-10";

function shopifyGraphqlEndpoint(): string {
  const storeUrl = (process.env.SHOPIFY_STORE_URL || "").replace(/\/$/, "");
  if (!storeUrl) throw new Error("Falta SHOPIFY_STORE_URL");
  return `${storeUrl}/admin/api/${API_VERSION}/graphql.json`;
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
  if (!accessToken) throw new Error("Falta SHOPIFY_ACCESS_TOKEN");

  const res = await fetch(shopifyGraphqlEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data as T;
}

const CREATE_DISCOUNT_MUTATION = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Crea un código de descuento de un solo uso, porcentual, con vencimiento corto
 * (pensado para aplicarse en el momento dentro del mismo checkout).
 */
export async function createSingleUsePercentageDiscount(params: {
  code: string;
  percentage: number;
  title: string;
  expiresInMinutes: number;
}): Promise<string> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + params.expiresInMinutes * 60 * 1000);

  const data = await shopifyGraphql<{
    discountCodeBasicCreate: {
      codeDiscountNode: { codeDiscount: { codes: { nodes: { code: string }[] } } } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(CREATE_DISCOUNT_MUTATION, {
    basicCodeDiscount: {
      title: params.title,
      code: params.code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: { all: true },
      customerGets: {
        value: { percentage: params.percentage / 100 },
        items: { all: true },
      },
    },
  });

  const result = data.discountCodeBasicCreate;
  if (result.userErrors.length > 0) {
    throw new Error(`No se pudo crear el descuento: ${result.userErrors.map((e) => e.message).join(", ")}`);
  }
  const code = result.codeDiscountNode?.codeDiscount.codes.nodes[0]?.code;
  if (!code) throw new Error("Shopify no devolvió el código de descuento creado");
  return code;
}
