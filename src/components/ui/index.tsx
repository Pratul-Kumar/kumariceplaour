import * as React from "react";
import { cn } from "@/lib/utils";

// ================================================================
// BUTTON — Premium dark with gradient primary
// ================================================================
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "glow";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 active:scale-95 select-none";

    const variants: Record<string, string> = {
      default:
        "bg-primary text-primary-foreground shadow-sm hover:bg-primary/95",
      glow:
        "bg-primary text-primary-foreground shadow-sm hover:bg-primary/95",
      destructive:
        "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
      outline:
        "border border-border bg-transparent text-foreground hover:bg-muted transition-colors",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost:
        "text-muted-foreground hover:text-foreground hover:bg-muted",
      link:
        "text-primary underline-offset-4 hover:underline p-0 h-auto",
    };

    const sizes: Record<string, string> = {
      default: "h-9 px-4 py-2 text-sm",
      sm:      "h-8 px-3 text-xs",
      lg:      "h-10 px-6 text-sm",
      icon:    "h-9 w-9",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// ================================================================
// INPUT — Dark glassmorphic
// ================================================================
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-xl px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground",
        "ring-offset-transparent transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        ...((props as any).style),
      }}
      {...props}
    />
  )
);
Input.displayName = "Input";

// ================================================================
// LABEL
// ================================================================
export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-xs font-semibold text-muted-foreground uppercase tracking-wide", className)}
      {...props}
    />
  )
);
Label.displayName = "Label";

// ================================================================
// TEXTAREA
// ================================================================
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[88px] w-full rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
        "transition-all duration-200 resize-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      style={{ background: "var(--glass-bg)", border: "1px solid rgba(255,255,255,0.09)" }}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

// ================================================================
// CARD — Glass surface
// ================================================================
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200", className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1 p-4 pb-2", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-base font-bold text-foreground tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

// ================================================================
// BADGE — Glassy pills
// ================================================================
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default:     "bg-primary/10 text-indigo-400 border border-primary/20",
    secondary:   "bg-muted text-muted-foreground border border-border",
    destructive: "bg-red-500/10 text-red-400 border border-red-500/20",
    outline:     "text-muted-foreground border border-border",
    success:     "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    warning:     "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  };
  return (
    <div
      className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", variants[variant], className)}
      {...props}
    />
  );
}

// ================================================================
// SEPARATOR
// ================================================================
export function Separator({ className, orientation = "horizontal", ...props }: React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      className={cn(
        "shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      style={{ background: "rgba(255,255,255,0.07)" }}
      {...props}
    />
  );
}

// ================================================================
// SKELETON — Dark shimmer
// ================================================================
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-xl", className)} {...props} />;
}

// ================================================================
// SELECT (custom component wrapper)
// ================================================================
export interface SelectOption { value: string; label: string }
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  placeholder?: string;
}
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, ...props }, ref) => (
    <select ref={ref} className={cn("w-full", className)} {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
);
Select.displayName = "Select";

// ================================================================
// SWITCH
// ================================================================
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, label, id, ...props }, ref) => (
  <label htmlFor={id} className="flex items-center gap-2.5 cursor-pointer">
    <div className="relative">
      <input ref={ref} type="checkbox" id={id} className="sr-only peer" {...props} />
      <div className={cn(
        "w-11 h-6 rounded-full transition-colors duration-200 bg-black/10 dark:bg-white/10",
        "peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-violet-500",
        "after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform after:duration-200 peer-checked:after:translate-x-5",
        className
      )}
      />
    </div>
    {label && <span className="text-sm font-medium text-foreground">{label}</span>}
  </label>
));
Switch.displayName = "Switch";

// ================================================================
// AVATAR
// ================================================================
export function Avatar({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)} {...props}>
      {children}
    </div>
  );
}

export function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-full w-full items-center justify-center rounded-full text-white text-sm font-bold bg-gradient-to-br from-violet-500 to-indigo-600", className)}
      {...props}
    />
  );
}

// ================================================================
// PROGRESS — Gradient bar
// ================================================================
export function Progress({ value = 0, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: number }) {
  return (
    <div
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full", className)}
      style={{ background: "rgba(255,255,255,0.08)" }}
      {...props}
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
          boxShadow: "0 0 8px rgba(99,102,241,0.5)",
        }}
      />
    </div>
  );
}

// ================================================================
// EMPTY STATE
// ================================================================
export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center animate-fade-up">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-4"
        style={{ background: "var(--glass-bg)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {icon}
      </div>
      <h3 className="text-base font-bold text-foreground mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-5 max-w-xs leading-relaxed">{description}</p>}
      {action}
    </div>
  );
}

// ================================================================
// LOADING SPINNER — Neon ring
// ================================================================
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-spin rounded-full border-2 h-5 w-5", className)}
      style={{
        borderColor: "rgba(99,102,241,0.2)",
        borderTopColor: "#6366f1",
        boxShadow: "0 0 8px rgba(99,102,241,0.4)",
      }}
    />
  );
}
