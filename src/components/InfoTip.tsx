import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface InfoTipProps {
  /** Tooltip body text. */
  text: string;
  className?: string;
  /** Use on dark / gradient headers. */
  tone?: 'default' | 'onDark';
  /** Preferred horizontal alignment of the bubble relative to the icon. */
  align?: 'start' | 'center' | 'end';
}

type BubblePos = { top: number; left: number; placement: 'above' | 'below' };

/**
 * Compact (i) control that explains how a nearby UI block works.
 * Hover (desktop) or tap/click (mobile) opens the tip; Escape / outside click closes it.
 */
const InfoTip: React.FC<InfoTipProps> = ({
  text,
  className = '',
  tone = 'default',
  align = 'center'
}) => {
  const { t } = useTranslation();
  const tipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<BubblePos | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);

  const clearHoverClose = () => {
    if (hoverCloseTimer.current != null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };

  const updatePosition = useCallback(() => {
    const btn = btnRef.current;
    const bubble = bubbleRef.current;
    if (!btn || !bubble) return;

    const rect = btn.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const gap = 8;
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let placement: 'above' | 'below' = 'below';
    let top = rect.bottom + gap;
    if (top + bubbleRect.height > vh - pad && rect.top - gap - bubbleRect.height >= pad) {
      placement = 'above';
      top = rect.top - gap - bubbleRect.height;
    }

    let left: number;
    if (align === 'start') {
      left = rect.left;
    } else if (align === 'end') {
      left = rect.right - bubbleRect.width;
    } else {
      left = rect.left + rect.width / 2 - bubbleRect.width / 2;
    }
    left = Math.min(Math.max(left, pad), vw - bubbleRect.width - pad);

    setPos({ top, left, placement });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
  }, [open, text, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onScrollOrResize = () => updatePosition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target)) return;
      if (bubbleRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });

    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearHoverClose(), []);

  const openTip = () => {
    clearHoverClose();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearHoverClose();
    hoverCloseTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  const toggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearHoverClose();
    setOpen((prev) => !prev);
  };

  if (!text) return null;

  return (
    <span className={`info-tip ${className}`.trim()} data-tone={tone}>
      <button
        ref={btnRef}
        type="button"
        className="info-tip__btn"
        aria-label={t('infoTips.ariaLabel')}
        aria-expanded={open}
        aria-controls={open ? tipId : undefined}
        onClick={toggle}
        onMouseEnter={openTip}
        onMouseLeave={scheduleClose}
        onFocus={openTip}
        onBlur={scheduleClose}
      >
        <span className="info-tip__glyph" aria-hidden="true">
          i
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tipId}
            role="tooltip"
            className={`info-tip__bubble info-tip__bubble--${pos?.placement ?? 'below'}`}
            style={
              pos
                ? { top: pos.top, left: pos.left, visibility: 'visible' }
                : { top: 0, left: 0, visibility: 'hidden' }
            }
            onMouseEnter={openTip}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
};

export default React.memo(InfoTip);
