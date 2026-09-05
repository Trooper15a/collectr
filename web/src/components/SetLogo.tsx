"use client";

import { useState } from "react";

export function SetLogo({ id, code, className = "w-12 h-8" }: { id: string; code: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`${className} rounded-md bg-white/[0.05] border border-line flex items-center justify-center text-[9px] font-bold text-muted uppercase`}>{code.slice(0, 5)}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/sets/${encodeURIComponent(id)}/image`} alt="" loading="lazy" className={`${className} object-contain`} onError={() => setFailed(true)} />;
}
