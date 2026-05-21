import { supabaseServer } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CopyButton from './CopyButton';
import ThemeToggle from '../components/ThemeToggle';
import { Calendar, FileText, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ short_id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { short_id } = await params;
  const { data: fileMeta } = await supabaseServer
    .from('files')
    .select('file_name')
    .eq('short_id', short_id)
    .maybeSingle();

  if (!fileMeta) {
    return {
      title: 'File Not Found - Share your md note/file',
    };
  }

  const cleanName = fileMeta.file_name.replace(/\.md$/, '');
  return {
    title: `${cleanName} - Share your md note/file`,
  };
}

export default async function ReaderPage({ params }: PageProps) {
  const { short_id } = await params;

  // 1. Fetch file metadata
  const { data: fileMeta } = await supabaseServer
    .from('files')
    .select('*')
    .eq('short_id', short_id)
    .maybeSingle();

  if (!fileMeta) {
    notFound();
  }

  // 2. Fetch raw markdown content from storage
  const { data: fileBlob, error: storageError } = await supabaseServer.storage
    .from('md-files')
    .download(fileMeta.storage_path);

  if (storageError || !fileBlob) {
    console.error('Storage download error:', storageError);
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 bg-background">
        <div className="w-full max-w-md border border-red-500 bg-red-500/10 p-8 text-center text-red-500 font-mono text-xs uppercase">
          <h1 className="font-bold mb-4">CRITICAL ERROR</h1>
          <p className="mb-2">THE PHYSICAL MARKDOWN FILE COULD NOT BE RETRIEVED FROM PRIVATE STORAGE.</p>
          <p className="text-[10px] opacity-75">STORAGE PATH: {fileMeta.storage_path}</p>
        </div>
      </div>
    );
  }

  let markdownContent = '';
  try {
    markdownContent = await fileBlob.text();
  } catch (err) {
    console.error('Text decoding error:', err);
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 bg-background">
        <div className="w-full max-w-md border border-red-500 bg-red-500/10 p-8 text-center text-red-500 font-mono text-xs uppercase">
          <h1 className="font-bold mb-4 font-mono">DECODING ERROR</h1>
          <p>FAILED TO DECODE FILE BLOB INTO TEXT.</p>
        </div>
      </div>
    );
  }

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toISOString().split('T')[0];
    } catch (e) {
      return 'N/A';
    }
  };

  return (
    <div className="w-full min-h-screen bg-background">
      {/* Dynamic Reader Container */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        
        {/* Document Header */}
        <header className="space-y-6 mb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-foreground pb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                <FileText size={12} />
                <span>SHARED DOCUMENT</span>
              </div>
              <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight break-all">
                {fileMeta.file_name.replace(/\.md$/, '')}
              </h1>
              <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                <Calendar size={12} />
                <span>PUBLISHED: {formatDate(fileMeta.created_at)}</span>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-3">
              <ThemeToggle />
              <CopyButton />
            </div>
          </div>
        </header>

        {/* Prose Body */}
        <main className="pb-16">
          <article className="prose prose-zinc dark:prose-invert max-w-none font-sans leading-relaxed selection:bg-foreground selection:text-background
            prose-headings:font-mono prose-headings:uppercase prose-headings:tracking-tight prose-headings:font-bold
            prose-h1:text-xl prose-h1:border-b prose-h1:border-foreground/10 prose-h1:pb-2
            prose-h2:text-lg
            prose-h3:text-sm
            prose-p:text-sm prose-p:text-foreground/90 prose-p:leading-8
            prose-a:underline prose-a:text-foreground prose-a:font-mono prose-a:text-xs prose-a:hover:text-muted-foreground transition-colors
            prose-code:font-mono prose-code:text-xs prose-code:bg-foreground/[0.04] prose-code:dark:bg-foreground/[0.08] prose-code:px-1.5 prose-code:py-0.5 prose-code:border prose-code:border-foreground/15 prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-foreground/[0.03] prose-pre:dark:bg-foreground/[0.06] prose-pre:border prose-pre:border-foreground/15 prose-pre:p-4 prose-pre:rounded-none prose-pre:overflow-x-auto
            prose-pre:code:bg-transparent prose-pre:code:border-none prose-pre:code:p-0 prose-pre:code:px-0 prose-pre:code:py-0
            prose-ol:font-mono prose-ol:text-xs
            prose-ul:list-square prose-ul:text-sm
            prose-li:my-1
            prose-blockquote:border-l-2 prose-blockquote:border-foreground prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground
            prose-table:border-collapse prose-table:w-full prose-table:text-xs prose-table:font-mono
            prose-th:border-b prose-th:border-foreground/30 prose-th:py-2 prose-th:px-3 prose-th:font-bold
            prose-td:border-b prose-td:border-foreground/10 prose-td:py-2 prose-td:px-3
          ">
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
                }
              }}
            >
              {markdownContent}
            </ReactMarkdown>
          </article>
        </main>

        {/* Dynamic Reader Footer */}
        <footer className="border-t border-foreground/15 pt-8 text-center">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            POWERED BY MD SHARE SITE • SECURED STORAGE BUCKETS
          </p>
        </footer>
      </div>
    </div>
  );
}
