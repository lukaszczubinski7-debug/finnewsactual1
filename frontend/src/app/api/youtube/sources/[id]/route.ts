const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const backendBaseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  DEFAULT_BACKEND_URL;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const auth = request.headers.get("Authorization") || "";
  try {
    const res = await fetch(`${backendBaseUrl}/youtube/sources/${params.id}`, {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    return new Response(null, { status: res.status });
  } catch {
    return Response.json({ detail: "Backend niedostępny." }, { status: 502 });
  }
}
