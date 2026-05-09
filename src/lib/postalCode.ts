// Postal-code → address lookup via madefor/postal-code-api
// (static JSON files on GitHub Pages — free, no auth, CORS-enabled).
// https://github.com/madefor/postal-code-api

export type PostalLookupResult = {
  prefecture: string;
  city: string;
  town: string;
  full: string;
};

type PostalCodeApiResponse = {
  code: string;
  data: Array<{
    prefcode: string;
    ja: {
      prefecture: string;
      address1: string; // 市区町村
      address2: string; // 町域
      address3: string;
      address4: string;
    };
  }>;
};

export function normalizePostalCode(input: string): string {
  return input.replace(/[^\d]/g, "").slice(0, 7);
}

export function isCompletePostalCode(input: string): boolean {
  return normalizePostalCode(input).length === 7;
}

export async function lookupPostalCode(
  zip: string,
): Promise<PostalLookupResult | null> {
  const z = normalizePostalCode(zip);
  if (z.length !== 7) return null;
  const url = `https://madefor.github.io/postal-code-api/api/v1/${z.slice(0, 3)}/${z.slice(3)}.json`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`郵便番号検索に失敗 (${res.status})`);
  const json = (await res.json()) as PostalCodeApiResponse;
  const item = json.data?.[0];
  if (!item) return null;
  const ja = item.ja;
  const parts = [ja.prefecture, ja.address1, ja.address2, ja.address3, ja.address4]
    .filter((s) => s && s.length > 0);
  return {
    prefecture: ja.prefecture,
    city: ja.address1,
    town: ja.address2,
    full: parts.join(""),
  };
}

export function formatPostalCode(input: string): string {
  const z = normalizePostalCode(input);
  if (z.length <= 3) return z;
  return `${z.slice(0, 3)}-${z.slice(3)}`;
}
