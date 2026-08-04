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

interface AudioContentMetadata {
	common?: {
		album?: string;
		artist?: string;
		disk?: { no?: number | null };
		genre?: string[];
		lyrics?: string[];
		title?: string;
		track?: { no?: number | null };
		year?: number;
	};
	format?: {
		bitrate?: number;
		duration?: number;
		numberOfChannels?: number;
		sampleRate?: number;
	};
}

interface AudioContentParams {
	audioObjectName: string;
	audioUrl: string;
	bufferLength: number;
	coverDims?: MediaDimensions;
	coverObject?: string;
	coverThumbnailBase64?: string;
	coverUrl?: string;
	fileType: string;
	makeTrack: boolean;
	metadata: AudioContentMetadata | null;
	title?: string | null;
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

export function buildAudioContent({
	audioObjectName,
	audioUrl,
	bufferLength,
	coverDims,
	coverObject,
	coverThumbnailBase64,
	coverUrl,
	fileType,
	makeTrack,
	metadata,
	title,
}: AudioContentParams) {
	return {
		audio: {
			bitrateKbps: metadata?.format?.bitrate ? Math.round(metadata.format.bitrate / 1000) : undefined,
			channels: metadata?.format?.numberOfChannels || undefined,
			durationSec: metadata?.format?.duration ? Math.round(metadata.format.duration) : undefined,
			mimeType: fileType,
			object: audioObjectName,
			sampleRateHz: metadata?.format?.sampleRate || undefined,
			sizeBytes: bufferLength,
			url: audioUrl,
		},
		cover: coverUrl
			? {
					height: coverDims?.height,
					object: coverObject,
					thumbnailBase64: coverThumbnailBase64,
					url: coverUrl,
					width: coverDims?.width,
				}
			: undefined,
		track: {
			album: metadata?.common?.album || undefined,
			artist: metadata?.common?.artist || undefined,
			diskNumber: metadata?.common?.disk?.no || undefined,
			genre: metadata?.common?.genre || undefined,
			isTrack:
				makeTrack ||
				Boolean(
					metadata?.common?.artist ||
					metadata?.common?.album ||
					metadata?.common?.title ||
					metadata?.common?.genre?.length
				),
			lyrics: metadata?.common?.lyrics?.join("\n") || undefined,
			title: metadata?.common?.title || title || undefined,
			trackNumber: metadata?.common?.track?.no || undefined,
			year: metadata?.common?.year || undefined,
		},
	};
}
