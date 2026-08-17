import { join } from "node:path";

const fixtures = process.env.E2E_FIXTURES_DIR ?? ".cache/e2e-fixtures";

async function chooseType(type: "note" | "todo" | "link" | "media" | "audio" | "doc") {
	const picker = $("h2=Что добавим?");
	if (!(await picker.isDisplayed())) {
		const add = $("[data-testid='sidebar-add']");
		if (await add.isExisting()) await add.click();
		else await $("button=Добавить материал").click();
		await picker.waitForDisplayed();
	}
	await $(`[data-testid='content-type-${type}']`).click();
	await $("form").waitForDisplayed();
}

async function submit() {
	const submitButton = $("form button[type='submit']");
	if (await submitButton.isExisting()) await submitButton.click();
	else await $("button[aria-label='Сохранить']").click();
	await expect($("h2=Что вы хотите добавить?")).not.toBeDisplayed();
}

async function waitForText(text: string) {
	await browser.waitUntil(async () => (await $("body").getText()).includes(text));
}

async function createNote(title: string, body: string) {
	await chooseType("note");
	await $("[data-testid='content-title']").setValue(title);
	await $("[aria-label='Содержимое заметки']").setValue(body);
	await submit();
	await waitForText(title);
}

async function openNoteEditor(title: string) {
	const card = $("h3=" + title);
	await card.waitForDisplayed();
	await card.click({ button: "right" });
	await $("button[role='menuitem']=Изменить").click();
	await $("[data-testid='content-title']").waitForDisplayed();
}

async function changeTypeConfirmation() {
	const dialog = $("[data-testid='change-type-confirm']");
	await dialog.waitForDisplayed();
	return dialog;
}

describe("complete web user journey", () => {
	const email = `journey-${Date.now()}@synapse.test`;
	const password = "SecureTest123";

	after(async () => {
		await browser.execute(async () => {
			await fetch("/api/user", {
				credentials: "include",
				method: "DELETE",
			}).catch(() => undefined);
		});
	});

	it("creates every web item flow, finds it, visits pages, and removes its account", async () => {
		await browser.setWindowSize(1440, 1000);
		await browser.url("/");
		await $("button=Создать аккаунт").click();
		await $("#email").setValue(email);
		await $("#password").setValue(password);
		await $("form button[type='submit']").click();
		await expect($("[data-testid='sidebar-add']")).toBeDisplayed();

		await createNote("E2E note searchable", "E2E note body");
		await openNoteEditor("E2E note searchable");
		const editor = $("[aria-label='Содержимое заметки']");
		await editor.setValue("E2E formatted note body");
		await browser.keys(["Meta", "b"]);
		await editor.addValue(" bold");
		await $("button[aria-label='Сохранить']").click();
		await expect($("body")).toHaveText(expect.stringContaining("E2E formatted note body bold"));

		await chooseType("note");
		await $("[data-testid='content-title']").setValue("E2E unsaved draft");
		await $("[aria-label='Содержимое заметки']").setValue("Draft must remain until confirmed");
		await $("[data-testid='content-back']").click();
		const changeTypeDialog = await changeTypeConfirmation();
		await expect(changeTypeDialog).toBeDisplayed();
		await changeTypeDialog.$("button=Сбросить").click();
		await $("h2=Сменить тип материала?").waitForDisplayed({ reverse: true });
		await expect($("[data-testid='content-title']")).toHaveValue("E2E unsaved draft");
		await $("[data-testid='content-back']").click();
		const confirmedChangeTypeDialog = await changeTypeConfirmation();
		await confirmedChangeTypeDialog.$("[data-testid='change-type-confirm-confirm']").click();
		await confirmedChangeTypeDialog.waitForDisplayed({ reverse: true });
		await $("h2=Что добавим?").waitForDisplayed();

		await chooseType("note");
		const tagInput = $("input[placeholder='+ Добавить тег']");
		for (let index = 1; index <= 10; index++) {
			await tagInput.setValue(`e2e-tag-${index}`);
			await browser.keys("Enter");
		}
		await tagInput.setValue("e2e-tag-11");
		await browser.keys("Enter");
		await expect($("[role='status']")).toHaveText(expect.stringContaining("не более 10"));
		await $("[data-testid='content-title']").setValue("E2E tagged note");
		await $("[aria-label='Содержимое заметки']").setValue("E2E tags are persisted");
		await submit();
		await waitForText("E2E tagged note");

		await chooseType("todo");
		await $("[data-testid='content-title']").setValue("E2E todo searchable");
		await $("[data-testid='todo-item']").setValue("E2E task");
		await browser.keys("Enter");
		await submit();
		await waitForText("E2E task");

		await chooseType("link");
		await $("[data-testid='content-url']").setValue("https://example.com/e2e");
		await $("[data-testid='content-title']").setValue("E2E link searchable");
		await submit();
		await waitForText("E2E link searchable");

		await chooseType("media");
		await $("input[type='file']").addValue(
			await browser.uploadFile(join(process.cwd(), "test/assets/test-image.png"))
		);
		await $("[data-testid='content-title']").setValue("E2E media searchable");
		await submit();
		await $("img[alt='E2E media searchable']").waitForDisplayed();

		await chooseType("audio");
		await $("input[type='file']").addValue(await browser.uploadFile(join(fixtures, "sample.wav")));
		await submit();
		await waitForText("sample");

		await chooseType("doc");
		await $("input[type='file']").addValue(await browser.uploadFile(join(fixtures, "sample.csv")));
		await submit();
		await waitForText("E2E CSV");

		const search = $("[data-testid='content-search']");
		await search.setValue("E2E note searchable");
		await browser.waitUntil(async () => (await $("body").getText()).includes("E2E note searchable"), {
			timeout: 30_000,
			timeoutMsg: "Search did not return the created note",
		});

		for (const path of ["/", "/tags", "/graph"]) {
			await browser.url(path);
			await expect($("body")).toBeDisplayed();
		}
	});
});
