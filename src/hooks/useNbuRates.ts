/**
 * Хук для завантаження курсів валют з API Національного банку України
 */
export function useNbuRates() {
  /**
   * Завантажує актуальні курси для вказаних валют з API НБУ
   * @param {string[]} currencyCodes - Масив кодів валют (наприклад, ['USD', 'EUR', 'PLN', 'RON'])
   * @returns {Promise<Object>} Об'єкт з курсами валют { USD: 41.5, EUR: 45.0, ... }
   * @throws {Error} Помилка при завантаженні або обробці даних
   */
  const fetchRatesForCurrencies = async (currencyCodes: string[] = []): Promise<Record<string, number>> => {
    try {
      const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from NBU API');
      }

      // Створюємо об'єкт для зберігання курсів
      const rates: Record<string, number> = {};
      const missingCurrencies: string[] = [];

      // Для кожної валюти знаходимо курс в API
      currencyCodes.forEach(currencyCode => {
        // UAH завжди має курс 1 (базова валюта)
        if (currencyCode === 'UAH') {
          rates['UAH'] = 1;
          return;
        }

        const rateData = data.find((item: any) => item.cc === currencyCode);
        
        if (rateData) {
          // Округлюємо до 2 знаків після коми
          rates[currencyCode] = Math.round(rateData.rate * 100) / 100;
        } else {
          missingCurrencies.push(currencyCode);
        }
      });

      // Якщо є валюты, які не знайдені в API, виводимо попередження
      if (missingCurrencies.length > 0) {
        console.warn('Деякі валюти не знайдені в API НБУ:', missingCurrencies);
      }

      return rates;
    } catch (error) {
      console.error('Помилка при завантаженні курсів НБУ:', error);
      throw error;
    }
  };

  /**
   * Завантажує актуальні курси USD та EUR з API НБУ (для зворотної сумісності)
   * @deprecated Використовуйте fetchRatesForCurrencies замість цієї функції
   */
  const fetchAndApplyRates = async (): Promise<{ usdRate: number; eurRate: number }> => {
    const rates = await fetchRatesForCurrencies(['USD', 'EUR']);
    return {
      usdRate: rates['USD'] || 41.5,
      eurRate: rates['EUR'] || 45.0
    };
  };

  return { fetchRatesForCurrencies, fetchAndApplyRates };
}

