"use client";

import { useRef } from "react";

export default function ConfirmFormButton({
  action,
  confirmMessage,
  className,
  style,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  confirmMessage: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <button className={className} type="submit" style={style}>
        {children}
      </button>
    </form>
  );
}
