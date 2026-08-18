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
			const cleanup = redis.pipeline();
			cleanup.zremrangebyscore(redisKey, 0, windowStart);
			cleanup.zcard(redisKey);
			const results = await cleanup.exec();
			if (!results) return false;
			// Do not record rejected requests: otherwise every retry moves a sliding
			// window forward and can keep a client rate-limited indefinitely.
			const count = results[1]?.[1] as number;
			if (count >= this.limit) return false;
			await redis
				.multi()
				.zadd(redisKey, now, `${now}:${Math.random()}`)
				.expire(redisKey, Math.ceil(this.windowMs / 1000))
				.exec();
			return true;
		} catch {
			return true;
		}
	}
}
