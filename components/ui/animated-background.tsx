'use client';

import { cn } from '@/lib/utils';
import { motion, type Transition } from 'motion/react';
import {
  Children,
  cloneElement,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  useId,
  useState,
} from 'react';

type AnimatedBackgroundChildProps = {
  'data-id': string;
  'data-checked'?: 'true' | 'false';
  className?: string;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
};

type AnimatedBackgroundProps = {
  children:
  | ReactElement<AnimatedBackgroundChildProps>
  | readonly ReactElement<AnimatedBackgroundChildProps>[];
  defaultValue?: string | null;
  onValueChange?: (newActiveId: string) => void;
  className?: string;
  transition?: Transition;
};

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 350,
  damping: 30,
};

export function AnimatedBackground({
  children,
  defaultValue = null,
  onValueChange,
  className,
  transition,
}: AnimatedBackgroundProps) {
  const [activeId, setActiveId] = useState<string | null>(defaultValue);

  const layoutId = useId();

  return Children.map(children, (child) => {
    const id = child.props['data-id'];
    const isActive = activeId === id;

    const handleClick = () => {
      setActiveId(id);
      onValueChange?.(id);
    };

    return cloneElement(
      child,
      {
        className: cn(
          'relative inline-flex',
          child.props.className,
        ),
        'data-checked': isActive ? 'true' : 'false',
        onClick: handleClick,
      },
      <>
        {isActive && (
          <motion.span
            layoutId={`animated-background-${layoutId}`}
            className={cn(
              'pointer-events-none absolute inset-0 z-0',
              className,
            )}
            transition={{
              ...DEFAULT_TRANSITION,
              ...transition,
            }}
          />
        )}

        <span className="z-10">
          {child.props.children}
        </span>
      </>,
    );
  });
}
