import { expect, test } from "@playwright/test";

const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c63f8cfc0f01f0005000201a5f4d6e30000000049454e44ae426082",
  "hex",
);

test("tác giả đi hết luồng MVP trên giao diện", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());

  await test.step("đăng ký", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Chưa có tài khoản" }).click();
    await page.getByLabel("Email").fill(`ui-${Date.now()}@example.com`);
    await page.getByLabel("Mật khẩu").fill("ui-password");
    await page.getByRole("button", { name: "Đăng ký và vào" }).click();
    await expect(page.getByRole("heading", { name: "Comic của bạn" })).toBeVisible();
  });

  await test.step("tạo comic", async () => {
    await page.getByLabel("Tên comic").fill("UI comic");
    await page.getByLabel("Style guide").fill("mực đen");
    await page.getByRole("button", { name: "Tạo comic" }).click();
    await expect(page.getByRole("heading", { name: "Nhân vật" })).toBeVisible();
  });

  await test.step("thêm nhân vật và ảnh tham chiếu", async () => {
    await page.getByPlaceholder("Tên", { exact: true }).fill("An");
    await page.getByPlaceholder("Mô tả", { exact: true }).fill("áo đỏ");
    await page.getByRole("button", { name: "Thêm nhân vật" }).click();
    await expect(page.getByLabel("Mô tả nhân vật")).toHaveValue("áo đỏ");
    await page.locator('input[type="file"]').setInputFiles({ name: "an.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(page.getByAltText("Ảnh tham chiếu An")).toBeVisible();
  });

  const panels = page.getByTestId("panel");

  await test.step("sinh ảnh một panel kèm thoại", async () => {
    await page.getByRole("button", { name: "Thêm cảnh" }).click();
    await page.getByRole("button", { name: "Thêm panel" }).click();
    const first = panels.nth(0);
    await first.getByLabel("Prompt", { exact: true }).fill("ui panel một");
    await first.getByRole("button", { name: "Thêm dòng thoại" }).click();
    await first.getByPlaceholder("Người nói").fill("An");
    await first.getByPlaceholder("Lời thoại").fill("Chào");
    await first.getByRole("button", { name: "Lưu", exact: true }).click();
    await first.getByRole("button", { name: "Sinh ảnh" }).click();
    await expect(first.getByAltText("Ảnh panel 1.1")).toBeVisible();
    await expect(first).toHaveAttribute("data-status", "succeeded");
    await page.reload();
    await expect(panels.nth(0).getByPlaceholder("Lời thoại")).toHaveValue("Chào");
  });

  await test.step("panel lỗi hiện lý do và retry được", async () => {
    await page.getByRole("button", { name: "Thêm panel" }).click();
    const second = panels.nth(1);
    await second.getByLabel("Prompt", { exact: true }).fill("[mock:fail] ui");
    await second.getByRole("button", { name: "Sinh ảnh" }).click();
    await expect(second).toHaveAttribute("data-status", "failed");
    await expect(second.getByText("Prompt có [mock:fail]")).toBeVisible();
    await second.getByRole("button", { name: "Retry" }).click();
    await expect(second).toHaveAttribute("data-status", "failed");
  });

  await test.step("đổi thứ tự panel", async () => {
    await panels.nth(0).getByRole("button", { name: "Đưa panel ra sau" }).click();
    await expect(panels.nth(0).getByLabel("Prompt", { exact: true })).toHaveValue("[mock:fail] ui");
    await expect(panels.nth(1).getByLabel("Prompt", { exact: true })).toHaveValue("ui panel một");
  });

  await test.step("batch hai panel ra kết quả có panel lỗi", async () => {
    await page.getByRole("button", { name: "Sinh ảnh tất cả panel" }).click();
    await expect(page.getByTestId("workflow-status")).toContainText("Xong, có panel lỗi", { timeout: 90_000 });
  });

  await test.step("export ZIP tải được file", async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export ZIP" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  });

  await test.step("archive ẩn comic khỏi danh sách", async () => {
    await page.getByRole("link", { name: "← Danh sách comic" }).click();
    await expect(page.getByRole("link", { name: "UI comic" })).toBeVisible();
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("link", { name: "UI comic" })).toHaveCount(0);
  });
});
