import sharp from "sharp";

export async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
	const { width, height } = await sharp(buffer, { animated: false }).metadata();
	if (!width || !height) throw new Error("Image dimensions are unavailable");
	return { width, height };
}

export async function generateThumbnail(buffer: Buffer): Promise<string> {
	return (
		await sharp(buffer, { animated: false })
			.resize({ width: 20, fit: "inside", withoutEnlargement: true })
			.jpeg({ quality: 40 })
			.toBuffer()
	).toString("base64");
}
