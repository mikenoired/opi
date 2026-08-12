describe("authentication", () => {
	it("registers, signs in again, and deletes a new account", async () => {
		const email = `e2e-${Date.now()}@synapse.test`;
		const password = "SecureTest123";
		await browser.url("/");

		await $("button=Создать аккаунт").click();
		await expect($("[aria-label='Создание аккаунта']")).toBeDisplayed();
		await expect($("#email")).toBeDisplayed();
		await expect($("#password")).toBeDisplayed();
		await $("#email").setValue(email);
		await $("#password").setValue(password);
		await $("form button[type='submit']").click();
		const registrationError = $("[role='alert']");
		if (await registrationError.isExisting()) throw new Error(await registrationError.getText());
		await expect($("[aria-label='Создание аккаунта']")).not.toBeDisplayed();

		await browser.url("/?settings=general");
		await $("button=Выйти").click();
		await expect($("button=Войти")).toBeDisplayed();

		await $("button=Войти").click();
		await $("#email").setValue(email);
		await $("#password").setValue(password);
		await $("form button[type='submit']").click();
		await expect($("[aria-label='Вход в Synapse']")).not.toBeDisplayed();

		await browser.url("/?settings=general");
		await $("button=Удалить аккаунт").click();
		await expect($("h2=Удалить аккаунт?")).toBeDisplayed();
		await $("button=Удалить навсегда").click();
		await expect($("button=Войти")).toBeDisplayed();
	});
});
