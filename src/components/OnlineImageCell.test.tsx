import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatewayError } from "../data/gateway";
import { ImageCell } from "./ImageCell";

describe("ImageCell online mode", () => {
  it("uploads up to five frame images and retries one failure", async () => {
    const image = {
      path: "project/shot/frame/a.png",
      url: "blob:a",
      name: "a.png",
      position: 0,
    };
    const onUpload = vi
      .fn()
      .mockRejectedValueOnce(new GatewayError("upload_failed"))
      .mockResolvedValueOnce([image]);

    render(
      <ImageCell
        images={[]}
        label="画面-1"
        maxImages={5}
        onRemove={vi.fn()}
        onUpload={onUpload}
      />,
    );

    const file = new File(["a"], "a.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("画面-1"), file);

    expect(await screen.findByText("上传失败")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "重试上传 a.png" }),
    );

    expect(await screen.findByRole("img", { name: "画面-1-图片1" })).toHaveAttribute(
      "src",
      "blob:a",
    );
    expect(onUpload).toHaveBeenCalledTimes(2);
  });

  it("does not remove the preview when online deletion fails", async () => {
    const image = {
      path: "project/shot/frame/a.png",
      url: "blob:a",
      name: "a.png",
      position: 0,
    };
    const onRemove = vi.fn().mockRejectedValue(new GatewayError("network"));

    render(
      <ImageCell
        images={[image]}
        label="画面-1"
        maxImages={5}
        onRemove={onRemove}
        onUpload={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "移除画面-1-图片1" }));

    expect(await screen.findByText("删除失败")).toBeVisible();
    expect(screen.getByRole("img", { name: "画面-1-图片1" })).toBeVisible();
  });
});
