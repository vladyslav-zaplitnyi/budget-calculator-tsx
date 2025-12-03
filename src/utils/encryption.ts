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
    console.log('🔓 decryptData: Початок розшифрування');
    console.log('🔓 Довжина зашифрованого рядка:', encryptedString.length);
    console.log('🔓 Довжина пароля:', password.length);
    
    // Розшифровуємо
    const decrypted = CryptoJS.AES.decrypt(encryptedString, password);
    
    // Отримуємо оригінальний рядок
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    console.log('🔓 Довжина розшифрованого рядка:', decryptedString.length);
    console.log('🔓 Перші 100 символів розшифрованого рядка:', decryptedString.substring(0, 100));
    
    // Перевіряємо, чи розшифрування було успішним
    if (!decryptedString) {
      console.error('❌ Розшифрований рядок порожній - невірний пароль');
      throw new WrongPasswordError('Невірний пароль');
    }
    
    // Парсимо JSON
    try {
      const data = JSON.parse(decryptedString) as T;
      console.log('🔓 ✅ JSON успішно розпарсено');
      return data;
    } catch (parseError) {
      console.error('❌ Помилка парсингу JSON:', parseError);
      if (parseError instanceof SyntaxError) {
        throw new WrongPasswordError('Невірний пароль');
      }
      throw parseError;
    }
  } catch (error) {
    console.error('❌ Помилка в decryptData:', error);
    // Якщо це наша кастомна помилка, просто кидаємо її далі
    if (error instanceof WrongPasswordError) {
      throw error;
    }
    
    // Якщо помилка парсингу JSON, це також означає невірний пароль
    if (error instanceof SyntaxError) {
      throw new WrongPasswordError('Невірний пароль');
    }
    
    // Перевіряємо, чи це помилка CryptoJS про невірний формат
    if (error instanceof Error && error.message.includes('Malformed UTF-8')) {
      console.error('❌ Malformed UTF-8 - це означає невірний пароль або пошкоджені дані');
      throw new WrongPasswordError('Невірний пароль');
    }
    
    // Інші помилки
    throw new Error(`Помилка при розшифруванні даних: ${error instanceof Error ? error.message : String(error)}`);
  }
}

