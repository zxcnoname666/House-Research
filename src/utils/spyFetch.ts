export async function spyFetch(
  url: string,
  options: RequestInit | undefined = undefined,
) {
  return await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"\n',
    },
  });
}
