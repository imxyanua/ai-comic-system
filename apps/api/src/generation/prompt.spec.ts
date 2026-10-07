import { buildImagePrompt, DEFAULT_NEGATIVE_PROMPT, resolveNegativePrompt } from "./prompt";

describe("buildImagePrompt", () => {
  it("giữ prompt đã nhập", () => {
    expect(
      buildImagePrompt({
        existingPrompt: "  một khung mưa  ",
        styleGuide: "ink",
        characters: [{ name: "An", description: "áo đỏ" }],
        sceneSummary: "đêm",
      }),
    ).toBe("một khung mưa");
  });

  it("ghép style, nhân vật và cảnh khi prompt trống", () => {
    expect(
      buildImagePrompt({
        existingPrompt: "  ",
        styleGuide: "mực đen",
        characters: [
          { name: "An", description: "áo đỏ" },
          { name: "Bình", description: "" },
        ],
        sceneSummary: "trên mái nhà",
      }),
    ).toBe("mực đen\nAn: áo đỏ\nBình\ntrên mái nhà");
  });

  it("bỏ phần trống", () => {
    expect(
      buildImagePrompt({
        existingPrompt: null,
        styleGuide: null,
        characters: [],
        sceneSummary: "hoàng hôn",
      }),
    ).toBe("hoàng hôn");
  });

  it("trả null khi không có gì để ghép", () => {
    expect(
      buildImagePrompt({
        existingPrompt: null,
        styleGuide: " ",
        characters: [{ name: " ", description: " " }],
        sceneSummary: null,
      }),
    ).toBeNull();
  });
});

describe("resolveNegativePrompt", () => {
  it("dùng câu mặc định khi trống", () => {
    expect(resolveNegativePrompt(null)).toBe(DEFAULT_NEGATIVE_PROMPT);
    expect(resolveNegativePrompt("  ")).toBe(DEFAULT_NEGATIVE_PROMPT);
  });

  it("giữ negative prompt đã nhập", () => {
    expect(resolveNegativePrompt(" blurry ")).toBe("blurry");
  });
});
