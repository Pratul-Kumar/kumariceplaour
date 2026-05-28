import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./index";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  React.useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 w-full max-h-[90vh] overflow-y-auto bg-card border border-border shadow-2xl",
          "sm:rounded-2xl rounded-t-2xl animate-fade-in",
          "sm:max-w-lg",
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between p-6 border-b border-border">
            <div>
              {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
              {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-4">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="p-6 pb-8 sm:pb-6">{children}</div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  variant?: "destructive" | "default";
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmText = "Confirm", variant = "destructive" }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} className="max-w-sm">
      <div className="flex gap-3 mt-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button
          variant={variant}
          className="flex-1"
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
