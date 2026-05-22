'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function CopyButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center gap-1.5 h-[36px] px-4 border border-foreground/30 hover:border-foreground hover:bg-foreground hover:text-background transition-all uppercase tracking-wider text-[10px] font-bold cursor-pointer"
    >
      {copied ? (
        <>
          <Check size={10} />
          COPIED
        </>
      ) : (
        <>
          <Copy size={10} />
          COPY LINK
        </>
      )}
    </button>
  );
}
