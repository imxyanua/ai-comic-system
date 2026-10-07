import { strongSecret } from "./env";

describe("strongSecret", () => {
  it("từ chối giá trị thiếu, ngắn hoặc mặc định", () => {
    expect(() => strongSecret("JWT_SECRET", undefined)).toThrow("Thiếu");
    expect(() => strongSecret("JWT_SECRET", "dev-only")).toThrow("32");
    expect(() => strongSecret("JWT_SECRET", "a".repeat(31))).toThrow("32");
  });

  it("nhận chuỗi ngẫu nhiên đủ dài", () => {
    const value = "f3a9c1d27b8e4f6a0c5d9e2b7a1f4c8d";
    expect(strongSecret("JWT_SECRET", value)).toBe(value);
  });
});
