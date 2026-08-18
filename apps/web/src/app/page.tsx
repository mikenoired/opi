import { Button } from "@monolyth/ui/components";
import type { ReactNode } from "react";
import { useState } from "react";

import { AuthDialog } from "@/features/auth-dialog/ui/auth-dialog";
import { detectDesktopPlatform, getDesktopReleases } from "@/shared/config/desktop-releases";
import { useAuth } from "@/shared/lib/auth-context";
import Image from "@/shared/router/image";

interface FeatureHighlightProps {
	title: string;
	description: string;
	icon: ReactNode;
}

const features: FeatureHighlightProps[] = [
	{
		title: "Заметки и документы",
		description: "Храните мысли, статьи и файлы рядом — без переключения между сервисами.",
		icon: (
			<svg className="size-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
		),
	},
	{
		title: "Связи через теги",
		description: "Собирайте материалы по темам и находите связанные идеи в несколько кликов.",
		icon: (
			<svg className="size-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
				/>
			</svg>
		),
	},
	{
		title: "Медиа под рукой",
		description: "Сохраняйте изображения, видео и аудио с быстрым просмотром прямо в архиве.",
		icon: (
			<svg className="size-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
				/>
			</svg>
		),
	},
];

function FeatureHighlight({ title, description, icon }: FeatureHighlightProps) {
	return (
		<div className="group rounded-xl border bg-card p-6 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
			<div className="mb-4 w-fit rounded-lg bg-primary/10 p-3">{icon}</div>
			<h3 className="mb-2 text-xl font-semibold">{title}</h3>
			<p className="leading-relaxed text-muted-foreground">{description}</p>
		</div>
	);
}

export default function HomePage() {
	const [authDialogOpen, setAuthDialogOpen] = useState(false);
	const [authMode, setAuthMode] = useState<"login" | "register">("login");
	const { user, loading } = useAuth();
	const recommendedPlatform = detectDesktopPlatform();
	const desktopReleases = getDesktopReleases();

	const handleAuthClick = (mode: "login" | "register") => {
		setAuthMode(mode);
		setAuthDialogOpen(true);
	};

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
			</div>
		);
	}

	if (user) return null;

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<header className="absolute top-0 right-0 left-0 z-50 px-6 py-4">
				<div className="mx-auto flex max-w-7xl items-center justify-between">
					<div className="flex items-center space-x-3">
						<div className="rounded-xl bg-primary/10 p-2 backdrop-blur-sm">
							<Image src="/logo.svg" alt="" width={30} height={28} className="invert dark:invert-0" />
						</div>
						<Image
							src="/logo-lettering.svg"
							alt="Monolyth"
							width={65}
							height={13}
							className="invert dark:invert-0"
						/>
					</div>
				</div>
			</header>

			{/* Hero Section */}
			<main className="flex min-h-[88svh] flex-col items-center justify-center px-4 pt-24">
				<div className="mx-auto max-w-4xl space-y-10 text-center">
					{/* Logo and Title */}
					<div className="space-y-8">
						<div className="flex justify-center">
							<div className="relative rounded-2xl border border-primary/20 bg-linear-to-br from-primary/10 to-primary/5 p-6 backdrop-blur-sm">
								<Image src="/logo.svg" alt="" width={75} height={70} className="invert dark:invert-0" />
							</div>
						</div>

						<div className="space-y-6">
							<p className="text-sm font-medium tracking-[0.2em] text-primary uppercase">Личный архив</p>
							<h1 className="text-4xl leading-tight font-semibold text-balance sm:text-6xl">
								Всё важное — в одном пространстве
							</h1>
							<p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
								Сохраняйте заметки, документы и медиа. Связывайте их тегами и находите нужное без долгих
								поисков.
							</p>
						</div>
					</div>

					{/* CTA Buttons */}
					<div className="flex flex-col justify-center gap-4 sm:flex-row">
						<Button
							size="lg"
							onClick={() => handleAuthClick("login")}
							className="h-12 min-w-40 text-lg font-medium shadow-lg transition-all duration-300 hover:shadow-xl">
							Войти
						</Button>
						<Button
							variant="tertiary"
							size="lg"
							onClick={() => handleAuthClick("register")}
							className="h-12 min-w-40 border-2 text-lg font-medium transition-all duration-300">
							Создать аккаунт
						</Button>
					</div>
				</div>
			</main>

			<section className="px-4 py-20">
				<div className="mx-auto max-w-6xl">
					<div className="mb-16 space-y-4 text-center">
						<div className="flex items-center justify-center gap-4">
							<h2 className="text-3xl font-bold md:text-4xl">Ваши материалы остаются связанными</h2>
						</div>
						<p className="mx-auto max-w-2xl text-lg text-muted-foreground">
							Monolyth объединяет разные форматы в один понятный рабочий процесс.
						</p>
					</div>

					<div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
						{features.map((feature) => (
							<FeatureHighlight key={feature.title} {...feature} />
						))}
					</div>
				</div>
			</section>

			<section className="border-y bg-muted/35 px-4 py-20">
				<div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
					<div className="space-y-4">
						<p className="text-sm font-medium tracking-[0.2em] text-primary uppercase">Monolyth Desktop</p>
						<h2 className="text-3xl font-bold text-balance md:text-4xl">Ваш архив — на вашем устройстве</h2>
						<p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
							Локальная библиотека работает независимо от браузера. Синхронизация доступна на платных планах,
							когда выйдет первая подписанная сборка.
						</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-3">
						{desktopReleases.map((release) => {
							const recommended = release.platform === recommendedPlatform;
							return (
								<div key={release.platform} className="rounded-xl border bg-background p-5 shadow-sm">
									<p className="text-lg font-semibold">{release.label}</p>
									<p className="mt-1 min-h-10 text-sm text-muted-foreground">
										{recommended ? "Рекомендуется для этого устройства" : "Установщик для этой платформы"}
									</p>
									{release.url ? (
										<a
											className="mt-4 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
											href={release.url}>
											Скачать{release.version ? ` v${release.version}` : ""}
										</a>
									) : (
										<span className="mt-4 inline-block text-sm text-muted-foreground">Скоро выйдет</span>
									)}
								</div>
							);
						})}
					</div>
				</div>
				<div className="mx-auto mt-8 max-w-6xl rounded-xl border border-dashed bg-background/60 p-5">
					<p className="font-medium">iOS и Android — в разработке</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Мобильные приложения пока не доступны для скачивания.
					</p>
				</div>
			</section>

			{/* CTA Section */}
			<section className="bg-linear-to-r from-primary/5 to-primary/10 px-4 py-20">
				<div className="mx-auto max-w-4xl space-y-8 text-center">
					<h2 className="text-3xl font-bold md:text-4xl">Начните с первого материала</h2>
					<p className="mx-auto max-w-2xl text-lg text-muted-foreground">
						Создайте заметку или загрузите файл — структуру можно выстроить позже.
					</p>
					<div className="flex flex-col justify-center gap-4 sm:flex-row">
						<Button
							size="lg"
							onClick={() => handleAuthClick("register")}
							className="h-12 min-w-48 text-lg font-medium shadow-lg transition-all duration-300 hover:shadow-xl">
							Создать аккаунт
						</Button>
					</div>
				</div>
			</section>

			<AuthDialog
				open={authDialogOpen}
				onOpenChange={setAuthDialogOpen}
				mode={authMode}
				onModeChange={setAuthMode}
			/>
		</div>
	);
}
