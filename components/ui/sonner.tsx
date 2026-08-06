/**
 * @file components/ui/sonner.tsx
 * Responsible for toast notification toasts styled to match the dark navy surface theme.
 * Must never override sonner's internal event listener handlers.
 */

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface-dark group-[.toaster]:text-on-dark group-[.toaster]:border-hairline/30 group-[.toaster]:shadow-lg font-sans",
          description: "group-[.toast]:text-muted-soft",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-on-primary font-medium",
          cancelButton:
            "group-[.toast]:bg-surface-dark-soft group-[.toast]:text-muted-soft",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
