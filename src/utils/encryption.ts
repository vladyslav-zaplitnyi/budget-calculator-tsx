import CryptoJS from 'crypto-js';

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
 * Шифрує дані за допомогою AES-256
 * @param data - Дані для шифрування (будь-який об'єкт)
 * @param password - Пароль для шифрування
 * @returns Зашифрований рядок
 */
export function encryptData<T>(data: T, password: string): string {
  try {
    // Перетворюємо об'єкт в JSON
    const jsonString = JSON.stringify(data);
    
    // Шифруємо за допомогою AES
    const encrypted = CryptoJS.AES.encrypt(jsonString, password).toString();
    
    return encrypted;
  } catch (error) {
    throw new Error(`Помилка при шифруванні даних: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Розшифровує дані за допомогою AES-256
 * @param encryptedString - Зашифрований рядок
 * @param password - Пароль для розшифрування
 * @returns Розшифровані дані типу T
 * @throws WrongPasswordError якщо пароль невірний
 */
export function decryptData<T>(encryptedString: string, password: string): T {
  try {
    // Розшифровуємо
    const decrypted = CryptoJS.AES.decrypt(encryptedString, password);
    
    // Отримуємо оригінальний рядок
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    // Перевіряємо, чи розшифрування було успішним
    if (!decryptedString) {
      throw new WrongPasswordError('Невірний пароль');
    }
    
    // Парсимо JSON
    const data = JSON.parse(decryptedString) as T;
    
    return data;
  } catch (error) {
    // Якщо це наша кастомна помилка, просто кидаємо її далі
    if (error instanceof WrongPasswordError) {
      throw error;
    }
    
    // Якщо помилка парсингу JSON, це також означає невірний пароль
    if (error instanceof SyntaxError) {
      throw new WrongPasswordError('Невірний пароль');
    }
    
    // Інші помилки
    throw new Error(`Помилка при розшифруванні даних: ${error instanceof Error ? error.message : String(error)}`);
  }
}

