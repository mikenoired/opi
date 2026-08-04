import { ContentfulStatusCode } from "hono/utils/http-status";
import z from "zod";

export type ApiErrorCode =
	| "BAD_REQUEST"
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "NOT_FOUND"
	| "CONFLICT"
	| "TOO_MANY_REQUESTS"
	| "INTERNAL_SERVER_ERROR";

export const STATUS_CODES = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	TOO_MANY_REQUESTS: 429,
	INTERNAL_SERVER_ERROR: 500,
} satisfies Record<ApiErrorCode, ContentfulStatusCode>;

export class ApiError extends Error {
	readonly code: ApiErrorCode;
	readonly treeifyErrors?: ReturnType<typeof z.treeifyError>;
	readonly status: number;

	constructor(options: {
		code: ApiErrorCode;
		message: string;
		treeifyErrors?: ReturnType<typeof z.treeifyError>;
	});
	constructor(code: ApiErrorCode, message: string, treeifyErrors?: ReturnType<typeof z.treeifyError>);
	constructor(
		codeOrOptions:
			| ApiErrorCode
			| { code: ApiErrorCode; message: string; treeifyErrors?: ReturnType<typeof z.treeifyError> },
		message?: string,
		treeifyErrors?: ReturnType<typeof z.treeifyError>
	) {
		const options =
			typeof codeOrOptions === "string"
				? { code: codeOrOptions, message: message || "Request failed", treeifyErrors }
				: codeOrOptions;
		super(options.message);
		this.name = "ApiError";
		this.code = options.code;
		this.treeifyErrors = options.treeifyErrors;
		this.status = STATUS_CODES[options.code];
	}
}
