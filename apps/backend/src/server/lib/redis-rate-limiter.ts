import Redis from "ioredis";

const redis = new Redis({
	host: process.env.REDIS_HOST || "localhost",
	port: Number.parseInt(process.env.REDIS_PORT || "6379"),
	password: process.env.REDIS_PASSWORD || undefined,
});

interface RateLimitOptions {
	windowMs: number;
	limit: number;
}

export class RedisRateLimiter {
	private windowMs: number;
	private limit: number;

	constructor(options: RateLimitOptions) {
		this.windowMs = options.windowMs;
		this.limit = options.limit;
	}

	async checkLimit(key: string): Promise<boolean> {
		const now = Date.now();
		const windowStart = now - this.windowMs;
		const redisKey = `rate_limit:${key}`;

		try {
			const pipeline = redis.pipeline();

			pipeline.zremrangebyscore(redisKey, 0, windowStart);
			pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);
			pipeline.zcard(redisKey);
			pipeline.expire(redisKey, Math.ceil(this.windowMs / 1000));

			const results = await pipeline.exec();

			if (!results) {
				return false;
			}

			const count = results[2]?.[1] as number;

			return count <= this.limit;
		} catch {
			return true;
		}
	}
}
