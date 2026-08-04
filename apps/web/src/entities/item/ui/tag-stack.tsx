import { parseMediaJson } from "@synapse/core";
import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { FileText, LinkIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { getPresignedMediaUrl } from "@/shared/lib/image-utils";
import Image from "@/shared/router/image";

function ensureDataUri(base64: string): string {
	if (!base64) return "";
	if (base64.startsWith("data:")) return base64;
	return `data:image/jpeg;base64,${base64}`;
}

interface TagStackProps {
	items: Content[];
}

function TagPreview({ item }: { item: Content }) {
	const [imgSrc, setImgSrc] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [errored, setErrored] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const loadImages = () => {
			setLoaded(false);
			setErrored(false);
			setImgSrc(null);

			const media = item.type === "media" ? parseMediaJson(item.content)?.media : null;
			if (media?.url) {
				const url = getPresignedMediaUrl(media.url);
				if (cancelled) return;

				setImgSrc(url || null);
			}
		};

		loadImages();

		return () => {
			cancelled = true;
		};
	}, [item.type, item.content]);

	if (item.type === "media") {
		const media = parseMediaJson(item.content)?.media;
		const blurThumb = media?.thumbnailBase64 || "";
		const isVideo = media?.type === "video";

		return (
			<div className="relative h-full w-full overflow-hidden bg-muted" style={{ aspectRatio: "1 / 1" }}>
				{blurThumb && (
					<Image
						src={ensureDataUri(blurThumb)}
						alt="blur preview"
						className="absolute inset-0 z-0 h-full w-full scale-105 object-cover blur-lg transition-opacity duration-200 ease-in-out"
						style={{ opacity: loaded && !errored ? 0 : 1 }}
						draggable={false}
						fill
						sizes="200px"
					/>
				)}
				{imgSrc && !errored && (
					<Image
						src={imgSrc}
						alt={item.title || (isVideo ? "Video" : "Image")}
						className="relative z-10 h-full w-full object-cover transition-opacity duration-200 ease-in-out"
						style={{ opacity: loaded ? 1 : 0 }}
						onLoad={() => setLoaded(true)}
						onError={() => {
							setErrored(true);
							setLoaded(true);
						}}
						draggable={false}
						fill
						unoptimized
						sizes="200px"
					/>
				)}
				{isVideo && (
					<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
						<svg
							width="32"
							height="32"
							viewBox="0 0 64 64"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							className="h-8 w-8 drop-shadow-lg">
							<path
								d="M20 16C20 13.7909 22.2386 12.5532 24.0711 13.7574L50.1421 31.7574C51.8579 32.8921 51.8579 35.1079 50.1421 36.2426L24.0711 54.2426C22.2386 55.4468 20 54.2091 20 52V16Z"
								fill="white"
								fillOpacity="0.8"
							/>
						</svg>
					</div>
				)}
				<div className="pointer-events-none absolute inset-0 z-20 bg-linear-to-t from-black/25 via-transparent to-white/10 dark:from-black/45 dark:to-white/5" />
				{(!imgSrc || errored) && (
					<div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground">
						<FileText className="h-8 w-8 opacity-60" />
					</div>
				)}
			</div>
		);
	}

	if (item.type === "note" && item.title) {
		let preview = "";
		try {
			preview = (JSON.parse(item.content as string)?.blocks?.[0]?.data?.text as string) || "";
		} catch {
			preview = "";
		}
		return (
			<div className="h-full bg-card p-4">
				<h3 className="mb-2 line-clamp-2 font-semibold text-card-foreground">{item.title}</h3>
				<p className="line-clamp-3 text-sm text-muted-foreground">{preview}</p>
			</div>
		);
	}

	if (item.type === "link" && item.url) {
		return (
			<div className="flex h-full flex-col items-center justify-center bg-card p-4 text-center">
				<LinkIcon className="mb-2 size-8 text-primary" />
				<p className="line-clamp-2 text-sm font-medium">{item.title || item.url}</p>
				<p className="mt-1 max-w-full truncate text-xs text-muted-foreground">{item.url}</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col items-center justify-center bg-card p-4">
			<FileText className="size-8 text-primary" />
			<p className="mt-2 text-sm">Content</p>
		</div>
	);
}

export function TagStack({ items }: TagStackProps) {
	return (
		<div className="relative aspect-square w-full cursor-pointer">
			{items
				.slice(0, 3)
				.reverse()
				.map((item, index) => (
					<div
						key={item.id}
						className={cn(
							"absolute h-full w-full overflow-hidden rounded-lg border border-border/80 bg-card p-0 shadow-md ring-1 ring-black/5 transition-all duration-300 ease-in-out group-hover:border-primary/35 group-hover:shadow-xl dark:border-white/10 dark:ring-white/10",
							index === 0 && "z-30",
							index === 1 &&
								"z-20 translate-x-1.5 -translate-y-3 rotate-0 group-hover:translate-x-4 group-hover:-translate-y-4 group-hover:rotate-3",
							index === 2 &&
								"z-10 -translate-x-1.5 translate-y-3 -rotate-2 group-hover:-translate-x-4 group-hover:translate-y-4 group-hover:-rotate-3"
						)}>
						<TagPreview item={item} />
					</div>
				))}
		</div>
	);
}
