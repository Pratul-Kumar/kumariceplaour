import React from "react";
import { cn } from "@/lib/utils";

interface PoweredByFooterProps {
  className?: string;
}

export function PoweredByFooter({ className }: PoweredByFooterProps) {
  return (
    <footer
      className={cn(
        "w-full py-4 px-6 flex items-center justify-center sm:justify-end text-[10px] sm:text-xs select-none pointer-events-auto",
        className
      )}
    >
      <a
        href="https://zintrixtechnologies.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground/60 hover:text-foreground transition-colors duration-150"
      >
        <span>Powered by </span>
        <span className="font-semibold text-muted-foreground/80 hover:text-foreground">
          Zintrix Digital Technologies Pvt Ltd
        </span>
      </a>
    </footer>
  );
}
