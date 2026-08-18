import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { DesktopSyncService } from "../../../apps/desktop/src/main/desktop-sync.service";
import { LocalLibraryRepository } from "../../../apps/desktop/src/main/local-library.repository";

const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:3100/api";
const run = promisify(execFile);

describe("real cross-client synchronization", () => {
	it("converges Web and two durable Desktop replicas without reloading", async () => {
		const email = `cross-client-${Date.now()}@synapse.test`;
		const password = "SecureTest123";
		const root = await mkdtemp(join(tmpdir(), "synapse-cross-client-"));
		const firstLibrary = new LocalLibraryRepository(join(root, "desktop-a"));
		const secondLibrary = new LocalLibraryRepository(join(root, "desktop-b"));
		const firstDesktop = new DesktopSyncService(firstLibrary);
		const secondDesktop = new DesktopSyncService(secondLibrary);

		try {
			await registerInWeb(email, password);
			await enableSyncPlan(email);
			await browser.refresh();
			await expect($("[data-testid='sidebar-add']")).toBeDisplayed();

			await Promise.all([
				firstLibrary.updateSettings({ syncPolicy: "automatic" }),
				secondLibrary.updateSettings({ syncPolicy: "automatic" }),
				firstDesktop.login(apiUrl, email, password),
				secondDesktop.login(apiUrl, email, password),
			]);

			await firstLibrary.save({
				content: "Created in the first durable Desktop replica",
				tags: [],
				title: "Desktop to Web realtime",
				type: "note",
			});
			await firstDesktop.syncAll();
			await browser.waitUntil(() => pageContains("Desktop to Web realtime"), {
				timeout: 15_000,
				timeoutMsg: "Web did not render the Desktop mutation without a reload",
			});

			await createWebNote("Web to both Desktops", "Created through the real Web UI");
			await browser.waitUntil(
				async () =>
					(await hasLocalTitle(firstLibrary, "Web to both Desktops")) &&
					(await hasLocalTitle(secondLibrary, "Web to both Desktops")),
				{
					timeout: 15_000,
					timeoutMsg: "Both Desktop replicas did not receive the Web mutation",
				}
			);

			await secondDesktop.stop();
			await createWebNote("Reconnect catch-up", "Created while Desktop B is offline");
			expect(await hasLocalTitle(secondLibrary, "Reconnect catch-up")).toBe(false);
			await secondDesktop.syncAll();
			expect(await hasLocalTitle(secondLibrary, "Reconnect catch-up")).toBe(true);
		} finally {
			await Promise.all([firstDesktop.stop(), secondDesktop.stop()]);
			await browser.execute(async () => {
				await fetch("/api/user", { credentials: "include", method: "DELETE" }).catch(() => undefined);
			});
			await rm(root, { force: true, recursive: true });
		}
	});
});

async function registerInWeb(email: string, password: string): Promise<void> {
	await browser.url("/");
	await $("button=Создать аккаунт").click();
	await $("#email").setValue(email);
	await $("#password").setValue(password);
	await $("form button[type='submit']").click();
	await expect($("[aria-label='Создание аккаунта']")).not.toBeDisplayed();
}

async function enableSyncPlan(email: string): Promise<void> {
	await run(
		"bun",
		["--env-file=apps/backend/.env", "apps/backend/src/server/scripts/enable-e2e-sync-plan.ts"],
		{
			cwd: process.cwd(),
			env: { ...process.env, E2E_USER_EMAIL: email, NODE_ENV: "test" },
		}
	);
}

async function createWebNote(title: string, content: string): Promise<void> {
	const add = $("[data-testid='sidebar-add']");
	if (await add.isExisting()) await add.click();
	else await $("button=Добавить материал").click();
	await $("[data-testid='content-type-note']").click();
	await $("[data-testid='content-title']").setValue(title);
	await $("[aria-label='Содержимое заметки']").setValue(content);
	await $("button[aria-label='Сохранить']").click();
	await expect($("h2=Что вы хотите добавить?")).not.toBeDisplayed();
}

async function pageContains(text: string): Promise<boolean> {
	return (await $("body").getText()).includes(text);
}

async function hasLocalTitle(library: LocalLibraryRepository, title: string): Promise<boolean> {
	return (await library.list()).some((item) => item.title === title);
}
