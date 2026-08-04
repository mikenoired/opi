type ItemType = "note" | "link" | "todo";
type SyncPolicy = "manual" | "automatic";

interface LocalItem {
	content: string;
	createdAt: string;
	id: string;
	syncState: string;
	tags: string[];
	title: string;
	type: ItemType;
	updatedAt: string;
	url?: string;
}

interface LocalStatistics {
	itemCount: number;
	lastUpdatedAt: string | null;
	localBytes: number;
	pendingSyncCount: number;
	tagCount: number;
}

declare global {
	interface Window {
		synapseDesktop: {
			library: {
				delete(id: string): Promise<void>;
				list(search?: string): Promise<LocalItem[]>;
				save(input: Omit<LocalItem, "createdAt" | "syncState" | "updatedAt">): Promise<LocalItem>;
				settings(): Promise<{ syncPolicy: SyncPolicy }>;
				statistics(): Promise<LocalStatistics>;
				updateSettings(settings: { syncPolicy?: SyncPolicy }): Promise<{ syncPolicy: SyncPolicy }>;
			};
			platform: string;
		};
	}
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Application root is missing");
const app: HTMLDivElement = root;

let items: LocalItem[] = [];
let editingId: string | undefined;
let statistics: LocalStatistics | undefined;
let syncPolicy: SyncPolicy = "manual";

async function refresh(search?: string): Promise<void> {
	[items, statistics, { syncPolicy }] = await Promise.all([
		window.synapseDesktop.library.list(search),
		window.synapseDesktop.library.statistics(),
		window.synapseDesktop.library.settings(),
	]);
	render();
}

function render(): void {
	const editing = items.find((item) => item.id === editingId);
	app.innerHTML = `
		<main>
			<header><div><p class="eyebrow">SYNAPSE DESKTOP</p><h1>Локальная библиотека</h1></div><span class="platform">${escapeHtml(window.synapseDesktop.platform)}</span></header>
			<section class="stats">
				<div><strong>${statistics?.itemCount ?? 0}</strong><span>материалов</span></div>
				<div><strong>${statistics?.tagCount ?? 0}</strong><span>тегов</span></div>
				<div><strong>${formatBytes(statistics?.localBytes ?? 0)}</strong><span>локально</span></div>
				<div><strong>${statistics?.pendingSyncCount ?? 0}</strong><span>в очереди</span></div>
			</section>
			<section class="layout">
				<form id="editor" class="card">
					<h2>${editing ? "Редактировать материал" : "Новый материал"}</h2>
					<label>Тип <select name="type"><option value="note">Заметка</option><option value="todo">Задача</option><option value="link">Ссылка</option></select></label>
					<label>Название <input name="title" required value="${escapeAttr(editing?.title ?? "")}" placeholder="Например, идеи для проекта" /></label>
					<label>Теги <input name="tags" value="${escapeAttr(editing?.tags.join(", ") ?? "")}" placeholder="работа, идеи" /></label>
					<label id="url-field">Адрес <input name="url" value="${escapeAttr(editing?.url ?? "")}" placeholder="https://…" /></label>
					<label>Содержание <textarea name="content" required placeholder="Запишите мысль…">${escapeHtml(editing?.content ?? "")}</textarea></label>
					<div class="actions"><button type="submit">${editing ? "Сохранить" : "Добавить"}</button>${editing ? '<button type="button" id="cancel" class="secondary">Отмена</button>' : ""}</div>
				</form>
				<section class="card library"><div class="toolbar"><h2>Материалы</h2><input id="search" placeholder="Поиск" /></div>
					${items.length ? `<ul>${items.map(itemCard).join("")}</ul>` : '<p class="empty">Здесь появятся ваши локальные материалы.</p>'}
				</section>
			</section>
			<section class="card settings"><div><h2>Синхронизация</h2><p>Политика сохранена локально. Подключение Synapse Sync появится после входа в аккаунт.</p></div>
				<label class="toggle"><input id="sync-policy" type="checkbox" ${syncPolicy === "automatic" ? "checked" : ""} /> Автоматически ставить новые материалы в очередь</label>
			</section>
		</main>`;

	const form = document.querySelector<HTMLFormElement>("#editor");
	form?.querySelector<HTMLSelectElement>("[name=type]")?.addEventListener("change", updateUrlVisibility);
	updateUrlVisibility();
	form?.addEventListener("submit", saveItem);
	document.querySelector("#cancel")?.addEventListener("click", () => {
		editingId = undefined;
		render();
	});
	document.querySelector<HTMLInputElement>("#search")?.addEventListener("input", (event) => {
		void refresh((event.target as HTMLInputElement).value);
	});
	document.querySelector("#sync-policy")?.addEventListener("change", async (event) => {
		await window.synapseDesktop.library.updateSettings({
			syncPolicy: (event.target as HTMLInputElement).checked ? "automatic" : "manual",
		});
		await refresh();
	});
	document.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((button) =>
		button.addEventListener("click", () => {
			editingId = button.dataset.edit;
			render();
		})
	);
	document.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) =>
		button.addEventListener("click", async () => {
			if (!confirm("Удалить материал только с этого устройства?")) return;
			await window.synapseDesktop.library.delete(button.dataset.delete!);
			if (editingId === button.dataset.delete) editingId = undefined;
			await refresh();
		})
	);
}

function itemCard(item: LocalItem): string {
	return `<li><article><div><span class="type">${item.type}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content || item.url || "Без содержимого")}</p><small>${item.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ")}</small></div><div class="item-actions"><button data-edit="${item.id}" class="secondary">Изменить</button><button data-delete="${item.id}" class="danger">Удалить</button></div></article></li>`;
}

async function saveItem(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	const form = event.currentTarget as HTMLFormElement;
	const values = new FormData(form);
	const type = values.get("type") as ItemType;
	await window.synapseDesktop.library.save({
		content: String(values.get("content") ?? ""),
		id: editingId ?? "",
		tags: String(values.get("tags") ?? "").split(","),
		title: String(values.get("title") ?? ""),
		type,
		url: type === "link" ? String(values.get("url") ?? "") : undefined,
	});
	editingId = undefined;
	await refresh();
}

function updateUrlVisibility(): void {
	const select = document.querySelector<HTMLSelectElement>("[name=type]");
	const field = document.querySelector<HTMLElement>("#url-field");
	if (select && field) field.hidden = select.value !== "link";
}

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"]/g,
		(char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char
	);
}
function escapeAttr(value: string): string {
	return escapeHtml(value);
}
function formatBytes(bytes: number): string {
	return bytes < 1024 ? `${bytes} Б` : `${(bytes / 1024).toFixed(1)} КБ`;
}

void refresh();

export {};
