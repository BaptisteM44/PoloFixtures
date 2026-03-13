import Image from "next/image";

export function ParallaxImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="stagger-parallax-inner">
      <Image src={src} alt={alt} fill className="stagger-img" sizes="(max-width: 768px) 100vw, 55vw" />
    </div>
  );
}
