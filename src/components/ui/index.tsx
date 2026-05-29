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
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 active:scale-95 select-none";

    const variants: Record<string, string> = {
      default:
        "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-500 hover:shadow-indigo-500/35",
      glow:
        "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:from-indigo-400 hover:to-violet-500",
      destructive:
        "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/20 hover:from-red-400 hover:to-rose-500",
      outline:
        "border text-slate-200 hover:bg-white/5 hover:text-white hover:border-indigo-500/40 transition-colors",
      secondary:
        "text-slate-200 hover:bg-white/8 hover:text-white",
      ghost:
        "text-slate-400 hover:text-white hover:bg-white/6",
      link:
        "text-indigo-400 underline-offset-4 hover:underline hover:text-indigo-300 p-0 h-auto",
    };

    const sizes: Record<string, string> = {
      default: "h-10 px-4 py-2 text-sm",
      sm:      "h-8 px-3 text-xs rounded-lg",
      lg:      "h-12 px-6 text-base",
      icon:    "h-10 w-10",
    };

    // Inline styles for variants that need dynamic dark bg
    const inlineStyle: Record<string, React.CSSProperties> = {
      outline:   { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" },
      secondary: { background: "rgba(255,255,255,0.06)" },
    };

    return (
      <button
        ref={ref}
        style={inlineStyle[variant] ?? undefined}
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
        "flex h-10 w-full rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600",
        "ring-offset-transparent transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
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
      className={cn("text-xs font-semibold text-slate-400 uppercase tracking-wide", className)}
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
        "flex min-h-[88px] w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600",
        "transition-all duration-200 resize-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
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
      className={cn("rounded-2xl text-card-foreground transition-all duration-200", className)}
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderTopColor: "rgba(255,255,255,0.11)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2)",
      }}
      {...props}
    />
  )
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1 p-5 pb-3", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-base font-bold text-slate-100 tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs text-slate-500", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-5 pt-0", className)} {...props} />
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
  const styles: Record<string, React.CSSProperties> = {
    default:     { background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" },
    secondary:   { background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" },
    destructive: { background: "rgba(239,68,68,0.12)",  color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" },
    outline:     { background: "transparent",           color: "#94a3b8", border: "1px solid rgba(255,255,255,0.12)" },
    success:     { background: "rgba(16,185,129,0.12)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.25)" },
    warning:     { background: "rgba(245,158,11,0.12)", color: "#fcd34d", border: "1px solid rgba(245,158,11,0.25)" },
  };
  return (
    <div
      style={styles[variant]}
      className={cn("inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold", className)}
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
        "w-11 h-6 rounded-full transition-colors duration-200",
        "peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-violet-500",
        "after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform after:duration-200 peer-checked:after:translate-x-5",
        className
      )}
        style={{ background: "rgba(255,255,255,0.12)" }}
      />
    </div>
    {label && <span className="text-sm font-medium text-slate-300">{label}</span>}
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
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {icon}
      </div>
      <h3 className="text-base font-bold text-slate-200 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 mb-5 max-w-xs leading-relaxed">{description}</p>}
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
