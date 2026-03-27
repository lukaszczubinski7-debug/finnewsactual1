const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

const backendBaseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  DEFAULT_BACKEND_URL;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tickers = url.searchParams.get("tickers");
  const upstream = tickers
    ? `${backendBaseUrl}/market/quotes?tickers=${encodeURIComponent(tickers)}`
    : `${backendBaseUrl}/market/quotes`;

  try {
    const res = await fetch(upstream, { cache: "no-store" });
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch {
    return Response.json({ message: "Could not reach market service." }, { status: 502 });
  }
}
