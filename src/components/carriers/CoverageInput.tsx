'use client';

/**
 * A dollar amount off a certificate of insurance — liability or cargo.
 *
 * The "$" is drawn in the box rather than typed, as BATS does it, so the label
 * does not need "(USD)" on it. It is still a text box and not a number one:
 * the figure is usually pasted straight off a certificate as "$1,000,000", and
 * parseCoverageInput() is what drops the commas and the sign on save.
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
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`${className} pl-7`}
      />
    </div>
  );
}
