'use client';

import { memo, useEffect } from 'react';
import {
  motion,
  useSpring,
  useTransform,
  type MotionValue,
  type Transition,
} from 'motion/react';

const TRANSITION: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 18,
  mass: 0.3,
};

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type SlidingNumberProps = {
  value: number;
  padStart?: boolean;
  decimalSeparator?: string;
};

export function SlidingNumber({
  value,
  padStart = false,
  decimalSeparator = '.',
}: SlidingNumberProps) {
  const [integerPart, decimalPart = ''] = Math.abs(value)
    .toString()
    .split('.');

  const integerDigits =
    padStart && integerPart.length === 1
      ? `0${integerPart}`
      : integerPart;

  return (
    <div className="flex items-center leading-none tabular-nums">
      {value < 0 && <span>-</span>}

      {Array.from(integerDigits, (digit, index) => (
        <Digit
          key={`integer-${integerDigits.length - index - 1}`}
          value={digit.charCodeAt(0) - 48}
        />
      ))}

      {decimalPart && (
        <>
          <span>{decimalSeparator}</span>

          {Array.from(decimalPart, (digit, index) => (
            <Digit
              key={`decimal-${index}`}
              value={digit.charCodeAt(0) - 48}
            />
          ))}
        </>
      )}
    </div>
  );
}

type DigitProps = {
  value: number;
};

const Digit = memo(function Digit({ value }: DigitProps) {
  const animatedValue = useSpring(value, TRANSITION);

  useEffect(() => {
    animatedValue.set(value);
  }, [animatedValue, value]);

  return (
    <div className="relative w-[0.88ch] overflow-x-visible overflow-y-clip">
      <div className="invisible">0</div>

      {DIGITS.map((number) => (
        <DigitGlyph
          key={number}
          value={animatedValue}
          number={number}
        />
      ))}
    </div>
  );
});

type DigitGlyphProps = {
  value: MotionValue<number>;
  number: number;
};

function DigitGlyph({
  value,
  number,
}: DigitGlyphProps) {
  const y = useTransform(value, (latest) => {
    const currentDigit = latest % 10;
    const offset = (10 + number - currentDigit) % 10;
    const normalizedOffset = offset > 5 ? offset - 10 : offset;

    return `${normalizedOffset * 100}%`;
  });

  return (
    <motion.span
      style={{ y }}
      className="absolute inset-0 flex items-center justify-center"
    >
      {number}
    </motion.span>
  );
};
