import { useEffect, useRef, useState } from "react";

/** Respeita a preferência do sistema por menos movimento. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const GLYPHS = "!<>-_\\/[]{}=+*^?#01ｱｲｳｴｵｶ";

/** Efeito "decode": embaralha o texto e revela da esquerda para a direita quando ele muda. */
export function useScramble(text: string, frames = 14, stepMs = 32): string {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(text);
  const first = useRef(true);

  useEffect(() => {
    if (reduced || first.current) {
      first.current = false;
      setDisplay(text);
      return;
    }
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      const revealed = Math.floor((frame / frames) * text.length);
      setDisplay(
        text
          .split("")
          .map((ch, i) =>
            i < revealed || ch === " " || ch === "," ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          )
          .join(""),
      );
      if (frame >= frames) {
        window.clearInterval(id);
        setDisplay(text);
      }
    }, stepMs);
    return () => window.clearInterval(id);
  }, [text, frames, stepMs, reduced]);

  return display;
}

/** Digita o texto caractere a caractere sempre que ele muda. */
export function useTypewriter(text: string, charMs = 14): { shown: string; done: boolean } {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);

  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          window.clearInterval(id);
          return c;
        }
        return c + 2;
      });
    }, charMs);
    return () => window.clearInterval(id);
  }, [text, charMs, reduced]);

  const shown = text.slice(0, count);
  return { shown, done: count >= text.length };
}

/** Liga uma flag por `ms` sempre que `key` muda (ex.: disparar glitch na troca de sinal). */
export function usePulse(key: unknown, ms = 700): boolean {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setOn(true);
    const id = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(id);
  }, [key, ms]);
  return on;
}
