import React from 'react';
import { TransactionItemBind } from '../hooks/useTransactionMoveSelection';

interface SelectableTransactionRowProps {
  selected: boolean;
  selecting: boolean;
  disabled?: boolean;
  compact?: boolean;
  checkboxLabel: string;
  bind: TransactionItemBind;
  onToggle: () => void;
  consumeSuppressedClick: () => boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const SelectableTransactionRow: React.FC<SelectableTransactionRowProps> = ({
  selected,
  selecting,
  disabled = false,
  compact = false,
  checkboxLabel,
  bind,
  onToggle,
  consumeSuppressedClick,
  actions,
  children
}) => {
  const handleCheckboxClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    if (consumeSuppressedClick()) return;
    onToggle();
  };

  return (
    <div
      {...bind}
      className={`tx-selectable flex items-center gap-1.5 rounded-lg border transition-all ${
        compact ? 'text-xs p-1' : 'p-2.5'
      } ${
        selected
          ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/70'
          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
      } ${selecting || selected ? 'cursor-pointer' : ''} ${disabled ? 'pointer-events-none' : ''}`}
    >
      <button
        type="button"
        onClick={handleCheckboxClick}
        className={`flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
          compact ? 'w-4 h-4' : 'w-5 h-5'
        } ${
          selected
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'bg-white border-gray-300 hover:border-indigo-400'
        }`}
        aria-label={checkboxLabel}
        aria-pressed={selected}
        tabIndex={disabled ? -1 : 0}
      >
        {selected ? (
          <span className={compact ? 'text-[9px] leading-none' : 'text-[11px] leading-none'} aria-hidden>
            ✓
          </span>
        ) : null}
      </button>

      <div className="flex-1 min-w-0">{children}</div>

      {!selecting && actions ? <div className="flex gap-1.5 ml-1 flex-shrink-0">{actions}</div> : null}
    </div>
  );
};

export default SelectableTransactionRow;
