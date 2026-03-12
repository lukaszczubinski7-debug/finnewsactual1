const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

const backendBaseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  DEFAULT_BACKEND_URL;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const response = await fetch(`${backendBaseUrl}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/json; charset=utf-8",
    },
    body,
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
