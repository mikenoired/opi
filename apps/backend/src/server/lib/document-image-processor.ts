import sharp from "sharp";

import { bucketName, getPublicUrl, minioClient } from "../../storage/minio";

export interface DocumentImage {
	id: string;
	url: string;
	base64?: string;
	width?: number;
	height?: number;
	size?: number;
}

export interface ProcessedImage extends DocumentImage {
	minioUrl?: string;
	thumbnailBase64?: string;
}

/**
 * Загружает изображения документа в MinIO
 */
export async function uploadDocumentImagesToMinio(
	images: DocumentImage[],
	userId: string,
	documentId: string
): Promise<ProcessedImage[]> {
	const processedImages: ProcessedImage[] = [];

	for (const image of images) {
		try {
			// Декодируем base64 изображение
			const base64Data = image.url.replace(/^data:image\/[a-z]+;base64,/, "");
			const imageBuffer = Buffer.from(base64Data, "base64");

			// Генерируем уникальное имя файла
			const fileName = `documents/${userId}/${documentId}/${image.id}.png`;

			// Загружаем в MinIO
			await minioClient.putObject(bucketName, fileName, imageBuffer, imageBuffer.length, {
				"Content-Type": "image/png",
				"Cache-Control": "public, max-age=31536000",
			});

			const minioUrl = getPublicUrl(fileName);

			// Создаем миниатюру для превью
			const thumbnailBase64 = await createThumbnail(imageBuffer);

			processedImages.push({
				...image,
				minioUrl,
				thumbnailBase64,
			});
		} catch {
			processedImages.push(image);
		}
	}

	return processedImages;
}

/**
 * Обрабатывает изображения документа (ресайз для миниатюр)
 */
export async function processDocumentImages(
	images: DocumentImage[],
	options: {
		maxThumbnailSize?: number;
		thumbnailWidth?: number;
		thumbnailHeight?: number;
	} = {}
): Promise<ProcessedImage[]> {
	const {
		maxThumbnailSize = 100000, // 100KB
		thumbnailWidth = 300,
		thumbnailHeight = 200,
	} = options;

	const processedImages: ProcessedImage[] = [];

	for (const image of images) {
		try {
			// Декодируем base64 изображение
			const base64Data = image.url.replace(/^data:image\/[a-z]+;base64,/, "");
			const imageBuffer = Buffer.from(base64Data, "base64");

			// Получаем метаданные изображения
			const metadata = await sharp(imageBuffer).metadata();

			// Создаем миниатюру только если изображение больше лимита
			let thumbnailBase64: string | undefined;
			if (imageBuffer.length > maxThumbnailSize) {
				const thumbnailBuffer = await sharp(imageBuffer)
					.resize(thumbnailWidth, thumbnailHeight, {
						fit: "inside",
						withoutEnlargement: true,
					})
					.png()
					.toBuffer();

				thumbnailBase64 = `data:image/png;base64,${thumbnailBuffer.toString("base64")}`;
			} else {
				// Если изображение маленькое, используем его как миниатюру
				thumbnailBase64 = image.url;
			}

			processedImages.push({
				...image,
				width: metadata.width,
				height: metadata.height,
				size: imageBuffer.length,
				thumbnailBase64,
			});
		} catch {
			processedImages.push(image);
		}
	}

	return processedImages;
}

/**
 * Создает миниатюру изображения
 */
async function createThumbnail(imageBuffer: Buffer): Promise<string> {
	try {
		const thumbnailBuffer = await sharp(imageBuffer)
			.resize(200, 150, {
				fit: "inside",
				withoutEnlargement: true,
			})
			.jpeg({ quality: 80 })
			.toBuffer();

		return `data:image/jpeg;base64,${thumbnailBuffer.toString("base64")}`;
	} catch {
		return "";
	}
}

/**
 * Заменяет пути к изображениям в HTML на MinIO URLs
 */
export function replaceImagePathsInHtml(html: string, processedImages: ProcessedImage[]): string {
	let updatedHtml = html;

	for (const image of processedImages) {
		if (image.minioUrl) {
			// Заменяем data: URLs на MinIO URLs
			const dataUrlPattern = new RegExp(`data:image/[^;]+;base64,[A-Za-z0-9+/=]+`, "g");

			// Находим все data: URLs в HTML и заменяем их на MinIO URL
			updatedHtml = updatedHtml.replace(dataUrlPattern, (match: string): string => {
				// Проверяем, соответствует ли этот data: URL нашему изображению
				if (image.url === match) {
					return image.minioUrl ?? "";
				}
				return match;
			});
		}
	}

	return updatedHtml;
}

/**
 * Извлекает изображения из HTML контента
 */
export function extractImagesFromHtml(html: string): string[] {
	const imageUrls: string[] = [];
	const imgRegex = /<img[^>]+src="([^"]+)"/g;
	let match;

	while ((match = imgRegex.exec(html)) !== null) {
		imageUrls.push(match[1]);
	}

	return imageUrls;
}

/**
 * Валидирует изображение (проверяет размер и формат)
 */
export async function validateImage(imageBuffer: Buffer): Promise<{
	isValid: boolean;
	error?: string;
}> {
	// Проверяем размер (максимум 10MB)
	const maxSize = 10 * 1024 * 1024;
	if (imageBuffer.length > maxSize) {
		return {
			isValid: false,
			error: "Image size exceeds 10MB limit",
		};
	}

	// Проверяем, что это валидное изображение
	try {
		await sharp(imageBuffer).metadata();
		return { isValid: true };
	} catch {
		return {
			isValid: false,
			error: "Invalid image format",
		};
	}
}
