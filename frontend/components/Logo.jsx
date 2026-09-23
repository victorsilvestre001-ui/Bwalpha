import Link from "next/link";

export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="tradeon-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00F0A8" />
          <stop offset="1" stopColor="#3D8BFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0A0F1E" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke="url(#tradeon-g)" strokeWidth="2" opacity=".55" />
      <path d="M14 42 L26 30 L34 36 L50 20" fill="none" stroke="url(#tradeon-g)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="20" r="4.5" fill="#00F0A8" />
    </svg>
  );
}

export default function Logo({ href = "/", size = 32 }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-display text-lg font-bold tracking-tight text-mist">
        Trade<span className="grad-text">On</span> <span className="text-mist-dim font-semibold">AI</span>
      </span>
    </Link>
  );
}
