const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_APPEND_URL = "https://sheets.googleapis.com/v4/spreadsheets";

function base64UrlEncode(str) {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function arrayBufferToBase64Url(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

function pemToArrayBuffer(pem) {
  const lines = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(lines);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

export async function getGoogleAccessToken(env) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;

  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const keyBuffer = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );
  const signedJwt = `${unsignedToken}.${arrayBufferToBase64Url(signatureBuffer)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: signedJwt,
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Google access token: ${response.status} ${errorText}`);
  }

  const tokenData = await response.json();
  if (!tokenData.access_token) {
    throw new Error("No access token returned from Google");
  }

  return tokenData.access_token;
}

export async function appendToSheet(env, token, row) {
  const sheetId = encodeURIComponent(env.SHEET_ID);
  const sheetName = encodeURIComponent(env.SHEET_NAME);
  const sheetRange = encodeURIComponent(env.SHEET_RANGE);
  const url = `${GOOGLE_SHEETS_APPEND_URL}/${sheetId}/values/${sheetName}!${sheetRange}:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to append to sheet: ${response.status} ${errorText}`);
  }
}

export default {
  async fetch(request, env) {
    return new Response("cf-hell0-world up", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },

  async scheduled(event, env, ctx) {
    const ts = new Date().toISOString();
    const row = [ts, "cf-hell0-world", "ok"];

    try {
      const token = await getGoogleAccessToken(env);
      await appendToSheet(env, token, row);
      console.log("✅ Logged cron to Sheets:", ts);
    } catch (err) {
      console.error("❌ Sheets logging failed:", err.message);
    }
  },
};
