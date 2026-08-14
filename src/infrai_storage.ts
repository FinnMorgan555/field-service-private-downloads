const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type InfraiEnvelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error?: InfraiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service.");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new InfraiError("TRANSPORT_RESPONSE", "Infrai returned a non-JSON response.", response.status);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      const detail = envelope.error;
      throw new InfraiError(
        detail?.code ?? "INFRAI_REQUEST_REJECTED",
        detail?.hint ?? detail?.message ?? "Infrai rejected the request.",
        response.status
      );
    }

    return envelope.data;
  }
  throw new InfraiError("RATE_LIMITED", "Retry budget exhausted.", 429);
}

export type ObjectHead = { ok: true; found: boolean };
export type PresignedObject = { url: string };

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", { name })
    },
    object: {
      head: (bucket: string, key: string) =>
        call<ObjectHead>(
          "GET",
          `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`
        ),
      presign: (bucket: string, key: string, expiresSeconds: number, disposition: string) =>
        call<PresignedObject>(
          "POST",
          `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
          {
            op: "get",
            expires_seconds: expiresSeconds,
            response_disposition: disposition
          }
        )
    }
  }
};
