import test from "node:test";
import assert from "node:assert/strict";
import { createEmailOtpHandlers } from "../controllers/user.controller.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    set(key, val) {
      this.headers[key] = val;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createInMemoryOtpModel() {
  let seq = 1;
  const docs = [];

  function matches(doc, query) {
    return Object.entries(query).every(([key, condition]) => {
      const value = doc[key];
      if (condition && typeof condition === "object" && !(condition instanceof Date)) {
        if ("$ne" in condition) {
          return value !== condition.$ne;
        }
        if ("$gt" in condition) {
          return value > condition.$gt;
        }
      }
      return value === condition;
    });
  }

  return {
    docs,
    findOne(query) {
      const filtered = docs.filter((d) => matches(d, query));
      return {
        sort(sortSpec) {
          if (sortSpec?.createdAt === -1) {
            filtered.sort((a, b) => b.createdAt - a.createdAt);
          }
          return Promise.resolve(filtered[0] || null);
        },
      };
    },
    async create(payload) {
      const doc = {
        _id: `otp_${seq++}`,
        ...payload,
        createdAt: new Date(Date.now() + seq),
      };
      docs.push(doc);
      return doc;
    },
    async deleteMany(query) {
      for (let i = docs.length - 1; i >= 0; i -= 1) {
        if (matches(docs[i], query)) {
          docs.splice(i, 1);
        }
      }
    },
    async deleteOne(query) {
      const idx = docs.findIndex((d) => matches(d, query));
      if (idx !== -1) docs.splice(idx, 1);
    },
    async findByIdAndUpdate(id, update) {
      const doc = docs.find((d) => d._id === id);
      if (!doc) return null;
      if (update?.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          doc[k] = (doc[k] || 0) + v;
        }
      }
      return doc;
    },
    async findOneAndUpdate(query, update) {
      const doc = docs.find((d) => matches(d, query));
      if (!doc) return null;
      if (update?.$set) {
        Object.assign(doc, update.$set);
      }
      return doc;
    },
  };
}

function createMockUserModel(users = []) {
  return {
    async findOne(query) {
      return users.find((u) => u.email === query.email) || null;
    },
  };
}

function extractOtpFromHtml(html) {
  const match = String(html).match(/\b(\d{6})\b/);
  return match ? match[1] : "";
}

test("Email OTP send rejects invalid email and unregistered user without sending email", async () => {
  let emailCalls = 0;
  const { sendEmailOtp } = createEmailOtpHandlers({
    UserModel: createMockUserModel([]),
    OtpModel: createInMemoryOtpModel(),
    sendEmailFn: async () => {
      emailCalls += 1;
    },
    signTokenFn: () => "jwt-token",
  });

  const badRes = createMockRes();
  await sendEmailOtp({ body: { email: "not-an-email" } }, badRes);
  assert.equal(badRes.statusCode, 400);
  assert.equal(emailCalls, 0);

  const missingUserRes = createMockRes();
  await sendEmailOtp({ body: { email: "unknown@example.com" } }, missingUserRes);
  assert.equal(missingUserRes.statusCode, 404);
  assert.equal(emailCalls, 0);
});

test("Email OTP flow sends real hashed OTP, enforces 60s cooldown, verifies once, and blocks reuse", async () => {
  let nowMs = new Date("2026-11-27T10:00:00Z").getTime();
  const sentEmails = [];
  const OtpModel = createInMemoryOtpModel();
  const UserModel = createMockUserModel([
    {
      _id: "user_1",
      name: "Alice",
      email: "alice@example.com",
      phone: "+919876543210",
      role: "user",
    },
  ]);

  const { sendEmailOtp, verifyEmailOtp } = createEmailOtpHandlers({
    UserModel,
    OtpModel,
    sendEmailFn: async (opts) => {
      sentEmails.push(opts);
    },
    signTokenFn: (u) => `token-for-${u._id}`,
    nowFn: () => new Date(nowMs),
  });

  // 1. Send OTP
  const sendRes = createMockRes();
  await sendEmailOtp({ body: { email: "  ALICE@example.com " } }, sendRes);
  assert.equal(sendRes.statusCode, 200);
  assert.equal(sendRes.body.expiresInSeconds, 300);
  assert.equal(sendRes.body.resendCooldownSeconds, 60);
  assert.equal(sendRes.body.otp, undefined);
  assert.equal(sentEmails.length, 1);

  const otp1 = extractOtpFromHtml(sentEmails[0].message);
  assert.match(otp1, /^\d{6}$/);
  assert.equal(OtpModel.docs.length, 1);
  assert.notEqual(OtpModel.docs[0].otpHash, otp1);

  // 2. Resend blocked within 60s cooldown
  nowMs += 20 * 1000;
  const earlyResendRes = createMockRes();
  await sendEmailOtp({ body: { email: "alice@example.com" } }, earlyResendRes);
  assert.equal(earlyResendRes.statusCode, 429);
  assert.equal(earlyResendRes.body.retryAfterSeconds, 40);
  assert.equal(sentEmails.length, 1);

  // 3. Resend allowed after 60s cooldown, generates new OTP and replaces old one
  nowMs += 41 * 1000;
  const resendRes = createMockRes();
  await sendEmailOtp({ body: { email: "alice@example.com" } }, resendRes);
  assert.equal(resendRes.statusCode, 200);
  assert.equal(sentEmails.length, 2);

  const otp2 = extractOtpFromHtml(sentEmails[1].message);
  assert.match(otp2, /^\d{6}$/);

  // 4. Verify valid OTP issues JWT
  const verifyRes = createMockRes();
  await verifyEmailOtp(
    { body: { email: "alice@example.com", otp: otp2 } },
    verifyRes
  );
  assert.equal(verifyRes.statusCode, 200);
  assert.equal(verifyRes.body.token, "token-for-user_1");
  assert.equal(verifyRes.body.user.email, "alice@example.com");

  // 5. Reuse of the same OTP is rejected
  const reuseRes = createMockRes();
  await verifyEmailOtp(
    { body: { email: "alice@example.com", otp: otp2 } },
    reuseRes
  );
  assert.equal(reuseRes.statusCode, 400);
});

test("Email OTP expires after 5 minutes", async () => {
  let nowMs = new Date("2026-11-27T10:00:00Z").getTime();
  let capturedOtp = "";
  const OtpModel = createInMemoryOtpModel();
  const UserModel = createMockUserModel([
    { _id: "user_2", name: "Bob", email: "bob@example.com", role: "user" },
  ]);

  const { sendEmailOtp, verifyEmailOtp } = createEmailOtpHandlers({
    UserModel,
    OtpModel,
    sendEmailFn: async (opts) => {
      capturedOtp = extractOtpFromHtml(opts.message);
    },
    signTokenFn: () => "jwt",
    nowFn: () => new Date(nowMs),
  });

  const sendRes = createMockRes();
  await sendEmailOtp({ body: { email: "bob@example.com" } }, sendRes);
  assert.equal(sendRes.statusCode, 200);

  // Advance clock by 5 minutes + 1 second
  nowMs += 301 * 1000;
  const expiredRes = createMockRes();
  await verifyEmailOtp(
    { body: { email: "bob@example.com", otp: capturedOtp } },
    expiredRes
  );
  assert.equal(expiredRes.statusCode, 400);
  assert.match(expiredRes.body.message, /expired/i);
  assert.equal(OtpModel.docs.length, 0);
});

test("Email OTP locks after 5 incorrect verification attempts", async () => {
  let capturedOtp = "";
  const OtpModel = createInMemoryOtpModel();
  const UserModel = createMockUserModel([
    { _id: "user_3", name: "Cara", email: "cara@example.com", role: "user" },
  ]);

  const { sendEmailOtp, verifyEmailOtp } = createEmailOtpHandlers({
    UserModel,
    OtpModel,
    sendEmailFn: async (opts) => {
      capturedOtp = extractOtpFromHtml(opts.message);
    },
    signTokenFn: () => "jwt",
  });

  await sendEmailOtp({ body: { email: "cara@example.com" } }, createMockRes());
  const wrongOtp = capturedOtp === "000000" ? "111111" : "000000";

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = createMockRes();
    await verifyEmailOtp(
      { body: { email: "cara@example.com", otp: wrongOtp } },
      res
    );
    assert.equal(res.statusCode, 401);
  }

  // 5th wrong attempt deletes the OTP and returns 429
  const fifthRes = createMockRes();
  await verifyEmailOtp(
    { body: { email: "cara@example.com", otp: wrongOtp } },
    fifthRes
  );
  assert.equal(fifthRes.statusCode, 429);
  assert.equal(OtpModel.docs.length, 0);

  // Subsequent attempt even with the right OTP fails
  const afterLockRes = createMockRes();
  await verifyEmailOtp(
    { body: { email: "cara@example.com", otp: capturedOtp } },
    afterLockRes
  );
  assert.equal(afterLockRes.statusCode, 400);
});

test("Email OTP send maps EMAIL_NOT_CONFIGURED to 503 without exposing secrets", async () => {
  const { sendEmailOtp } = createEmailOtpHandlers({
    UserModel: createMockUserModel([
      { _id: "user_4", name: "Dan", email: "dan@example.com", role: "user" },
    ]),
    OtpModel: createInMemoryOtpModel(),
    sendEmailFn: async () => {
      const err = new Error("Email service is not configured.");
      err.code = "EMAIL_NOT_CONFIGURED";
      throw err;
    },
    signTokenFn: () => "jwt",
  });

  const res = createMockRes();
  await sendEmailOtp({ body: { email: "dan@example.com" } }, res);
  assert.equal(res.statusCode, 503);
});

test("Rate limiter blocks requests exceeding threshold and sets Retry-After", () => {
  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    keyGenerator: (req) => req.body.email,
    message: "Rate limit exceeded",
  });

  let nextCalls = 0;
  for (let i = 0; i < 3; i += 1) {
    const res = createMockRes();
    limiter({ body: { email: "rate@example.com" } }, res, () => {
      nextCalls += 1;
    });
  }
  assert.equal(nextCalls, 3);

  const blockedRes = createMockRes();
  limiter({ body: { email: "rate@example.com" } }, blockedRes, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 3);
  assert.equal(blockedRes.statusCode, 429);
  assert.equal(blockedRes.body.message, "Rate limit exceeded");
  assert.ok(Number(blockedRes.headers["Retry-After"]) >= 1);
});
