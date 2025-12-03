// Хелпер для встановлення cookie з терміном дії в днях
export const setCookie = (name: string, value: string, days: number): void => {
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  } catch (error) {
    console.error('Помилка при збереженні cookie:', error);
  }
};

// Хелпер для читання cookie
export const getCookie = (name: string): string | null => {
  try {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return decodeURIComponent(parts.pop()?.split(';').shift() || '');
    }
  } catch (error) {
    console.error('Помилка при читанні cookie:', error);
  }
  return null;
};

