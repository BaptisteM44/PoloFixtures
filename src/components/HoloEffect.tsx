"use client";

import { useRef, useEffect, useCallback, useState } from "react";

/* ═══════════════════════════════════════════════════════════════
   HoloEffect — WebGL holographic overlay for legendary cards.
   Supports 4 visual variants selectable via the `variant` prop.
   ═══════════════════════════════════════════════════════════════ */

const VERT = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

/* ── 1) GLITTER — dense micro-sparkles (default) ── */
const FRAG_GLITTER = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time; uniform vec2 u_mouse; uniform float u_hover; uniform float u_aspect;
  vec3 hsv2rgb(float h,float s,float v){vec3 c=clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0);return v*mix(vec3(1),c,s);}
  float hash(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+45.32);return fract(p.x*p.y);}
  float star(vec2 uv,float r){vec2 a=abs(uv);return 1.0-smoothstep(0.0,r,mix(max(a.x,a.y),(a.x+a.y)*0.707,0.4));}
  void main(){
    vec2 uv=v_uv; vec2 tilt=u_mouse-0.5;
    // Glitter
    float cR=75.0; vec2 sUV=uv*vec2(u_aspect,1.0)*cR; vec2 cell=floor(sUV); vec2 cUV=fract(sUV)-0.5;
    float h0=hash(cell),h1=hash(cell+vec2(5.2,1.3)),h2=hash(cell+vec2(2.7,9.8));
    float flicker=pow(max(0.0,sin(h0*628.3+u_time*(0.8+h1*3.5))),9.0);
    float shape=max(star(cUV,0.09),star(cUV-vec2(h1-0.5,h2-0.5)*0.25,0.09));
    vec3 glit=mix(vec3(1.0,0.98,0.96),hsv2rgb(h0,0.35,1.0),0.18)*step(0.68,h0)*flicker*shape;
    // Bands (hover)
    float ta=atan(tilt.y,tilt.x+0.0001); vec2 bd=vec2(-sin(ta+0.5),cos(ta+0.5));
    float ph=dot(uv*vec2(u_aspect,1.0),bd)*mix(3.5,7.0,u_hover)+u_time*mix(0.12,0.0,u_hover)+length(tilt)*4.0;
    vec3 bands=hsv2rgb(fract(ph*0.38),0.88,1.0)*mix(0.06,0.28,u_hover)*pow(sin(ph*3.14159)*0.5+0.5,1.8);
    // Specular (hover)
    vec2 sd=(uv-(tilt*0.55+0.5))*vec2(u_aspect,1.0);
    vec3 spec=vec3(1.0,0.98,0.93)*exp(-dot(sd,sd)*4.5)*mix(0.0,0.36,u_hover);
    gl_FragColor=vec4(min(glit+bands+spec,vec3(0.75)),1.0);
  }
`;

/* ── 2) IRIS — anneaux prismatiques arc-en-ciel ── */
const FRAG_IRIS = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time; uniform vec2 u_mouse; uniform float u_hover; uniform float u_aspect;
  vec3 hsv2rgb(float h,float s,float v){vec3 c=clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0);return v*mix(vec3(1),c,s);}
  float hash(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+45.32);return fract(p.x*p.y);}
  float star(vec2 uv,float r){vec2 a=abs(uv);return 1.0-smoothstep(0.0,r,mix(max(a.x,a.y),(a.x+a.y)*0.707,0.4));}
  void main(){
    vec2 uv=v_uv; vec2 tilt=u_mouse-0.5;
    // Iris rings centred on cursor
    vec2 light=tilt*0.55+0.5;
    vec2 d=(uv-light)*vec2(u_aspect,1.0);
    float dist=length(d);
    float angle=atan(d.y,d.x);
    float ringPh=dist*mix(8.0,18.0,u_hover)-u_time*0.5;
    float ringMask=pow(max(0.0,sin(ringPh*3.14159)),1.4);
    float hue=fract(angle/6.28318+dist*0.6+u_time*0.07+length(tilt)*0.6);
    vec3 irisCol=hsv2rgb(hue,0.94,1.0)*ringMask;
    float falloff=smoothstep(0.0,0.12,dist)*smoothstep(1.1,0.2,dist);
    vec3 iris=irisCol*falloff*mix(0.07,0.42,u_hover);
    // Micro-sparkles permanent
    float cR=75.0; vec2 sUV=uv*vec2(u_aspect,1.0)*cR; vec2 cell=floor(sUV); vec2 cUV=fract(sUV)-0.5;
    float h0=hash(cell),h1=hash(cell+vec2(5.2,1.3));
    float flicker=pow(max(0.0,sin(h0*628.3+u_time*(0.8+h1*3.5))),9.0);
    float shape=star(cUV,0.09);
    vec3 glit=vec3(1.0,0.96,0.92)*step(0.70,h0)*flicker*shape*0.6;
    gl_FragColor=vec4(min(iris+glit,vec3(0.75)),1.0);
  }
`;

/* ── 3) CONSTELLATION — champ d'étoiles bleu-blanc ── */
const FRAG_CONSTELLATION = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time; uniform vec2 u_mouse; uniform float u_hover; uniform float u_aspect;

  float hash(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+45.32);return fract(p.x*p.y);}
  float hash1(float n){return fract(sin(n)*43758.5);}

  // Forme en croix 4 branches (étoile de carte)
  float starShape(vec2 d,float r){
    vec2 a=abs(d);
    float cross4=exp(-( min(a.x,a.y)*3.0+max(a.x,a.y) )*( min(a.x,a.y)*3.0+max(a.x,a.y) )*180.0);
    float spot=exp(-dot(d,d)/(r*r));
    return max(spot,cross4);
  }

  void main(){
    vec2 uv=v_uv; vec2 tilt=u_mouse-0.5;
    vec2 asp=vec2(u_aspect,1.0);

    // ── A) GRANDES ÉTOILES avec parallaxe ──────────────────────
    vec2 pUV=uv+tilt*mix(0.008,0.032,u_hover);
    float cR=14.0; vec2 sUV=pUV*asp*cR; vec2 cell=floor(sUV);
    float totalGlow=0.0;
    vec3  totalCol =vec3(0.0);
    for(int ix=-1;ix<=1;ix++){
      for(int iy=-1;iy<=1;iy++){
        vec2 nb=cell+vec2(float(ix),float(iy));
        float h0=hash(nb);
        if(h0>=0.50){
          float h1=hash(nb+99.1),h2=hash(nb+198.2),h3=hash(nb+300.7);
          vec2 starPos=nb+0.5+vec2(h1-0.5,h2-0.5)*0.65;
          vec2 delta=sUV-starPos;
          float d=length(delta);
          float sz=mix(0.012,0.13,h0*h0);

          // Scintillement rapide : sin^8 → éclair bref suivi d'une pause
          float twinkleFreq=1.5+h0*4.5;
          float twinkle=pow(max(0.0,sin(h0*400.0+u_time*twinkleFreq)),6.0);
          // Lueur de fond constante (étoile toujours légèrement visible)
          float baseBright=0.18+0.22*h0;
          float bright=baseBright+twinkle*(0.6+0.4*h0);

          float radial=exp(-d*d/(sz*sz))*bright;
          // Flare en croix uniquement sur les brillantes
          float spike=0.0;
          if(h0>0.75){
            float twinkleBig=pow(max(0.0,sin(h0*400.0+u_time*(1.2+h0*3.0))),4.0);
            spike=starShape(delta,sz*0.6)*(h0-0.75)*6.0*(0.3+0.7*twinkleBig);
          }
          float g=radial+spike;
          // Teinte : blanc-bleu froid (h3<0.5) ou blanc-or chaud (h3>=0.5)
          vec3 starHue=mix(vec3(0.55,0.78,1.0),vec3(1.0,0.96,0.70),step(0.5,h3));
          totalCol+=starHue*g;
          totalGlow+=g;
        }
      }
    }

    // ── B) COUCHE MICRO-SCINTILLEMENTS denses (parallaxe léger) ─
    vec2 pUV2=uv+tilt*mix(0.003,0.015,u_hover);
    float mR=55.0; vec2 mUV=pUV2*asp*mR; vec2 mCell=floor(mUV); vec2 mFrac=fract(mUV)-0.5;
    float microGlit=0.0;
    for(int mx2=-1;mx2<=1;mx2++){
      for(int my2=-1;my2<=1;my2++){
        vec2 mn=mCell+vec2(float(mx2),float(my2));
        float mh=hash(mn);
        if(mh>0.62){
          float mh1=hash(mn+vec2(7.3,2.1)),mh2=hash(mn+vec2(1.7,8.4));
          vec2 mOff=mn+0.5+vec2(mh1-0.5,mh2-0.5)*0.7;
          vec2 md=mUV-mOff;
          // Flash très bref : sin à haute fréquence, exposant élevé
          float mFlash=pow(max(0.0,sin(mh*628.3+u_time*(2.0+mh1*6.0))),10.0);
          float mSpot=exp(-dot(md,md)/(0.055*0.055));
          microGlit+=mSpot*mFlash*step(0.62,mh);
        }
      }
    }
    vec3 microCol=vec3(0.75,0.88,1.0)*microGlit*0.65;

    // ── C) LIGNES DE CONSTELLATION (hover) ─────────────────────
    float lineGlow=0.0;
    for(int ix2=-1;ix2<=1;ix2++){
      for(int iy2=-1;iy2<=1;iy2++){
        vec2 nb2=cell+vec2(float(ix2),float(iy2));
        float hA=hash(nb2);
        if(hA>=0.75){
          float hB=hash(nb2+vec2(0.5,0.0));
          vec2 a2=nb2+0.5+vec2(hash(nb2+99.1)-0.5,hash(nb2+198.2)-0.5)*0.65;
          vec2 b2=nb2+vec2(1.0,0.0)+0.5+vec2(hash(nb2+vec2(1,0)+99.1)-0.5,hash(nb2+vec2(1,0)+198.2)-0.5)*0.65;
          if(hB>=0.75){
            vec2 ab=b2-a2; float t2=clamp(dot(sUV-a2,ab)/dot(ab,ab),0.0,1.0);
            float ld=length(sUV-a2-ab*t2);
            lineGlow+=exp(-ld*ld*450.0)*0.38*mix(0.0,1.0,u_hover);
          }
        }
      }
    }

    // ── D) HALO GLOBAL subtil réactif au survol ─────────────────
    float haloBright=mix(0.0,0.08,u_hover);
    vec3 halo=vec3(0.3,0.55,1.0)*haloBright;

    vec3 col=
      min(totalCol*0.72,vec3(0.70))       // grandes étoiles
     +microCol                             // micro-scintillements
     +vec3(0.4,0.6,1.0)*min(lineGlow,0.32) // lignes
     +halo;

    gl_FragColor=vec4(min(col,vec3(0.80)),1.0);
  }
`;

/* ── 4) CHROMATIC — aberration chromatique R/G/B ── */
const FRAG_CHROMATIC = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time; uniform vec2 u_mouse; uniform float u_hover; uniform float u_aspect;
  float hash(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+45.32);return fract(p.x*p.y);}
  float glitLum(vec2 uv2){
    float cR=65.0; vec2 sUV=uv2*vec2(u_aspect,1.0)*cR; vec2 cell=floor(sUV); vec2 cUV=fract(sUV)-0.5;
    float h0=hash(cell),h1=hash(cell+vec2(5.2,1.3));
    float flicker=pow(max(0.0,sin(h0*628.3+u_time*(0.8+h1*3.5))),9.0);
    vec2 a=abs(cUV); float d=mix(max(a.x,a.y),(a.x+a.y)*0.707,0.4);
    return step(0.70,h0)*flicker*(1.0-smoothstep(0.0,0.10,d));
  }
  void main(){
    vec2 uv=v_uv; vec2 tilt=u_mouse-0.5;
    // Écart chromatique croît avec l'inclinaison + hover
    float offS=mix(0.004,0.018,u_hover)*(1.0+length(tilt)*1.5);
    vec2 offDir=normalize(tilt+vec2(0.001,0.0))*offS;
    // Canal R décalé +, G centré, B décalé -
    float r=glitLum(uv+offDir);
    float g=glitLum(uv);
    float b=glitLum(uv-offDir);
    // Bandes holo discrètes (hover)
    float ta=atan(tilt.y,tilt.x+0.0001); vec2 bd=vec2(-sin(ta+0.5),cos(ta+0.5));
    float ph=dot(uv*vec2(u_aspect,1.0),bd)*mix(3.5,7.0,u_hover)+u_time*mix(0.12,0.0,u_hover)+length(tilt)*4.0;
    float bStr=mix(0.04,0.22,u_hover)*pow(sin(ph*3.14159)*0.5+0.5,1.8);
    float bHue=fract(ph*0.38);
    vec3 hsvC=vec3(fract(bHue),fract(bHue+0.33),fract(bHue+0.67));
    gl_FragColor=vec4(min(vec3(r,g,b)*0.88+hsvC*bStr,vec3(0.80)),1.0);
  }
`;

const FRAGS: Record<string, string> = {
  glitter: FRAG_GLITTER,
  iris: FRAG_IRIS,
  constellation: FRAG_CONSTELLATION,
  chromatic: FRAG_CHROMATIC,
};

/* ────── React component ────── */

type HoloEffectProps = {
  mx: number;
  my: number;
  active: boolean;
  variant?: "glitter" | "iris" | "constellation" | "chromatic";
};

export function HoloEffect({ mx, my, active, variant = "glitter" }: HoloEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef     = useRef<WebGLRenderingContext | null>(null);
  const progRef   = useRef<WebGLProgram | null>(null);
  const frameRef  = useRef<number>(0);
  const t0Ref     = useRef<number>(Date.now());
  const hoverRef  = useRef(0);
  const propsRef  = useRef({ mx, my, active });
  const [ready, setReady] = useState(false);

  propsRef.current = { mx, my, active };

  const initGL = useCallback((canvas: HTMLCanvasElement, frag: string) => {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return;
    glRef.current = gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    };
    const fs = mk(gl.FRAGMENT_SHADER, frag);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error("[HoloEffect]", gl.getShaderInfoLog(fs)); return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    progRef.current = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);
    setReady(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width  = rect.width  + "px";
      canvas.style.height = rect.height + "px";
      glRef.current?.viewport(0, 0, canvas.width, canvas.height);
    };
    initGL(canvas, FRAGS[variant] ?? FRAG_GLITTER);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    const loop = () => {
      frameRef.current = requestAnimationFrame(loop);
      const gl = glRef.current, prog = progRef.current;
      if (!gl || !prog) return;
      const { mx: pmx, my: pmy, active: pa } = propsRef.current;
      hoverRef.current += ((pa ? 1 : 0) - hoverRef.current) * 0.08;
      const t = (Date.now() - t0Ref.current) / 1000;
      const aspect = canvas.width / (canvas.height || 1);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(gl.getUniformLocation(prog, "u_time"),   t);
      gl.uniform2f(gl.getUniformLocation(prog, "u_mouse"),  pmx, pmy);
      gl.uniform1f(gl.getUniformLocation(prog, "u_hover"),  hoverRef.current);
      gl.uniform1f(gl.getUniformLocation(prog, "u_aspect"), aspect);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frameRef.current); ro.disconnect(); };
  }, [initGL, variant]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        borderRadius: "inherit", pointerEvents: "none", zIndex: 12,
        mixBlendMode: "screen", visibility: ready ? "visible" : "hidden",
      }}
    />
  );
}

