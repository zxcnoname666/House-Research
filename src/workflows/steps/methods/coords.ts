import { safeFreeThink } from "./ai.ts";
import addressObfuscate from "#ai-agents/prompts/address-obfuscate.ts";
import { encode as qs } from "node:querystring";

const parsedAddressCache = new Map<string, Promise<string>>();

export async function parseAddress(address: string): Promise<string> {
  const cached = parsedAddressCache.get(address);
  if (cached) {
    return await cached;
  }

  const promise = safeFreeThink(addressObfuscate, address)
    .then((res) => res.split("р-н")[0]);
  parsedAddressCache.set(address, promise);

  return await promise;
}

export async function getCoordsByParsedAddress(
  address: string,
): Promise<{ name: string; lat: number; lon: number }[]> {
  const url = "https://nominatim.openstreetmap.org/search?" + qs({
    q: address,
    format: "json",
    addressdetails: "1",
    limit: "3",
  });

  const res = await fetch(url, {
    headers: { "User-Agent": "geocoder/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  type NResult = { lat: string; lon: string; display_name: string };
  const data: NResult[] = await res.json();
  return data.map((p) => ({
    name: p.display_name,
    lat: +p.lat,
    lon: +p.lon,
  }));
}

if (import.meta.main) {
  const address = await parseAddress(
    "Краснодарский край, Краснодар, Карасунский, мкр. Черемушки, Ставропольская ул., 113",
  );
  console.info(address);
  console.info(await getCoordsByParsedAddress(address));
}
