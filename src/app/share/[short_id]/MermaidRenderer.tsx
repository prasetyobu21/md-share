'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MermaidInstance {
  initialize: (config: Record<string, unknown>) => void;
  render: (
    id: string,
    text: string,
    container?: Element
  ) => Promise<{ svg: string }>;
}

// Dynamically load mermaid only on the client side
let mermaidPromise: Promise<MermaidInstance> | null = null;
function getMermaid(): Promise<MermaidInstance> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mermaid = (m.default || m) as MermaidInstance;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

interface MermaidRendererProps {
  chart: string;
}

export default function MermaidRenderer({ chart }: MermaidRendererProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync theme and observe changes to document.documentElement's class list
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };

    checkTheme();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          checkTheme();
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    // Unique ID for each render to avoid conflicts in DOM
    const id = `mermaid-${Math.floor(Math.random() * 10000000)}`;

    async function renderChart() {
      try {
        setError(null);
        const mermaid = await getMermaid();
        const isDark = theme === 'dark';

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
          // Customize the look to make it premium and clean
          themeVariables: isDark
            ? {
                background: '#18181b', // zinc-900
                primaryColor: '#27272a', // zinc-800
                primaryTextColor: '#f4f4f5', // zinc-100
                primaryBorderColor: '#3f3f46', // zinc-700
                lineColor: '#a1a1aa', // zinc-400
                secondaryColor: '#27272a',
                tertiaryColor: '#27272a',
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
              }
            : {
                background: '#ffffff',
                primaryColor: '#f4f4f5', // zinc-100
                primaryTextColor: '#09090b', // zinc-950
                primaryBorderColor: '#e4e4e7', // zinc-200
                lineColor: '#71717a', // zinc-500
                secondaryColor: '#f4f4f5',
                tertiaryColor: '#f4f4f5',
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
              },
        });

        const { svg: renderedSvg } = await mermaid.render(id, chart);
        
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err: unknown) {
        console.error('Mermaid render error:', err);
        if (isMounted) {
          const errMsg = err instanceof Error ? err.message : String(err);
          setError(errMsg || 'Failed to render Mermaid chart');
        }
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, theme]);

  if (error) {
    return (
      <div className="p-4 my-4 border border-red-500/30 bg-red-500/5 text-red-500 font-mono text-xs overflow-x-auto rounded-none">
        <p className="font-bold mb-1 uppercase tracking-wider text-[10px]">Mermaid Syntax Error</p>
        <pre className="whitespace-pre-wrap leading-relaxed">{error}</pre>
        <details className="mt-2 opacity-70 cursor-pointer">
          <summary className="hover:underline text-[10px] uppercase tracking-wider">Show Chart Source</summary>
          <pre className="mt-1.5 p-2 bg-red-500/10 whitespace-pre-wrap">{chart}</pre>
        </details>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-8 my-4 border border-foreground/10 bg-foreground/[0.01] animate-pulse">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Rendering Chart...</span>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      <style>{`
        .mermaid-container * {
          line-height: 1.25 !important;
        }
        .mermaid-container svg {
          max-width: 100% !important;
          height: auto !important;
        }
        .mermaid-container foreignObject {
          overflow: visible !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className="not-prose mermaid-container flex justify-center p-6 my-6 border border-foreground/10 bg-foreground/[0.01] dark:bg-foreground/[0.02] overflow-x-auto rounded-none w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
