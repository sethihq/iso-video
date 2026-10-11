'use client';

import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { motion, type Variants, AnimatePresence } from 'framer-motion';
import { Slot } from '@radix-ui/react-slot';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Animation variants
const contentVariants: Variants = {
  hidden: {
    clipPath: 'inset(10% 50% 90% 50% round 10px)',
    opacity: 0,
  },
  show: {
    clipPath: 'inset(0% 0% 0% 0% round 10px)',
    opacity: 1,
    transition: {
      type: 'spring',
      bounce: 0,
      duration: 0.4,
      delayChildren: 0.1,
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    filter: 'blur(10px)',
  },
  show: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      bounce: 0,
      duration: 0.3,
    },
  },
};

// Context
type DropdownContextType = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  close: () => void;
};

const DropdownContext = createContext<DropdownContextType | null>(null);

function useDropdown() {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error('Dropdown components must be used within a DropdownMenu');
  }
  return context;
}

// Root component
interface DropdownMenuProps {
  children: React.ReactNode;
  className?: string;
}

export function DropdownMenu({ children, className }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, close }}>
      <div ref={containerRef} className={cn('relative', className)}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

// Trigger
interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  showChevron?: boolean;
}

export function DropdownMenuTrigger({
  asChild = false,
  showChevron = true,
  children,
  className,
  ...props
}: DropdownMenuTriggerProps) {
  const { isOpen, setIsOpen } = useDropdown();
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      className={cn(
        // A gray well that turns white while its menu is open
        'squircle flex h-8 w-full items-center justify-between gap-2 rounded-[10px] bg-well px-2.5 text-left',
        'text-[13px] text-foreground transition-colors duration-100',
        'hover:bg-well-hover aria-expanded:bg-white aria-expanded:shadow-[0_0_0_1px_rgba(0,0,0,0.06)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className
      )}
      onClick={() => setIsOpen((prev) => !prev)}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      {...props}
    >
      {children}
      {showChevron && (
        <ChevronDown
          className={cn(
            'size-3.5 text-faint transition-transform duration-200 ease-snappy',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      )}
    </Comp>
  );
}

// Content
interface DropdownMenuContentProps {
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

export function DropdownMenuContent({
  children,
  className,
  align = 'start',
}: DropdownMenuContentProps) {
  const { isOpen } = useDropdown();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.ul
          role="menu"
          className={cn(
            'squircle absolute z-50 mt-1.5 min-w-[180px] w-full',
            'flex flex-col rounded-[16px] bg-popover p-1 text-[13px]',
            'shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_18px_40px_-14px_rgba(0,0,0,0.28)]',
            align === 'start' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'end' && 'right-0',
            className
          )}
          variants={contentVariants}
          initial="hidden"
          animate="show"
          exit="hidden"
        >
          {children}
        </motion.ul>
      )}
    </AnimatePresence>
  );
}

// Item
interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  icon?: React.ReactNode;
  selected?: boolean;
}

export function DropdownMenuItem({
  asChild = false,
  icon,
  selected,
  children,
  className,
  onClick,
  ...props
}: DropdownMenuItemProps) {
  const { close } = useDropdown();
  const Comp = asChild ? Slot : 'button';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    close();
  };

  return (
    <motion.li variants={itemVariants} role="presentation">
      <Comp
        role="menuitem"
        className={cn(
          'squircle flex h-8 w-full items-center gap-2 rounded-[11px] pl-2 pr-3 text-left text-[13px]',
          'text-foreground transition-colors duration-100',
          'hover:bg-well focus-visible:outline-none focus-visible:bg-well',
          'select-none cursor-pointer',
          className
        )}
        onClick={handleClick}
        aria-current={selected ? 'true' : undefined}
        {...props}
      >
        {/* The chosen option carries an amber check */}
        <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">
          {selected ? <Check className="size-3.5 text-primary-press" strokeWidth={2.5} /> : icon}
        </span>
        {children}
      </Comp>
    </motion.li>
  );
}

// Label (non-interactive)
interface DropdownMenuLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function DropdownMenuLabel({ children, className }: DropdownMenuLabelProps) {
  return (
    <motion.li variants={itemVariants}>
      <span
        className={cn(
          'block px-2 py-1.5 text-[11px] font-medium text-faint',
          className
        )}
      >
        {children}
      </span>
    </motion.li>
  );
}

// Separator
export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <motion.li variants={itemVariants}>
      <div className={cn('my-1 h-px bg-border', className)} />
    </motion.li>
  );
}
