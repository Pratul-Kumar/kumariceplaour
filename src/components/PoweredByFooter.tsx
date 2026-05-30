import React from "react";
import { cn } from "@/lib/utils";

interface PoweredByFooterProps {
  className?: string;
}

export function PoweredByFooter({ className }: PoweredByFooterProps) {
  return (
    <footer
      className={cn(
        "w-full py-4 px-6 flex items-center justify-center sm:justify-end text-[10px] sm:text-xs select-none pointer-events-auto animate-fade-in",
        className
      )}
    >
      <a
        href="https://zintrixtechnologies.com"
        target="_blank"
        rel="noopener noreferrer"
        className="group relative flex items-center gap-1.5 font-medium tracking-wide text-muted-foreground/60 hover:text-primary transition-all duration-300 hover:scale-[1.02] press-effect"
      >
        {/* Premium glowing dot indicator */}
        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary group-hover:shadow-[0_0_8px_rgba(99,102,241,0.8)] transition-all duration-300" />
        
        <span>Powered by</span>
        <span className="font-bold text-muted-foreground/80 group-hover:text-primary transition-colors duration-300">
          Zintrix Digital Technologies Pvt Ltd
        </span>

        {/* Hover underline glow */}
        <span className="absolute left-0 bottom-[-2px] w-0 h-[1px] bg-gradient-to-r from-primary to-violet-500 transition-all duration-300 group-hover:w-full" />
      </a>
    </footer>
  );
}
