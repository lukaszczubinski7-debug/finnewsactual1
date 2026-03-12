const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

const backendBaseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  DEFAULT_BACKEND_URL;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function withAuth(request: Request): HeadersInit {
  const authorization = request.headers.get("authorization");
  return authorization ? { Authorization: authorization } : {};
}

export async function GET(request: Request): Promise<Response> {
  const response = await fetch(`${backendBaseUrl}/profile/preferences`, {
    method: "GET",
    headers: withAuth(request),
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function PUT(request: Request): Promise<Response> {
  const body = await request.text();
  const response = await fetch(`${backendBaseUrl}/profile/preferences`, {
    method: "PUT",
    headers: {
      ...withAuth(request),
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

export async function PATCH(request: Request): Promise<Response> {
  const body = await request.text();
  const response = await fetch(`${backendBaseUrl}/profile/preferences`, {
    method: "PATCH",
    headers: {
      ...withAuth(request),
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
