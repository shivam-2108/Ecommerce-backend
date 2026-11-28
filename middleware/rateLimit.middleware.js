/**
 * Lightweight in-memory rate limiting middleware for sensitive auth endpoints.
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyGenerator,
  message = "Too many requests. Please try again later.",
} = {}) {
  const store = new Map();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, Math.min(windowMs, 60 * 1000));

  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = String(
      keyGenerator ? keyGenerator(req) : req.ip || req.socket?.remoteAddress || "unknown"
    );

    const existing = store.get(key);
    if (!existing || existing.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      );
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message,
        retryAfterSeconds,
      });
    }

    return next();
  };
}

function getClientIp(req) {
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getNormalizedEmail(req) {
  return typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "";
}

const sendEmailScopedLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `send-email:${getNormalizedEmail(req) || getClientIp(req)}`,
  message: "Too many OTP requests for this email. Please try again later.",
});

const sendIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  keyGenerator: (req) => `send-ip:${getClientIp(req)}`,
  message: "Too many OTP requests from this network. Please try again later.",
});

const verifyEmailScopedLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => `verify-email:${getNormalizedEmail(req) || getClientIp(req)}`,
  message: "Too many OTP verification attempts. Please try again later.",
});

const verifyIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `verify-ip:${getClientIp(req)}`,
  message: "Too many verification attempts from this network. Please try again later.",
});

export const otpSendRateLimiter = [sendIpLimiter, sendEmailScopedLimiter];
export const otpVerifyRateLimiter = [verifyIpLimiter, verifyEmailScopedLimiter];
