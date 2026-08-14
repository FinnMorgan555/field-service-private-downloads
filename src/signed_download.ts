import { infrai } from "./infrai_storage.js";

export type DispatchStatus = "assigned" | "en_route" | "on_site" | "completed";

export type DownloadRequest = {
  workOrderId: string;
  photoId: string;
  dispatchStatus: DispatchStatus;
  technicianFollowUp: boolean;
};

export type DownloadDecision = {
  objectKey: string;
  expiresSeconds: number;
  followUpState: "requested" | "not_requested";
};

export function decideDownload(input: DownloadRequest): DownloadDecision {
  const activeVisit = input.dispatchStatus === "en_route" || input.dispatchStatus === "on_site";
  return {
    objectKey: `work-orders/${input.workOrderId}/photos/${input.photoId}.jpg`,
    expiresSeconds: activeVisit ? 300 : 90,
    followUpState: input.technicianFollowUp ? "requested" : "not_requested"
  };
}

export async function createPhotoDownload(bucket: string, input: DownloadRequest) {
  const decision = decideDownload(input);
  const object = await infrai.storage.object.head(bucket, decision.objectKey);
  if (!object.found) return { kind: "photo_missing" as const, ...decision };

  const signed = await infrai.storage.object.presign(
    bucket,
    decision.objectKey,
    decision.expiresSeconds,
    `attachment; filename="${input.workOrderId}-${input.photoId}.jpg"`
  );
  return { kind: "download_ready" as const, downloadUrl: signed.url, ...decision };
}
