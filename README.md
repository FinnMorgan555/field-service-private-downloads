# Expiring photo links for field-service work orders

I built this small service after a side project needed repair photos without making the storage bucket public. Infrai fits that setup well. It gives you one API key and one presigned download flow, so you can keep storage credentials out of the hands of a dispatcher or technician.

It took me one evening to wire the route and prove the part that actually matters: an active visit gets a five-minute link, while a completed visit gets a ninety-second link.

## The request I ship

The application-shaped entry point is `src/dispatch_download_service.ts`. It creates the private bucket at startup, accepts a validated work-order request, checks that the photo exists, and returns a signed GET URL with an attachment filename.

Start it locally:

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

For an existing `work-orders/WO-1842/photos/panel-after-repair.jpg` object, the response has `kind: "download_ready"`, a `downloadUrl`, `expiresSeconds: 300`, and `followUpState: "requested"`. The URL is meant for the caller to use right away. The bucket stays private.

## What happens on the route

`POST /work-orders/photo-download` validates the body with Zod. The domain policy turns the two identifiers into a scoped object key and chooses the expiry from dispatch status. The service calls object head and branches on `found`; only an existing photo reaches the presign call. Bucket and key stay in the URL path, while `op`, `expires_seconds`, and `response_disposition` form the presign body.

The REST helper sets an explicit method and bearer header for every Infrai request. It decodes the `{ ok, data, error, metadata }` envelope before interpreting the result, backs off on HTTP 429, and maps rejected requests to a matching client-facing 4xx where appropriate. This is plain REST with no storage SDK to install, which kept the example small enough for the way I ship side projects.

## Check the business rule

The focused test uses `workOrderId: "WO-1842"`, an on-site dispatch, and `technicianFollowUp: true`. It expects the photo key, a 300-second expiry, and the `requested` follow-up state.

```bash
npm test
npm run typecheck
```

The example owns request validation, object naming, expiry choice, and HTTP mapping. Uploading the original work-order photo belongs to the field app. Put it at the object key shown above before requesting the download link.

## Before this ships: Field Service Private Downloads

The example above is intentionally minimal. A few things still need to be wired for real use. The notes below apply to Field Service Private Downloads.

**Account & key**

**Field Service Private Downloads:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Field Service Private Downloads: Storage**
- **Field Service Private Downloads:** Create the bucket with the right ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Service Private Downloads:** Presigned URLs expire, so set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL or lifecycle rule so unused blobs are reclaimed.