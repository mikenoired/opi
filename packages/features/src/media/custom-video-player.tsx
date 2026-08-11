import type { ChangeEvent, TouchEvent } from "react";
import { useEffect, useRef, useState } from "react";

export interface CustomVideoPlayerProps {
	src: string;
	poster?: string;
	autoPlay?: boolean;
	className?: string;
}

export function CustomVideoPlayer({ src, poster, autoPlay = false, className = "" }: CustomVideoPlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [buffered, setBuffered] = useState(0);
	const [isSeeking, setIsSeeking] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const animationFrameRef = useRef<number | null>(null);
	const sliderRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setIsMobile(window.innerWidth < 768);
	}, []);

	const togglePlay = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) {
			video.play();
		} else {
			video.pause();
		}
	};

	const handleLoadedMetadata = () => {
		const video = videoRef.current;
		if (!video) return;
		setDuration(video.duration);
	};

	const handleProgress = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.buffered.length > 0) {
			setBuffered(video.buffered.end(video.buffered.length - 1));
		}
	};

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const onPlay = () => setIsPlaying(true);
		const onPause = () => setIsPlaying(false);
		video.addEventListener("play", onPlay);
		video.addEventListener("pause", onPause);
		return () => {
			video.removeEventListener("play", onPlay);
			video.removeEventListener("pause", onPause);
		};
	}, []);

	useEffect(() => {
		setCurrentTime(0);
		setDuration(0);
		setBuffered(0);
		setIsSeeking(false);
		setIsPlaying(false);
	}, [src]);

	useEffect(() => {
		if (!autoPlay) return;

		const video = videoRef.current;
		if (!video) return;

		const playVideo = () => {
			if (!video.paused || video.currentTime > 0) return;

			video.play().catch(() => {
				setIsPlaying(false);
			});
		};

		if (video.readyState >= 1) {
			playVideo();
			return;
		}

		video.addEventListener("loadedmetadata", playVideo, { once: true });

		return () => {
			video.removeEventListener("loadedmetadata", playVideo);
		};
	}, [autoPlay, src]);

	useEffect(() => {
		const video = videoRef.current;
		const slider = sliderRef.current;
		if (!video || !slider || !isPlaying || isSeeking) {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
			return;
		}
		const update = () => {
			slider.value = String(video.currentTime);
			animationFrameRef.current = requestAnimationFrame(update);
		};
		animationFrameRef.current = requestAnimationFrame(update);
		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
		};
	}, [isPlaying, isSeeking]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const onTimeUpdate = () => {
			setCurrentTime(video.currentTime);
		};
		video.addEventListener("timeupdate", onTimeUpdate);
		return () => {
			video.removeEventListener("timeupdate", onTimeUpdate);
		};
	}, []);

	const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
		const video = videoRef.current;
		if (!video) return;
		const time = Number.parseFloat(e.target.value);
		setCurrentTime(time);
		video.currentTime = time;
	};

	let touchStartX = 0;
	let touchCurrentX = 0;
	const handleTouchStart = (e: TouchEvent) => {
		touchStartX = e.touches[0].clientX;
	};
	const handleTouchMove = (e: TouchEvent) => {
		touchCurrentX = e.touches[0].clientX;
	};
	const handleTouchEnd = () => {
		const diff = touchCurrentX - touchStartX;
		if (Math.abs(diff) > 40) {
			const video = videoRef.current;
			if (!video) return;
			if (diff > 0) {
				video.currentTime = Math.max(0, video.currentTime - 10);
			} else {
				video.currentTime = Math.min(duration, video.currentTime + 10);
			}
		}
	};

	const formatTime = (t: number) => {
		const m = Math.floor(t / 60);
		const s = Math.floor(t % 60);
		return `${m}:${s.toString().padStart(2, "0")}`;
	};

	return (
		<div
			className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-black ${className}`}>
			<video
				ref={videoRef}
				src={src}
				poster={poster}
				autoPlay={autoPlay}
				onLoadedMetadata={handleLoadedMetadata}
				onProgress={handleProgress}
				onClick={togglePlay}
				onTouchStart={isMobile ? handleTouchStart : undefined}
				onTouchMove={isMobile ? handleTouchMove : undefined}
				onTouchEnd={isMobile ? handleTouchEnd : undefined}
				className="h-full w-full cursor-pointer object-contain"
				playsInline
				controls={false}
			/>
			<div className="absolute right-0 bottom-0 left-0 flex flex-col gap-1 bg-linear-to-t from-black/70 to-transparent p-3">
				<div className="group relative flex h-2 w-full items-center">
					<div className="absolute top-0 left-0 h-2 w-full rounded bg-white/30" />
					<div
						className="absolute top-0 left-0 h-2 rounded bg-white/60"
						style={{ width: `${(buffered / duration) * 100 || 0}%` }}
					/>
					<input
						ref={sliderRef}
						type="range"
						min={0}
						max={duration || 0}
						step={0.1}
						defaultValue={0}
						onChange={handleSeek}
						className="z-10 h-2 w-full cursor-pointer appearance-none bg-transparent"
						style={{
							background: "none",
						}}
						onMouseDown={() => setIsSeeking(true)}
						onMouseUp={() => setIsSeeking(false)}
					/>
				</div>
				<div className="mt-1 flex w-full items-center justify-between">
					<button
						onClick={togglePlay}
						className="rounded bg-black/40 p-1 text-white transition hover:bg-white/20"
						aria-label={isPlaying ? "Pause" : "Play"}>
						{isPlaying ? (
							<svg width="24" height="24" fill="none" viewBox="0 0 24 24">
								<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
								<rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
							</svg>
						) : (
							<svg width="24" height="24" fill="none" viewBox="0 0 24 24">
								<path d="M7 6v12l10-6-10-6z" fill="currentColor" />
							</svg>
						)}
					</button>
					<span className="font-mono text-xs text-white/80 select-none">
						{formatTime(currentTime)} /{formatTime(duration)}
					</span>
				</div>
			</div>
		</div>
	);
}
