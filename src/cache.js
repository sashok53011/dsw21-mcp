// Tiny in-memory TTL cache.
// Deutsche Bahn APIs are rate-limited and sometimes block clients, so every
// upstream call goes through this cache. Keys are derived from the method and
// its arguments.

class TtlCache {
	constructor() {
		this.store = new Map();
	}

	get(key) {
		const entry = this.store.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt <= Date.now()) {
			this.store.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key, value, ttlMs) {
		if (!(ttlMs > 0)) return value;
		this.store.set(key, {value, expiresAt: Date.now() + ttlMs});
		// Opportunistic cleanup to bound memory usage.
		if (this.store.size > 1000) {
			const now = Date.now();
			for (const [k, e] of this.store) {
				if (e.expiresAt <= now) this.store.delete(k);
			}
		}
		return value;
	}

	async wrap(key, ttlMs, fn) {
		const cached = this.get(key);
		if (cached !== undefined) return cached;
		const value = await fn();
		// Do not cache failed/empty upstream responses as permanent hits.
		return this.set(key, value, ttlMs);
	}
}

export {
	TtlCache,
};
