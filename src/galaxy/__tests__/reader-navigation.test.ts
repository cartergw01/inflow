import { describe, expect, it } from "vitest";
import { readerSwipeDirection } from "../../components/galaxy/reader-navigation";

const swipe = (startX: number, startY: number, endX: number, endY: number, viewportWidth = 390) => readerSwipeDirection({ startX, startY, endX, endY, viewportWidth });

describe("reader swipe navigation", () => {
  it("maps decisive horizontal gestures to story direction", () => {
    expect(swipe(300, 300, 180, 310)).toBe("next");
    expect(swipe(100, 300, 220, 290)).toBe("previous");
  });

  it("requires the larger of 72px or 22% of the viewport", () => {
    expect(swipe(250, 300, 170, 300)).toBeNull();
    expect(swipe(300, 300, 210, 300)).toBe("next");
    expect(swipe(700, 300, 500, 300, 1024)).toBeNull();
    expect(swipe(700, 300, 470, 300, 1024)).toBe("next");
  });

  it("ignores vertical movement and edge-origin gestures", () => {
    expect(swipe(250, 200, 150, 300)).toBeNull();
    expect(swipe(20, 200, 140, 200)).toBeNull();
    expect(swipe(372, 200, 250, 200)).toBeNull();
  });
});
