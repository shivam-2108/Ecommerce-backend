/**
 * Normalize an Indian or international phone number to E.164 format (+91XXXXXXXXXX by default).
 */
export function normalizePhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== "string") return "";
  const cleaned = rawPhone.replace(/[\s\-().]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return cleaned;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return "";
}

/**
 * Send SMS OTP using configured provider (Twilio or Fast2SMS).
 * Fails explicitly when credentials are missing instead of simulating delivery.
 */
export async function sendSmsOtp({ phone, otp }) {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    throw new Error("Invalid mobile number format");
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;

  if (twilioSid && twilioToken && twilioFrom) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const body = new URLSearchParams({
      To: normalizedPhone,
      From: twilioFrom,
      Body: `Your ShopEase login OTP is ${otp}. Valid for 5 minutes. Do not share it with anyone.`,
    });

    const authHeader = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || "Twilio SMS delivery failed");
    }

    return { provider: "twilio", delivered: true };
  }

  if (fast2SmsKey) {
    const localDigits = normalizedPhone.replace(/^\+91/, "");
    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: fast2SmsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "otp",
        variables_values: otp,
        numbers: localDigits,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.return === false) {
      throw new Error(data.message || "Fast2SMS delivery failed");
    }

    return { provider: "fast2sms", delivered: true };
  }

  const err = new Error(
    "SMS OTP service is not configured. Configure Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) or Fast2SMS (FAST2SMS_API_KEY) in backend environment variables."
  );
  err.code = "SMS_NOT_CONFIGURED";
  throw err;
}
