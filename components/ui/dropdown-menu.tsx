'use client';

import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { motion, type Variants, AnimatePresence } from 'framer-motion';
import { Slot } from '@radix-ui/react-slot';
import { ChevronDown } from 'lucide-react';
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
        'flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2',
        'text-sm font-medium text-foreground',
        'transition-all duration-200 ease-out',
        'hover:bg-muted hover:border-border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'active:scale-[0.98]',
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
            'h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out',
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
            'absolute z-50 mt-2 min-w-[180px] w-full',
            'flex flex-col gap-1 rounded-lg border border-border bg-card p-1.5',
            'shadow-lg shadow-black/10',
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
          'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm',
          'text-muted-foreground transition-colors',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:bg-muted focus-visible:text-foreground',
          'select-none cursor-pointer',
          selected && 'bg-primary/10 text-foreground',
          className
        )}
        onClick={handleClick}
        aria-current={selected ? 'true' : undefined}
        {...props}
      >
        {icon && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
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
          'block px-2.5 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider',
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
