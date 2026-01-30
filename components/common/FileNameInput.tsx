/**
 * FileName Input Component
 *
 * Input field that shows filename (editable) with extension (read-only) adjacent.
 * Extension appears naturally next to the input with no visual separator.
 */

"use client";

import { useRef, useEffect, useState } from "react";

interface FileNameInputProps {
  value: string;
  extension: string | null;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
}

export function FileNameInput({
  value,
  extension,
  onChange,
  onBlur,
  onKeyDown,
  autoFocus = false,
  className = "",
  placeholder = "",
}: FileNameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-focus and select all text on mount
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const handleFocus = () => {
    setIsFocused(true);
    // Select all text when input gains focus
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  return (
    <div className="inline-flex items-center">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
        style={{
          // Remove right padding so extension sits naturally adjacent
          paddingRight: extension ? '0' : undefined,
        }}
      />
      {extension && (
        <span
          className="text-gray-500 pointer-events-none select-none"
          style={{
            marginLeft: '0px',
            fontSize: 'inherit',
            lineHeight: 'inherit',
          }}
        >
          {extension}
        </span>
      )}
    </div>
  );
}
