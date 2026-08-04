interface MediaDimensions {
	height: number;
	width: number;
}

interface ImageMediaContentParams {
	objectName: string;
	publicUrl: string;
	imageDimensions?: MediaDimensions;
	thumbnailBase64: string;
}

interface VideoMediaContentParams {
	objectName: string;
	publicUrl: string;
	thumbnailUrl: string;
	thumbnailBase64: string;
	videoDimensions?: MediaDimensions;
}

export function buildImageMediaContent({
	objectName,
	publicUrl,
	imageDimensions,
	thumbnailBase64,
}: ImageMediaContentParams) {
	return {
		media: {
			height: imageDimensions?.height,
			object: objectName,
			thumbnailBase64,
			type: "image" as const,
			url: publicUrl,
			width: imageDimensions?.width,
		},
	};
}

export function buildVideoMediaContent({
	objectName,
	publicUrl,
	thumbnailBase64,
	thumbnailUrl,
	videoDimensions,
}: VideoMediaContentParams) {
	return {
		media: {
			height: videoDimensions?.height,
			object: objectName,
			thumbnailBase64,
			thumbnailUrl,
			type: "video" as const,
			url: publicUrl,
			width: videoDimensions?.width,
		},
	};
}
