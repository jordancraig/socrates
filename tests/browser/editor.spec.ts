import { test, expect } from "@playwright/test";
test("two authors synchronize; title, palette and discussion persist", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByLabel("Document editor")).toBeVisible();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.locator(".new-document").click();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Untitled document",
  );
  await page.getByLabel("Document title").fill("A shared writing test");
  await page
    .getByLabel("Document editor")
    .fill("A thoughtful opening paragraph.");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const savedId = await page.evaluate(() =>
    localStorage.getItem("atelier-document"),
  );
  const second = await context.newPage();
  await second.addInitScript(
    (id) => localStorage.setItem("atelier-document", id!),
    savedId,
  );
  await second.goto("/");
  await expect(second.getByLabel("Document editor")).toContainText(
    "A thoughtful opening paragraph.",
  );
  await second.getByLabel("Document editor").click();
  await second.keyboard.press("End");
  await second.keyboard.type(" With another perspective.");
  await expect(page.getByLabel("Document editor")).toContainText(
    "With another perspective.",
  );
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  await page.getByLabel("Source title").fill("Editorial context");
  await page
    .getByLabel("Reference text")
    .fill(
      "The intended audience is business leaders. Focus on business outcomes.",
    );
  await page
    .getByRole("button", { name: "Add to palette", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Editorial context/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discussions", exact: true }).click();
  await page
    .getByPlaceholder("Discuss the selected paragraph…")
    .fill("We should make the intended audience clear.");
  await page.getByRole("button", { name: /Start discussion/ }).click();
  await expect(
    page.getByText("We should make the intended audience clear."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "A shared writing test",
  );
  await expect(page.getByLabel("Document editor")).toContainText(
    "With another perspective.",
  );
  expect(errors).toEqual([]);
  await context.close();
});
