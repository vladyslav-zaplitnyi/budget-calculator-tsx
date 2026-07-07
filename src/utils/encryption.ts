/**
 * Клас помилки для невірного пароля
 */
export class WrongPasswordError extends Error {
  constructor(message: string = 'Невірний пароль') {
    super(message);
    this.name = 'WrongPasswordError';
  }
}

/**
 * Кидається, коли зашифровані дані записані у форматі, який більше не підтримується
 * (наприклад, старим форматом на базі crypto-js до переходу на Web Crypto).
 * На відміну від WrongPasswordError, жодний пароль тут не допоможе — формат несумісний.
 */
export class UnsupportedEncryptionFormatError extends Error {
  constructor(message: string = 'Непідтримуваний формат зашифрованих даних') {
    super(message);
    this.name = 'UnsupportedEncryptionFormatError';
  }
}

/**
 * Шифрування даних — нативний Web Crypto: PBKDF2-SHA256 → AES-256-GCM.
 *
 *  - PBKDF2-SHA256 з 250 000 ітерацій та випадковою сіллю → перебір пароля (brute-force)
 *    на порядки повільніший.
 *  - AES-256-GCM (автентифіковане шифрування) → підміна/пошкодження шифротексту виявляється,
 *    невірний пароль дає чисту помилку автентифікації.
 *  - Web Crypto виконується нативно (швидко, не блокує UI).
 *
 * Формат зберігання: рядок з префіксом `ENCv2:` + JSON-конверт (сіль, IV, шифротекст).
 * Префікс — це маркер версії формату на випадок майбутніх змін схеми.
 */
const ENC_V2_PREFIX = 'ENCv2:';
const PBKDF2_ITERATIONS = 250000;
const SALT_BYTES = 16; // 128-бітна сіль
const IV_BYTES = 12; // рекомендований розмір IV для AES-GCM
const AES_KEY_BITS = 256;

interface EncryptedEnvelopeV2 {
  v: 2;
  alg: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  it: number;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64 (шифротекст + тег автентифікації GCM)
}

function getSubtle(): SubtleCrypto | null {
  const cryptoObj = (globalThis as unknown as { crypto?: Crypto }).crypto;
  return cryptoObj && cryptoObj.subtle ? cryptoObj.subtle : null;
}

function randomBytes(length: number): Uint8Array {
  return (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(
  subtle: SubtleCrypto,
  password: string,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    usage
  );
}

/**
 * Шифрує дані за допомогою PBKDF2-SHA256 + AES-256-GCM (Web Crypto).
 * @param data - Дані для шифрування (будь-який об'єкт)
 * @param password - Пароль для шифрування
 * @returns Зашифрований рядок (формат ENCv2)
 */
export async function encryptData<T>(data: T, password: string): Promise<string> {
  const subtle = getSubtle();
  if (!subtle) {
    throw new Error('Web Crypto API недоступний: шифрування потребує безпечного контексту (HTTPS).');
  }

  try {
    const jsonString = JSON.stringify(data);
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveAesKey(subtle, password, salt, PBKDF2_ITERATIONS, ['encrypt']);

    const ciphertext = new Uint8Array(
      await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(jsonString))
    );

    const envelope: EncryptedEnvelopeV2 = {
      v: 2,
      alg: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      it: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ct: bytesToBase64(ciphertext)
    };

    return ENC_V2_PREFIX + JSON.stringify(envelope);
  } catch (error) {
    throw new Error(`Помилка при шифруванні даних: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Розшифровує дані у форматі ENCv2 (PBKDF2-SHA256 + AES-256-GCM).
 */
async function decryptV2(encryptedString: string, password: string): Promise<string> {
  const subtle = getSubtle();
  if (!subtle) {
    throw new Error('Web Crypto API недоступний для розшифрування даних.');
  }

  const envelope = JSON.parse(encryptedString.slice(ENC_V2_PREFIX.length)) as EncryptedEnvelopeV2;
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ct);
  const iterations = typeof envelope.it === 'number' && envelope.it > 0 ? envelope.it : PBKDF2_ITERATIONS;

  const key = await deriveAesKey(subtle, password, salt, iterations, ['decrypt']);

  try {
    const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    // Помилка автентифікації GCM = невірний пароль або підмінені/пошкоджені дані
    throw new WrongPasswordError('Невірний пароль');
  }
}

/**
 * Розшифровує дані.
 * @param encryptedString - Зашифрований рядок (формат ENCv2)
 * @param password - Пароль для розшифрування
 * @returns Розшифровані дані типу T
 * @throws WrongPasswordError якщо пароль невірний
 */
export async function decryptData<T>(encryptedString: string, password: string): Promise<T> {
  if (!encryptedString.startsWith(ENC_V2_PREFIX)) {
    throw new UnsupportedEncryptionFormatError();
  }

  try {
    const decryptedString = await decryptV2(encryptedString, password);

    if (!decryptedString) {
      throw new WrongPasswordError('Невірний пароль');
    }

    try {
      return JSON.parse(decryptedString) as T;
    } catch (parseError) {
      // Невдалий парсинг JSON після розшифрування = невірний пароль
      if (parseError instanceof SyntaxError) {
        throw new WrongPasswordError('Невірний пароль');
      }
      throw parseError;
    }
  } catch (error) {
    if (error instanceof WrongPasswordError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new WrongPasswordError('Невірний пароль');
    }

    throw new Error(`Помилка при розшифруванні даних: ${error instanceof Error ? error.message : String(error)}`);
  }
}
