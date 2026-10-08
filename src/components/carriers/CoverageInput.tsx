'use client';

import MoneyInput from '@/components/MoneyInput';

/**
 * A dollar amount off a certificate of insurance — liability or cargo.
 *
 * The "$" is drawn in the box rather than typed, as BATS does it, so the label
 * does not need "(USD)" on it. The figure is usually pasted straight off a
 * certificate as "$1,000,000"; MoneyInput shows the commas and hands back the
 * bare number, and parseCoverageInput() still tolerates either on save.
 */
export default function CoverageInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** The form's own input class; left padding is added for the sign. */
  className: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">$</span>
      <MoneyInput
        cents={false}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`${className} pl-7`}
      />
    </div>
  );
}
