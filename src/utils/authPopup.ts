function parsePopupDimension(features: string, key: 'width' | 'height'): number | undefined {
  const match = features.match(new RegExp(`${key}=(\\d+)`, 'i'));
  return match ? parseInt(match[1], 10) : undefined;
}

function repositionPopupFeatures(features: string): string {
  const width = parsePopupDimension(features, 'width') ?? 500;
  const height = parsePopupDimension(features, 'height') ?? 600;

  const left = Math.max(Math.round(window.screenX + (window.outerWidth - width) / 2), 0);
  const top = Math.max(Math.round(window.screenY + (window.outerHeight - height) / 2), 0);

  let result = features;
  if (/left=/i.test(result)) {
    result = result.replace(/left=[^,]*/i, `left=${left}`);
  } else {
    result += `,left=${left}`;
  }
  if (/top=/i.test(result)) {
    result = result.replace(/top=[^,]*/i, `top=${top}`);
  } else {
    result += `,top=${top}`;
  }
  return result;
}

/**
 * Firebase Auth centers OAuth popups on the primary monitor (screen.availWidth/Height).
 * This wrapper repositions the popup on the monitor where the app window is focused.
 */
export function withPopupOnFocusedScreen<T>(action: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined') {
    return action();
  }

  window.focus();

  const originalOpen = window.open;

  window.open = function (
    url?: string | URL,
    target?: string,
    features?: string
  ): WindowProxy | null {
    const adjustedFeatures = features ? repositionPopupFeatures(features) : features;
    const popup = originalOpen.call(window, url, target, adjustedFeatures);
    popup?.focus();
    return popup;
  };

  return action().finally(() => {
    window.open = originalOpen;
  });
}
