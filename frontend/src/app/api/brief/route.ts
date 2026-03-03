const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const PROXY_TIMEOUT_MS = 120_000;

const backendBaseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  DEFAULT_BACKEND_URL;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  const body = await request.text();

  try {
    const upstreamResponse = await fetch(`${backendBaseUrl}/brief`, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json; charset=utf-8",
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: upstreamResponse.headers,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return Response.json(
        { message: "Request timed out after 120 seconds." },
        { status: 504 },
      );
    }

    return Response.json(
      { message: "Could not reach the backend brief service." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
