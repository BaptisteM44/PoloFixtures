"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";

export function ParallaxImage({ src, alt }: { src: string; alt: string }) {
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      const shift = center * 0.15;
      el.style.transform = `translateY(${shift}px)`;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={imgRef} className="stagger-parallax-inner">
      <Image src={src} alt={alt} fill className="stagger-img" sizes="(max-width: 768px) 100vw, 55vw" />
    </div>
  );
}
