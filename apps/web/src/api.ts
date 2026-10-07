const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

export type ApiError = { error: { code: string; message: string } };

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T & ApiError) : ({} as T);
  if (!response.ok) {
    const message = isApiError(data) ? data.error.message : `Lỗi ${response.status}`;
    throw new RequestError(message, response.status);
  }
  return data;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "error" in value;
}
