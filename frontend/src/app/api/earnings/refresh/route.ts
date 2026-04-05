const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

const backendBaseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  DEFAULT_BACKEND_URL;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  try {
    const res = await fetch(`${backendBaseUrl}/earnings/refresh`, {
      method: "POST",
      cache: "no-store",
    });
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch {
    return Response.json({ message: "Could not reach earnings service." }, { status: 502 });
  }
}
