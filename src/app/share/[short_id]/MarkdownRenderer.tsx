'use client';

import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';

interface MarkdownRendererProps {
  markdownContent: string;
  shortId: string;
}

export default function MarkdownRenderer({ markdownContent, shortId }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Select all interactive checkboxes
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const listeners: Array<{ element: HTMLInputElement; handler: (e: Event) => void }> = [];

    checkboxes.forEach((element, index) => {
      const checkbox = element as HTMLInputElement;
      const key = `checkbox-state-${shortId}-${index}`;

      // 1. Load state from sessionStorage
      const savedState = sessionStorage.getItem(key);
      if (savedState !== null) {
        checkbox.checked = savedState === 'true';
      }

      // 2. Native change handler to persist checkbox state
      const handleChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        sessionStorage.setItem(key, target.checked ? 'true' : 'false');
      };

      checkbox.addEventListener('change', handleChange);
      listeners.push({ element: checkbox, handler: handleChange });
    });

    // Cleanup event listeners on unmount or when markdownContent/shortId changes
    return () => {
      listeners.forEach(({ element, handler }) => {
        element.removeEventListener('change', handler);
      });
    };
  }, [markdownContent, shortId]);

  return (
    <div ref={containerRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 hover:text-muted-foreground transition-colors"
                {...props}
              >
                {children}
                <ExternalLink size={10} className="inline shrink-0 opacity-80" />
              </a>
            );
          },
          input: ({ node, ...props }) => {
            if (node) { /* no-op to bypass unused warning */ }
            if (props.type === 'checkbox') {
              const { checked, ...rest } = props;
              return (
                <label className="inline-flex items-center cursor-pointer select-none align-middle mr-2 group">
                  {/* The actual native input, visually hidden but fully accessible and queried by useEffect */}
                  <input
                    {...rest}
                    defaultChecked={checked}
                    disabled={false}
                    className="peer sr-only"
                  />
                  {/* Custom styled checkbox with rounded corners and smooth hover border transition */}
                  <span className="w-4 h-4 flex items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-background transition-all duration-150 rounded-[4px]! group-hover:border-zinc-500 dark:group-hover:border-zinc-500 peer-checked:bg-blue-600! peer-checked:border-blue-600! peer-checked:[&>svg]:scale-100">
                    <svg
                      className="w-2.5 h-2.5 text-white scale-0 transition-transform duration-150 ease-in-out"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                </label>
              );
            }
            return <input {...props} />;
          },
          li: ({ node, children, ...props }) => {
            if (node) { /* no-op to bypass unused warning */ }
            // Check if any child is a GFM task list checkbox
            const hasCheckbox = React.Children.toArray(children).some(
              (child) =>
                React.isValidElement(child) &&
                child.type === 'input' &&
                (child.props as { type?: string }).type === 'checkbox'
            );

            return (
              <li
                className={hasCheckbox ? '!list-none ![display:block] -ml-6 my-1' : 'my-1'}
                {...props}
              >
                {children}
              </li>
            );
          }
        }}
      >
        {markdownContent}
      </ReactMarkdown>
    </div>
  );
}
