import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const authHeader = req.headers.get("authorization") ?? "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };
  if (authHeader) headers["Authorization"] = authHeader;

  const resp = await fetch(`${API_BASE}/research`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}
