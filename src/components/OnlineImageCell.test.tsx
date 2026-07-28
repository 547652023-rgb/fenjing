import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatewayError } from "../data/gateway";
import { ImageCell } from "./ImageCell";

describe("ImageCell online mode", () => {
  it("renders frame previews as a vertical list that fits five images", () => {
    const images = Array.from({ length: 5 }, (_, position) => ({
      path: `project/shot/frame/${position}.png`,
      url: `blob:${position}`,
      name: `${position}.png`,
      position,
    }));

    render(
      <ImageCell
        images={images}
        label="画面-1"
        maxImages={5}
        onRemove={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.getByTestId("image-cell-previews")).toHaveClass(
      "image-cell__previews--vertical",
    );
    expect(screen.getAllByRole("img", { name: /画面-1-图片/ })).toHaveLength(5);
  });

  it("uploads dropped image files", async () => {
    const onUpload = vi.fn().mockResolvedValue([
      {
        path: "project/shot/frame/dropped.png",
        url: "blob:dropped",
        name: "dropped.png",
        position: 0,
      },
    ]);

    render(
      <ImageCell
        images={[]}
        label="画面-1"
        maxImages={5}
        onRemove={vi.fn()}
        onUpload={onUpload}
      />,
    );

    const file = new File(["image"], "dropped.png", { type: "image/png" });
    fireEvent.drop(screen.getByText("选择图片"), {
      dataTransfer: { files: [file] },
    });

    expect(onUpload).toHaveBeenCalledWith([file]);
    expect(await screen.findByRole("img", { name: "画面-1-图片1" })).toHaveAttribute(
      "src",
      "blob:dropped",
    );
  });

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
