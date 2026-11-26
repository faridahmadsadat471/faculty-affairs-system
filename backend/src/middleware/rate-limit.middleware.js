// Bounded memory is appropriate for this single-process local server.
// A shared store is required if the API is later run in multiple processes.
export function createRateLimit({ max = 100, windowMs = 15 * 60 * 1000, capacity = 10000, clock = Date.now } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = clock(), key = req.ip;
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (buckets.size >= capacity) {
        for (const [address, value] of buckets) if (value.until <= now) buckets.delete(address);
        if (buckets.size >= capacity && !buckets.has(key)) return res.status(429).set('Retry-After', '60').json({ message: 'Too many requests. Try again later' });
      }
      bucket = { count: 0, until: now + windowMs }; buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) return res.status(429).set('Retry-After', String(Math.ceil((bucket.until - now) / 1000))).json({ message: 'Too many requests. Try again later' });
    next();
  };
}
