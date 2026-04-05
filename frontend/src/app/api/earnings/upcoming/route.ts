const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

const backendBaseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  DEFAULT_BACKEND_URL;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = new URLSearchParams();

  const market = url.searchParams.get("market");
  const days = url.searchParams.get("days");
  if (market) params.set("market", market);
  if (days) params.set("days", days);

  const qs = params.toString();
  const upstream = qs
    ? `${backendBaseUrl}/earnings/upcoming?${qs}`
    : `${backendBaseUrl}/earnings/upcoming`;

  try {
    const res = await fetch(upstream, { cache: "no-store" });
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch {
    return Response.json({ message: "Could not reach earnings service." }, { status: 502 });
  }
}
