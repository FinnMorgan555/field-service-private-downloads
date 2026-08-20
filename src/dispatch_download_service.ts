import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai_storage.js";
import { createPhotoDownload } from "./signed_download.js";

const BUCKET = process.env.FIELD_SERVICE_BUCKET ?? "field-service-private-files";
const PORT = Number(process.env.PORT ?? 3000);

const requestSchema = z.object({
  workOrderId: z.string().trim().min(1).max(80),
  photoId: z.string().trim().min(1).max(80),
  dispatchStatus: z.enum(["assigned", "en_route", "on_site", "completed"]),
  technicianFollowUp: z.boolean()
}).strict();

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: AsyncIterable<unknown>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

await infrai.storage.bucket.create(BUCKET);

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-orders/photo-download") {
    json(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const parsed = requestSchema.safeParse(await readBody(request));
    if (!parsed.success) {
      json(response, 400, { error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const result = await createPhotoDownload(BUCKET, parsed.data as Parameters<typeof createPhotoDownload>[1]);
    if (result.kind === "photo_missing") {
      json(response, 404, result);
      return;
    }
    json(response, 200, result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_json" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, message: error.message });
      return;
    }
    json(response, 500, { error: "request_failed" });
  }
});

server.listen(PORT, () => {
  console.log(`Field-service downloads listening on http://localhost:${PORT}`);
});
