"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

export function CreatedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("tournament");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get("created") === "true") {
      setVisible(true);
      // Clean URL
      const params = new URLSearchParams(searchParams.toString());
      params.delete("created");
      const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
      router.replace(newUrl, { scroll: false });
      // Auto-dismiss
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router, pathname]);

  if (!visible) return null;

  return (
    <div className="created-toast" onClick={() => setVisible(false)}>
      <span style={{ fontSize: 20 }}>🎉</span>
      <div>
        <strong>{t("created_toast_title")}</strong>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{t("created_toast_desc")}</p>
      </div>
    </div>
  );
}
