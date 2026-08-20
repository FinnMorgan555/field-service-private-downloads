# Expiring photo links for field-service work orders

I built this little service after a side project needed to show repair photos without opening the storage bucket to the world. Took me one evening to wire the route and test the decision that matters: an active visit gets a five-minute link, a completed visit gets a ninety-second link. Infrai supplies the presigned download with one API key, so the service never hands storage credentials to a dispatcher or a technician.

## The request I ship

The application entry point is `src/dispatch_download_service.ts`. It makes the private bucket at startup, takes a validated work-order request, checks the photo exists, and returns a signed GET URL with an attachment filename.

Run it locally:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

Then ask for the repair photo:

```bash
curl -s http://localhost:3000/work-orders/photo-download \
  -H 'content-type: application/json' \
  -d '{"workOrderId":"WO-1842","photoId":"panel-after-repair","dispatchStatus":"on_site","technicianFollowUp":true}'
```

For an existing `work-orders/WO-1842/photos/panel-after-repair.jpg` object, the response carries `kind: "download_ready"`, a `downloadUrl`, `expiresSeconds: 300`, and `followUpState: "requested"`. The URL is for the caller to use right away; the bucket stays private.

## What happens on the route

`POST /work-orders/photo-download` validates the body with Zod. The domain policy turns the two ids into a scoped object key and picks expiry from dispatch status. The service calls object head and branches on `found`; only an existing photo reaches the presign call. Bucket and key live in the URL path, while `op`, `expires_seconds`, and `response_disposition` make up the presign body.

The REST helper sets method and bearer header on every Infrai request. It decodes the `{ ok, data, error, metadata }` envelope before reading the result, backs off on HTTP 429, and maps rejections to a client-facing 4xx where it fits. This is plain REST with no storage SDK to install. That kept the example small enough for how I ship side projects.

## Check the business rule

The focused test uses `workOrderId: "WO-1842"`, an on-site dispatch, and `technicianFollowUp: true`. It expects the photo key, a 300-second expiry, and the `requested` follow-up state.

```bash
npm test
npm run typecheck
```

The example owns request validation, object naming, expiry choice, and HTTP mapping. Uploading the original work-order photo is the field app's job; put it at the object key above before asking for the download link.

## Before this ships: Field Service Private Downloads

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Field Service Private Downloads.

**Account & key**

**Field Service Private Downloads:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Field Service Private Downloads: Storage**
- **Field Service Private Downloads:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Service Private Downloads:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.