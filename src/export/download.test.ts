import { afterEach, vi } from "vitest";
import { downloadBlob } from "./download";

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
  } else {
    Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});

it("clicks an attached download anchor and revokes its URL on a later task", () => {
  vi.useFakeTimers();
  const createObjectURL = vi.fn(() => "blob:storyboard-export");
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  let clickedAnchor: HTMLAnchorElement | undefined;
  let attachedDuringClick = false;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
    this: HTMLAnchorElement,
  ) {
    clickedAnchor = this;
    attachedDuringClick = document.body.contains(this);
  });

  const blob = new Blob(["export"]);
  downloadBlob(blob, "分镜表.pdf");

  expect(createObjectURL).toHaveBeenCalledWith(blob);
  expect(clickedAnchor?.download).toBe("分镜表.pdf");
  expect(attachedDuringClick).toBe(true);
  expect(clickedAnchor && document.body.contains(clickedAnchor)).toBe(false);
  expect(revokeObjectURL).not.toHaveBeenCalled();

  vi.runAllTimers();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:storyboard-export");
});
