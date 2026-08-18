import { Button, InputField } from "@monolyth/ui/components";
import { Clock, ExternalLink, Globe, X } from "lucide-react";

export interface LinkPreviewData {
	description?: string;
	metadata: {
		author?: string;
		contentBlocks: number;
		favicon?: string;
		image?: string;
		publishedTime?: string;
		siteName?: string;
	};
	rawText?: string;
	title: string;
	url: string;
}

export interface LinkPreviewProps {
	content: string;
	parsedLinkData: LinkPreviewData | null;
	linkParsing: boolean;
	isLoading: boolean;
	onContentChange: (content: string) => void;
	onParseLink: (url: string) => void;
	onClearParsedData: () => void;
}

export function LinkPreview({
	content,
	parsedLinkData,
	linkParsing,
	isLoading,
	onContentChange,
	onParseLink,
	onClearParsedData,
}: LinkPreviewProps) {
	return (
		<div className="space-y-2">
			<div className="space-y-4">
				<div className="flex gap-2">
					<InputField
						id="content"
						label="URL"
						labelHidden
						type="url"
						placeholder="https://example.com"
						value={content}
						onChange={onContentChange}
						required
						disabled={isLoading || linkParsing}
					/>
					<Button
						type="button"
						onClick={() => onParseLink(content)}
						disabled={!content.trim() || linkParsing || isLoading}
						size="sm"
						className="min-w-24">
						{linkParsing ? (
							<Clock className="h-4 w-4 animate-spin" />
						) : (
							<>
								<Globe className="mr-1 h-4 w-4" />
								Parse
							</>
						)}
					</Button>
				</div>

				{parsedLinkData && (
					<div className="space-y-3 border bg-muted/20 p-4">
						<div className="flex items-start gap-3">
							{parsedLinkData.metadata.favicon && (
								<img
									src={parsedLinkData.metadata.favicon}
									alt=""
									className="mt-1 h-4 w-4 shrink-0"
									onError={(e) => {
										e.currentTarget.style.display = "none";
									}}
								/>
							)}
							<div className="min-w-0 flex-1">
								<h3 className="mb-1 text-sm leading-tight font-medium">{parsedLinkData.title}</h3>
								{parsedLinkData.description && (
									<p className="line-clamp-2 text-xs text-muted-foreground">{parsedLinkData.description}</p>
								)}
								<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
									{parsedLinkData.metadata.siteName && <span>{parsedLinkData.metadata.siteName}</span>}
									{parsedLinkData.metadata.author && (
										<span>
											• by
											{parsedLinkData.metadata.author}
										</span>
									)}
									{parsedLinkData.metadata.publishedTime && (
										<span>•{new Date(parsedLinkData.metadata.publishedTime).toLocaleDateString()}</span>
									)}
									<span>•{parsedLinkData.metadata.contentBlocks} blocks</span>
								</div>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={onClearParsedData}
								className="h-auto p-1">
								<X className="h-3 w-3" />
							</Button>
						</div>

						{parsedLinkData.metadata.image && (
							<div className="relative">
								<img
									src={parsedLinkData.metadata.image}
									alt=""
									className="h-32 w-full rounded border object-cover"
									onError={(e) => {
										e.currentTarget.style.display = "none";
									}}
								/>
							</div>
						)}

						{parsedLinkData.rawText && (
							<div className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground">
								<div className="mb-1 font-medium">Parsed content:</div>
								<p className="line-clamp-3">
									{parsedLinkData.rawText.substring(0, 200)}
									{parsedLinkData.rawText.length > 200 ? "..." : ""}
								</p>
							</div>
						)}

						<div className="flex items-center gap-2 border-t pt-2">
							<ExternalLink className="h-3 w-3 text-muted-foreground" />
							<span className="truncate font-mono text-xs text-muted-foreground">{content}</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
