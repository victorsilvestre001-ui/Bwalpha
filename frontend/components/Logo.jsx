"use client";
import { useId } from "react";
import Link from "next/link";

export function LogoMark({ size = 32, tone = "lilac" }) {
  const [c1, c2, bg] = tone === "lilac" ? ["#B9A6FF", "#8B6CF6", "#121020"] : ["#00F0A8", "#3D8BFF", "#0A0F1E"];
  // id único por logo: com vários logos na página (um escondido), um id repetido faz o gradiente sumir.
  const gid = `tradeon-g-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={bg} />
      <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke={`url(#${gid})`} strokeWidth="2" opacity=".55" />
      <path d="M14 42 L26 30 L34 36 L50 20" fill="none" stroke={`url(#${gid})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="20" r="4.5" fill={c1} />
    </svg>
  );
}

export default function Logo({ href = "/", size = 32, tone = "lilac" }) {
  if (tone === "lilac") return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="TradeOn AI">
      <LogoMark size={size} tone="lilac" />
      <span className="font-tight text-lg font-semibold tracking-[-0.04em] text-white">
        Trade<span className="text-lilac">On</span> <span className="font-light italic text-white/60">AI</span>
      </span>
    </Link>
  );
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-display text-lg font-bold tracking-tight text-mist">
        Trade<span className="grad-text">On</span> <span className="text-mist-dim font-semibold">AI</span>
      </span>
    </Link>
  );
}
