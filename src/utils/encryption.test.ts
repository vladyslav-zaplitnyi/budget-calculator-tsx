import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import { encryptData, decryptData, WrongPasswordError, UnsupportedEncryptionFormatError } from './encryption';

// jsdom не реалізує Web Crypto (crypto.subtle) та інколи TextEncoder/TextDecoder —
// підставляємо нативні реалізації Node, щоб тест відображав поведінку у браузері.
beforeAll(() => {
  if (!(globalThis as unknown as { crypto?: Crypto }).crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
  if (typeof (globalThis as unknown as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
    (globalThis as unknown as { TextEncoder: unknown }).TextEncoder = TextEncoder;
  }
  if (typeof (globalThis as unknown as { TextDecoder?: unknown }).TextDecoder === 'undefined') {
    (globalThis as unknown as { TextDecoder: unknown }).TextDecoder = TextDecoder;
  }
});

describe('encryption', () => {
  const password = 'super-secret-password-123';
  const payload = {
    activeBudgetId: 'default',
    budgets: { default: { name: 'Мій бюджет', value: 42, nested: { a: [1, 2, 3] } } }
  };

  it('шифрує та розшифровує дані (round-trip) у форматі ENCv2', async () => {
    const encrypted = await encryptData(payload, password);
    expect(encrypted.startsWith('ENCv2:')).toBe(true);
    const decrypted = await decryptData<typeof payload>(encrypted, password);
    expect(decrypted).toEqual(payload);
  });

  it('використовує випадкову сіль/IV: два шифрування дають різний результат', async () => {
    const a = await encryptData(payload, password);
    const b = await encryptData(payload, password);
    expect(a).not.toEqual(b);
  });

  it('кидає WrongPasswordError при невірному паролі (AES-GCM автентифікація)', async () => {
    const encrypted = await encryptData(payload, password);
    await expect(decryptData(encrypted, 'wrong-password')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('відхиляє дані у непідтримуваному (старому) форматі', async () => {
    await expect(decryptData('U2FsdGVkX1+legacyGarbage==', password)).rejects.toBeInstanceOf(
      UnsupportedEncryptionFormatError
    );
  });
});
