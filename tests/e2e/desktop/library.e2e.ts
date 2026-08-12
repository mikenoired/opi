describe("desktop library", () => {
	it("creates a note in the local dashboard and exposes the macOS drag area", async () => {
		await expect($("body")).toBeDisplayed();
		await $("button=Добавить").click();
		await $("[data-testid='content-type-note']").click();
		await $("[data-testid='content-title']").setValue("E2E desktop note");
		await $("[aria-label='Содержимое заметки']").setValue("Saved by the Electron UI");
		await $("form button[type='submit']").click();
		await expect($("body")).toHaveText(expect.stringContaining("E2E desktop note"));

		if (process.platform === "darwin") {
			const appRegion = await browser.execute(() => {
				const region = document.querySelector<HTMLElement>(".desktop-titlebar-drag-region");
				return region ? getComputedStyle(region).webkitAppRegion : null;
			});
			expect(appRegion).toBe("drag");
		}
	});
});
