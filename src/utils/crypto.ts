// Шифрование архива перед записью в облако (GitHub Gist).
// AES-256-GCM, ключ выводится из пароля сайта через PBKDF2 (100 000 итераций).
// Формат конверта: { v, enc: 'aes-256-gcm', salt, iv, data } — все поля base64.

const te = new TextEncoder();
const td = new TextDecoder();

function b64(buf: Uint8Array): string {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(data: unknown, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    te.encode(JSON.stringify(data))
  );
  return JSON.stringify({
    v: 1,
    enc: 'aes-256-gcm',
    salt: b64(salt),
    iv: b64(iv),
    data: b64(new Uint8Array(ct)),
  });
}

// Расшифровка конверта; если файл старого формата (чистый JSON) — вернёт как есть.
// Бросает ошибку при неверном пароле или повреждении.
export async function decryptJSON(text: string, password: string): Promise<any> {
  const env = JSON.parse(text);
  if (!env || env.enc !== 'aes-256-gcm') return env; // legacy: plain JSON
  const key = await deriveKey(password, unb64(env.salt));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(env.iv) },
    key,
    unb64(env.data)
  );
  return JSON.parse(td.decode(pt));
}
