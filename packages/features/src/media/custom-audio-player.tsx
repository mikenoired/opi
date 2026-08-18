import { useI18n } from "@synapse/i18n";
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const defaultAccentPalette = ["#d9906e", "#875eb8", "#457fa9"] as const;
const audioVolumeStorageKey = "synapse.audio-volume";
const defaultAudioVolume = 25;

export interface CustomAudioPlayerProps {
	autoPlay?: boolean;
	coverUrl?: string;
	isMusic?: boolean;
	metadata?: {
		album?: string;
		artist?: string;
		bitrateKbps?: number;
		channels?: number;
		durationSec?: number;
		genre?: string[];
		mimeType?: string;
		sampleRateHz?: number;
		title?: string;
		year?: number;
	};
	src: string;
	title: string;
}

/** Chooses a native recording control or an immersive music now-playing surface. */
export function CustomAudioPlayer({ isMusic = false, ...props }: CustomAudioPlayerProps) {
	return isMusic ? <MusicPlayer {...props} /> : <RecordingPlayer {...props} />;
}

function RecordingPlayer({ autoPlay = false, metadata, src, title }: CustomAudioPlayerProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const isApplyingInitialVolume = useRef(true);
	const [initialVolume] = useState(readStoredAudioVolume);
	const duration = metadata?.durationSec ? formatTime(metadata.durationSec) : undefined;
	const details = [duration, metadata?.bitrateKbps ? `${metadata.bitrateKbps} kbps` : undefined]
		.filter(Boolean)
		.join(" · ");
	useLayoutEffect(() => {
		if (audioRef.current) audioRef.current.volume = initialVolume / 100;
		isApplyingInitialVolume.current = false;
	}, [initialVolume]);
	useEffect(() => {
		if (!autoPlay) return;
		void audioRef.current?.play().catch(() => undefined);
	}, [autoPlay, src]);
	return (
		<section className="w-full max-w-2xl rounded-2xl border bg-card p-5 shadow-xl">
			<MarqueeText className="text-base font-semibold text-foreground" text={title} />
			{details && <MarqueeText className="mt-1 text-xs text-muted-foreground" text={details} />}
			<audio
				className="mt-4 w-full"
				controls
				onVolumeChange={(event) => {
					if (!isApplyingInitialVolume.current) saveAudioVolume(event.currentTarget.volume * 100);
				}}
				preload="metadata"
				ref={audioRef}
				src={src}
			/>
		</section>
	);
}

function MusicPlayer({ autoPlay = false, coverUrl, metadata, src, title }: CustomAudioPlayerProps) {
	const { t } = useI18n();
	const audioRef = useRef<HTMLAudioElement>(null);
	const volumeId = useId();
	const [initialVolume] = useState(readStoredAudioVolume);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(metadata?.durationSec ?? 0);
	const [volume, setVolume] = useState(initialVolume);
	const [muted, setMuted] = useState(initialVolume === 0);
	const [seeking, setSeeking] = useState(false);
	const seekingRef = useRef(false);
	const seekTimeRef = useRef(0);
	const [seekTime, setSeekTime] = useState(0);
	const [error, setError] = useState<string>();
	const displayTitle = metadata?.title || title;
	const metadataLine = useMemo(
		() =>
			[
				metadata?.year ? String(metadata.year) : undefined,
				metadata?.genre?.join(", "),
				formatAudioFormat(metadata?.mimeType),
				metadata?.bitrateKbps ? `${metadata.bitrateKbps} kbps` : undefined,
				formatSampleRate(metadata?.sampleRateHz),
				formatChannels(metadata?.channels),
			]
				.filter(Boolean)
				.join("  ·  "),
		[
			metadata?.bitrateKbps,
			metadata?.channels,
			metadata?.genre,
			metadata?.mimeType,
			metadata?.sampleRateHz,
			metadata?.year,
		]
	);

	useLayoutEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.volume = initialVolume / 100;
		audio.muted = initialVolume === 0;
	}, [initialVolume]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		const updateDuration = () => {
			if (Number.isFinite(audio.duration)) setDuration(audio.duration);
		};
		const onTimeUpdate = () => {
			if (!seekingRef.current) setCurrentTime(audio.currentTime);
		};
		const onError = () => {
			const code = audio.error?.code;
			setError(
				code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
					? t("audio.playbackUnsupported")
					: t("audio.playbackUnavailable")
			);
		};
		const onPlay = () => setIsPlaying(true);
		const onPause = () => setIsPlaying(false);
		audio.addEventListener("canplay", updateDuration);
		audio.addEventListener("durationchange", updateDuration);
		audio.addEventListener("timeupdate", onTimeUpdate);
		audio.addEventListener("error", onError);
		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		return () => {
			audio.pause();
			audio.removeEventListener("canplay", updateDuration);
			audio.removeEventListener("durationchange", updateDuration);
			audio.removeEventListener("timeupdate", onTimeUpdate);
			audio.removeEventListener("error", onError);
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
		};
	}, [src, t]);

	useEffect(() => {
		setIsPlaying(false);
		setCurrentTime(0);
		setSeekTime(0);
		seekTimeRef.current = 0;
		setDuration(metadata?.durationSec ?? 0);
		setError(undefined);
	}, [metadata?.durationSec, src]);

	useEffect(() => {
		if (!autoPlay || !src) return;
		void audioRef.current?.play().catch(() => setIsPlaying(false));
	}, [autoPlay, src]);

	useEffect(() => {
		if (!("mediaSession" in navigator)) return;
		navigator.mediaSession.metadata = new MediaMetadata({
			album: metadata?.album,
			artist: metadata?.artist,
			artwork: coverUrl ? [{ src: coverUrl }] : undefined,
			title: displayTitle,
		});
		return () => {
			if (navigator.mediaSession.metadata?.title === displayTitle) navigator.mediaSession.metadata = null;
		};
	}, [coverUrl, displayTitle, metadata?.album, metadata?.artist]);

	const safeDuration = Number.isFinite(duration) ? duration : 0;
	const displayTime = seeking ? seekTime : currentTime;
	const togglePlayback = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused)
			void audio.play().catch(() => {
				if (audio.error) return;
				setError(t("audio.playbackFailed"));
			});
		else audio.pause();
	};
	const commitSeek = (time: number) => {
		const audio = audioRef.current;
		if (!audio || !Number.isFinite(time)) return;
		const next = Math.min(Math.max(time, 0), safeDuration);
		audio.currentTime = next;
		setCurrentTime(next);
		setSeekTime(next);
		seekTimeRef.current = next;
	};
	const beginSeek = () => {
		seekingRef.current = true;
		setSeeking(true);
		setSeekTime(currentTime);
		seekTimeRef.current = currentTime;
	};
	const finishSeek = (time: number) => {
		commitSeek(time);
		seekingRef.current = false;
		setSeeking(false);
	};
	const seekBy = (seconds: number) => commitSeek(currentTime + seconds);
	const updateSeekTime = (time: number) => {
		const next = Math.min(Math.max(time, 0), safeDuration);
		setSeekTime(next);
		seekTimeRef.current = next;
		if (!seekingRef.current) commitSeek(next);
	};
	const updateVolume = (next: number) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.volume = next / 100;
		audio.muted = next === 0;
		setVolume(next);
		setMuted(next === 0);
		saveAudioVolume(next);
	};
	return (
		<section className="relative w-full max-w-5xl text-white">
			<div className="relative grid min-h-[min(42rem,calc(100vh-8rem))] gap-8 p-5 sm:p-8 md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)] md:items-center md:p-10">
				<div className="mx-auto w-full max-w-[34rem]">
					<div className="aspect-square overflow-hidden rounded-md bg-linear-to-br from-white/30 to-white/5 shadow-2xl">
						{coverUrl ? (
							<img
								alt={t("audio.cover", { title: displayTitle })}
								className="h-full w-full object-cover"
								src={coverUrl}
							/>
						) : (
							<div aria-hidden className="flex h-full items-center justify-center text-8xl text-white/60">
								♪
							</div>
						)}
					</div>
				</div>
				<div className="flex min-w-0 flex-col text-center md:text-left">
					<MarqueeText
						className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
						text={displayTitle}
					/>
					{metadata?.artist && <MarqueeText className="mt-2 text-lg text-white/75" text={metadata.artist} />}
					{metadata?.album && <MarqueeText className="mt-1 text-sm text-white/50" text={metadata.album} />}
					{metadataLine && (
						<MarqueeText className="mt-4 text-xs tracking-wide text-white/45" text={metadataLine} />
					)}

					<audio preload="metadata" ref={audioRef} src={src} />
					<div className="mt-8">
						<PlayerSlider
							label={t("audio.playbackPosition")}
							max={safeDuration}
							min={0}
							onChange={updateSeekTime}
							onPointerCancel={() => finishSeek(seekTimeRef.current)}
							onPointerDown={beginSeek}
							onPointerUp={() => finishSeek(seekTimeRef.current)}
							step={0.1}
							value={Math.min(displayTime, safeDuration)}
							valueTextFallback={(value, max) =>
								t("audio.valueOf", { max: formatTime(max), value: formatTime(value) })
							}
						/>
						<div className="mt-1.5 flex justify-between font-mono text-[11px] text-white/50">
							<span>{formatTime(displayTime)}</span>
							<span>{formatTime(safeDuration)}</span>
						</div>
					</div>
					<div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-4">
						<div className="flex items-center gap-5">
							<button
								aria-label={t("audio.rewind")}
								className="rounded-full p-2.5 text-white/75 transition hover:bg-white/10 hover:text-white"
								onClick={() => seekBy(-15)}
								type="button">
								<RotateCcw className="size-5" />
							</button>
							<button
								aria-label={isPlaying ? t("audio.pause") : t("audio.play")}
								className="inline-flex size-14 items-center justify-center rounded-full bg-white text-slate-900 shadow-xl transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
								onClick={togglePlayback}
								type="button">
								{isPlaying ? (
									<Pause className="size-6 fill-current" />
								) : (
									<Play className="ml-1 size-6 fill-current" />
								)}
							</button>
							<button
								aria-label={t("audio.forward")}
								className="rounded-full p-2.5 text-white/75 transition hover:bg-white/10 hover:text-white"
								onClick={() => seekBy(15)}
								type="button">
								<RotateCw className="size-5" />
							</button>
						</div>
						<div className="flex w-40 items-center gap-2">
							<button
								aria-label={muted ? t("audio.muted") : t("audio.mute")}
								className="rounded-md p-2 text-white/75 transition hover:bg-white/10"
								onClick={() => {
									const audio = audioRef.current;
									if (!audio) return;
									audio.muted = !audio.muted;
									setMuted(audio.muted);
								}}
								type="button">
								{muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
							</button>
							<PlayerSlider
								id={volumeId}
								label={t("audio.volume")}
								max={100}
								min={0}
								value={muted ? 0 : volume}
								valueText={(value) => `${Math.round(value)}%`}
								valueTextFallback={(value, max) =>
									t("audio.valueOf", { max: Math.round(max), value: Math.round(value) })
								}
								onChange={updateVolume}
								className="min-w-0 flex-1"
							/>
						</div>
					</div>
					{error && (
						<p className="mt-5 text-sm text-rose-200" role="alert">
							{error}
						</p>
					)}
				</div>
			</div>
		</section>
	);
}

function PlayerSlider({
	className,
	id,
	label,
	max,
	min = 0,
	onChange,
	onPointerCancel,
	onPointerDown,
	onPointerUp,
	step = 1,
	value,
	valueText,
	valueTextFallback,
}: {
	className?: string;
	id?: string;
	label: string;
	max: number;
	min?: number;
	onChange(value: number): void;
	onPointerCancel?(): void;
	onPointerDown?(): void;
	onPointerUp?(): void;
	step?: number;
	value: number;
	valueText?(value: number): string;
	valueTextFallback(value: number, max: number): string;
}) {
	const boundedValue = Math.min(Math.max(value, min), max);
	return (
		<div className={`player-slider ${className ?? ""}`}>
			<label className="sr-only" htmlFor={id}>
				{label}
			</label>
			<div aria-hidden className="player-slider__track">
				<span className="player-slider__fill" style={{ width: `${percentage(boundedValue, min, max)}%` }} />
			</div>
			<input
				aria-label={label}
				aria-valuetext={valueText?.(boundedValue) ?? valueTextFallback(boundedValue, max)}
				className="player-slider__input"
				id={id}
				max={max}
				min={min}
				onChange={(event) => onChange(Number(event.currentTarget.value))}
				onPointerCancel={onPointerCancel}
				onPointerDown={onPointerDown}
				onPointerUp={onPointerUp}
				step={step}
				type="range"
				value={boundedValue}
			/>
		</div>
	);
}

/** Ambient full-screen field for music: colours are sampled from the cover when possible. */
export function MusicPlayerBackdrop({ coverUrl }: Pick<CustomAudioPlayerProps, "coverUrl">) {
	const palette = useCoverPalette(coverUrl);
	const style = {
		"--music-accent-one": palette[0],
		"--music-accent-two": palette[1],
		"--music-accent-three": palette[2],
	} as CSSProperties;

	return (
		<div
			aria-hidden
			className="music-player-ambient pointer-events-none absolute inset-0 overflow-hidden"
			style={style}>
			{coverUrl && <img alt="" className="music-player-ambient__cover" key={coverUrl} src={coverUrl} />}
			<span className="music-player-ambient__colour music-player-ambient__colour--one" />
			<span className="music-player-ambient__colour music-player-ambient__colour--two" />
			<span className="music-player-ambient__colour music-player-ambient__colour--three" />
			<span className="music-player-ambient__veil" />
		</div>
	);
}

function MarqueeText({ className, text }: { className?: string; text: string }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const animationName = `music-player-marquee-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const [overflows, setOverflows] = useState(false);
	const [travelDuration, setTravelDuration] = useState(10);

	useLayoutEffect(() => {
		const update = () => {
			const container = containerRef.current;
			const label = textRef.current;
			if (!container || !label) return;
			const textWidth = label.getBoundingClientRect().width;
			setOverflows(textWidth > container.clientWidth + 1);
			setTravelDuration(Math.max(7, Math.min(24, textWidth / 28)));
		};
		update();
		const observer = new ResizeObserver(update);
		if (containerRef.current) observer.observe(containerRef.current);
		if (textRef.current) observer.observe(textRef.current);
		return () => observer.disconnect();
	}, [text]);

	const cycleDuration = travelDuration + 5;
	const travelEnd = (travelDuration / cycleDuration) * 100;
	const animationStyle = overflows
		? ({ animation: `${animationName} ${cycleDuration}s linear infinite` } as CSSProperties)
		: undefined;
	return (
		<div
			aria-label={text}
			className={`music-player-marquee ${overflows ? "music-player-marquee--moving" : ""} ${className ?? ""}`}
			ref={containerRef}>
			{overflows && (
				<style>{`@keyframes ${animationName} { 0% { transform: translateX(0); } ${travelEnd}% { transform: translateX(calc(-50% - 1rem)); } 100% { transform: translateX(calc(-50% - 1rem)); } }`}</style>
			)}
			<div
				className={overflows ? "music-player-marquee__track music-player-marquee__track--moving" : ""}
				style={animationStyle}>
				<span className="music-player-marquee__item" ref={textRef}>
					{text}
				</span>
				{overflows && (
					<span aria-hidden className="music-player-marquee__item">
						{text}
					</span>
				)}
			</div>
		</div>
	);
}

function useCoverPalette(coverUrl?: string): readonly [string, string, string] {
	const [palette, setPalette] = useState<readonly [string, string, string]>(defaultAccentPalette);

	useEffect(() => {
		if (!coverUrl) {
			setPalette(defaultAccentPalette);
			return;
		}
		let cancelled = false;
		const image = new Image();
		image.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = 40;
				canvas.height = 40;
				const context = canvas.getContext("2d", { willReadFrequently: true });
				if (!context) return;
				context.drawImage(image, 0, 0, canvas.width, canvas.height);
				const colours = selectAccentColours(context.getImageData(0, 0, canvas.width, canvas.height).data);
				if (!cancelled) setPalette(colours);
			} catch {
				// Remote covers without CORS headers keep the intentionally warm fallback palette.
			}
		};
		image.src = coverUrl;
		return () => {
			cancelled = true;
		};
	}, [coverUrl]);

	return palette;
}

function selectAccentColours(data: Uint8ClampedArray): readonly [string, string, string] {
	const buckets = new Map<
		string,
		{ blue: number; count: number; green: number; red: number; score: number }
	>();
	for (let index = 0; index < data.length; index += 16) {
		const [red, green, blue, alpha] = [data[index], data[index + 1], data[index + 2], data[index + 3]];
		const brightest = Math.max(red, green, blue);
		const darkest = Math.min(red, green, blue);
		const saturation = brightest - darkest;
		if (alpha < 180 || saturation < 28 || brightest < 40 || darkest > 220) continue;
		const key = `${Math.round(red / 32)}-${Math.round(green / 32)}-${Math.round(blue / 32)}`;
		const bucket = buckets.get(key) ?? { blue: 0, count: 0, green: 0, red: 0, score: 0 };
		bucket.red += red;
		bucket.green += green;
		bucket.blue += blue;
		bucket.count += 1;
		bucket.score += saturation * (0.5 + brightest / 510);
		buckets.set(key, bucket);
	}
	const colours = [...buckets.values()]
		.sort((first, second) => second.score - first.score)
		.slice(0, 3)
		.map(
			({ blue, count, green, red }) =>
				`rgb(${Math.round(red / count)} ${Math.round(green / count)} ${Math.round(blue / count)})`
		);
	return [
		colours[0] ?? defaultAccentPalette[0],
		colours[1] ?? defaultAccentPalette[1],
		colours[2] ?? defaultAccentPalette[2],
	];
}

function formatAudioFormat(mimeType?: string): string | undefined {
	if (!mimeType) return undefined;
	const formats: Record<string, string> = {
		"audio/aac": "AAC",
		"audio/flac": "FLAC",
		"audio/m4a": "M4A",
		"audio/mp4": "AAC",
		"audio/mpeg": "MP3",
		"audio/ogg": "Ogg",
		"audio/opus": "Opus",
		"audio/wav": "WAV",
		"audio/webm": "WebM",
		"audio/x-flac": "FLAC",
		"audio/x-wav": "WAV",
	};
	return formats[mimeType.toLowerCase()] ?? mimeType.replace(/^audio\//, "").toUpperCase();
}

function formatChannels(channels?: number): string | undefined {
	if (!channels) return undefined;
	if (channels === 1) return "Mono";
	if (channels === 2) return "Stereo";
	return `${channels} channels`;
}

function formatSampleRate(sampleRateHz?: number): string | undefined {
	if (!sampleRateHz) return undefined;
	return `${Number((sampleRateHz / 1000).toFixed(1))} kHz`;
}

function readStoredAudioVolume(): number {
	if (typeof window === "undefined") return defaultAudioVolume;
	try {
		const stored = window.localStorage.getItem(audioVolumeStorageKey);
		if (stored === null) return defaultAudioVolume;
		return clampAudioVolume(Number(stored));
	} catch {
		return defaultAudioVolume;
	}
}

function saveAudioVolume(value: number): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(audioVolumeStorageKey, String(clampAudioVolume(value)));
	} catch {
		// Playback must still work when persistent storage is unavailable.
	}
}

function clampAudioVolume(value: number): number {
	return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : defaultAudioVolume;
}

function percentage(value: number, min: number, max: number): number {
	if (max <= min) return 0;
	return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function formatTime(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "0:00";
	return `${Math.floor(value / 60)}:${Math.floor(value % 60)
		.toString()
		.padStart(2, "0")}`;
}
