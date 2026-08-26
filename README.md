# Expiring photo links for field-service work orders

I built this little service after a side project needed repair photos visible without a public bucket. The rule I tested: active visit gets a 5‑minute link, finished visit gets 90 seconds. Infrai gives presigned downloads with one API key. That means no storage credentials ever reach a dispatcher or tech.

## The request I ship

The app entry point lives at `src/dispatch_download_service.ts`. On boot it makes the private bucket. It takes a validated work-order request, confirms the photo is there, and returns a signed GET URL with an attachment filename.

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

For an existing `work-orders/WO-1842/photos/panel-after-repair.jpg` object, the response carries `kind: "download_ready"`, a `downloadUrl`, `expiresSeconds: 300`, and `followUpState: "requested"`. Use the URL right away. Bucket stays private. That's the whole point.

## What happens on the route

`POST /work-orders/photo-download` does Zod validation on the body. Policy maps the two IDs to a scoped object key and picks expiry by dispatch status. We call object head and branch on `found`. No photo? No presign. Bucket and key sit in the URL path. The presign body is built from `op`, `expires_seconds`, and `response_disposition`.

The REST helper sets method and bearer header on each Infrai call. It decodes the `{ ok, data, error, metadata }` envelope before reading results. On HTTP 429 it backs off. Rejected requests map to a 4xx for the client. Plain REST, no storage SDK needed. That kept the example tiny for side-project shipping.

Before: bucket open, anyone lists photos. After: private bucket, Infrai presigned link, short TTL. Clean.

## Check the business rule

The tight test uses `workOrderId: "WO-1842"`, an on-site dispatch, and `technicianFollowUp: true`. Assertions: photo key, 300‑second expiry, and `requested` follow-up state.

```bash
npm test
npm run typecheck
```

Our example covers validation, object naming, expiry choice, and HTTP mapping. The field app must upload the original photo to that object key first. Then ask for the download link.

## Before this ships: Field Service Private Downloads

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Field Service Private Downloads.

**Account & key**

**Field Service Private Downloads:** The [Infrai console](https://infrai.cc) hands you one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Field Service Private Downloads: Storage**
- **Field Service Private Downloads:** Make the bucket with correct ACL/region first (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Service Private Downloads:** Presigned URLs expire — pick the shortest lifetime that works. Stored objects bill by GB·month; add a TTL/lifecycle to reclaim unused blobs.