import { useEffect, useRef } from "react";

interface PixelSparklesProps {
	className?: string;
	pixelSize?: number;
	/** Visual intensity of active pixels. Does not change the propagation timing. */
	speed?: number;
	/** How quickly the fire warms up and travels through the grid. */
	fireSpeed?: number;
	density?: number;
}

export function PixelSparkles({
	className = "",
	pixelSize = 5,
	speed = 1,
	fireSpeed = 1,
	density = 1,
}: PixelSparklesProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const context = canvas.getContext("2d");
		if (!context) return;

		let frame = 0;
		let lastTime = 0;
		let elapsed = 0;
		let width = 0;
		let height = 0;
		let pixels = new Float32Array(0);
		let nextPixels = new Float32Array(0);
		let reducedMotion = false;

		const resize = () => {
			const bounds = canvas.getBoundingClientRect();
			const ratio = Math.min(window.devicePixelRatio || 1, 2);
			width = Math.max(1, Math.ceil(bounds.width / pixelSize));
			height = Math.max(1, Math.ceil(bounds.height / pixelSize));
			canvas.width = Math.ceil(bounds.width * ratio);
			canvas.height = Math.ceil(bounds.height * ratio);
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			pixels = new Float32Array(width * height);
			nextPixels = new Float32Array(width * height);
			draw();
		};

		const draw = () => {
			const bounds = canvas.getBoundingClientRect();
			const color = getComputedStyle(canvas).color;
			context.clearRect(0, 0, bounds.width, bounds.height);
			context.imageSmoothingEnabled = false;

			// Keep the pixel matrix present even before the first ember appears.
			context.strokeStyle = color;
			context.lineWidth = 0;
			context.globalAlpha = 0.0;
			context.beginPath();
			for (let x = 0; x <= width; x += 1) {
				context.moveTo(x * pixelSize, 0);
				context.lineTo(x * pixelSize, bounds.height);
			}
			for (let y = 0; y <= height; y += 1) {
				context.moveTo(0, y * pixelSize);
				context.lineTo(bounds.width, y * pixelSize);
			}
			context.stroke();

			context.fillStyle = color;

			for (let y = 0; y < height; y += 1) {
				for (let x = 0; x < width; x += 1) {
					const intensity = pixels[y * width + x];
					if (intensity < 0.025) continue;
					context.globalAlpha = Math.min(0.34, intensity * 0.42 * Math.max(0, speed));
					context.fillRect(
						x * pixelSize,
						y * pixelSize,
						Math.max(1, pixelSize - 1),
						Math.max(1, pixelSize - 1)
					);
				}
			}
			context.globalAlpha = 1;
		};

		const step = (time: number) => {
			if (!lastTime) lastTime = time;
			const delta = Math.min(40, time - lastTime);
			lastTime = time;
			elapsed += delta * Math.max(0, fireSpeed);

			if (!reducedMotion) {
				const warmup = Math.min(1, elapsed / 2800);
				for (let y = 0; y < height; y += 1) {
					const distanceFromBase = height - 1 - y;
					// Blur the advancing front across several cells instead of opening one row at a time.
					const frontPosition = warmup * (height + 5);
					const frontRatio = Math.max(0, Math.min(1, (frontPosition - distanceFromBase + 3) / 6));
					const frontReach = frontRatio * frontRatio * (3 - 2 * frontRatio);
					for (let x = 0; x < width; x += 1) {
						const index = y * width + x;
						const below = y === height - 1 ? 0 : pixels[index + width];
						const left = x === 0 ? 0 : pixels[index - 1];
						const right = x === width - 1 ? 0 : pixels[index + 1];
						const spread = Math.max(below, left * 0.72, right * 0.72);
						const seed = y === height - 1 && Math.random() < 0.16 * density;
						const softIgnition = Math.random() < 0.045 * density * frontReach;
						const rise = spread > 0.05 && Math.random() < 0.62 * frontReach;
						nextPixels[index] = Math.max(
							seed || softIgnition ? 0.8 + Math.random() * 0.2 : 0,
							rise ? spread * (0.72 + Math.random() * 0.2) : pixels[index] * 0.9
						);
					}
				}
				[pixels, nextPixels] = [nextPixels, pixels];
			}

			draw();
			frame = requestAnimationFrame(step);
		};

		const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const updateMotionPreference = () => {
			reducedMotion = motionQuery.matches;
			if (reducedMotion) {
				pixels.fill(0);
				for (let x = 0; x < width; x += 1) {
					if (x % 3 === 0) pixels[(height - 1) * width + x] = 0.8;
				}
				draw();
			}
		};

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		motionQuery.addEventListener("change", updateMotionPreference);
		resize();
		updateMotionPreference();
		frame = requestAnimationFrame(step);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			motionQuery.removeEventListener("change", updateMotionPreference);
		};
	}, [density, fireSpeed, pixelSize, speed]);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden="true"
			className={`pointer-events-none absolute inset-0 size-full ${className}`}
		/>
	);
}
