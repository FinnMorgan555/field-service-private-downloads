import { describe, expect, it } from "vitest";
import { decideDownload } from "../src/signed_download.js";

describe("field-service photo download policy", () => {
  it("gives an active on-site visit a five-minute link and records follow-up", () => {
    expect(decideDownload({
      workOrderId: "WO-1842",
      photoId: "panel-after-repair",
      dispatchStatus: "on_site",
      technicianFollowUp: true
    })).toEqual({
      objectKey: "work-orders/WO-1842/photos/panel-after-repair.jpg",
      expiresSeconds: 300,
      followUpState: "requested"
    });
  });

  it("limits a completed visit link to ninety seconds", () => {
    expect(decideDownload({
      workOrderId: "WO-1842",
      photoId: "panel-after-repair",
      dispatchStatus: "completed",
      technicianFollowUp: false
    }).expiresSeconds).toBe(90);
  });
});
