import { supabaseServer } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CopyButton from './CopyButton';
import ThemeToggle from '../components/ThemeToggle';
import { Calendar, FileText, ExternalLink } from 'lucide-react';
import { isAuthenticated } from '../actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ short_id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { short_id } = await params;
  const { data: fileMeta } = await supabaseServer
    .from('files')
    .select('file_name, is_accessible, expires_at')
    .eq('short_id', short_id)
    .maybeSingle();

  if (!fileMeta) {
    return {
      title: 'File Not Found - Share your md note/file',
    };
  }

  const adminAuth = await isAuthenticated();
  const isAccessible = fileMeta.is_accessible;
  const expiresAt = fileMeta.expires_at;
  const hasExpired = expiresAt ? new Date().getTime() > new Date(expiresAt).getTime() : false;

  if (!adminAuth && (!isAccessible || hasExpired)) {
    return {
      title: 'Access Restricted - Share your md note/file',
    };
  }

  const cleanName = fileMeta.file_name.replace(/\.md$/, '');
  return {
    title: `${cleanName} - Share your md note/file`,
  };
}

const formatTakedownTime = (utcString: string, tzString: string) => {
  try {
    const d = new Date(utcString);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    };
    
    const TIMEZONES = [
      { value: 'GMT+7', offset: 7 },
      { value: 'GMT+8', offset: 8 },
      { value: 'GMT+9', offset: 9 },
      { value: 'GMT+0', offset: 0 },
      { value: 'GMT-5', offset: -5 },
      { value: 'GMT-8', offset: -8 },
    ];
    
    const tz = TIMEZONES.find(t => t.value === tzString) || { offset: 7 };
    const offsetMs = tz.offset * 60 * 60 * 1000;
    const adjustedDate = new Date(d.getTime() + offsetMs);
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(adjustedDate);
    
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    const minute = parts.find(p => p.type === 'minute')?.value;
    
    return `${day} ${month} ${year} AT ${hour}:${minute} (${tzString})`;
  } catch (e) {
    return 'N/A';
  }
};

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

  // 1b. Check if access is restricted
  const adminAuth = await isAuthenticated();
  const isAccessible = fileMeta.is_accessible;
  const expiresAt = fileMeta.expires_at;
  const hasExpired = expiresAt ? new Date().getTime() > new Date(expiresAt).getTime() : false;

  if (!adminAuth && (!isAccessible || hasExpired)) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 bg-background font-mono">
        <div className="w-full max-w-lg border-2 border-foreground bg-background p-8 text-center text-foreground rounded-none">
          <h1 className="text-sm font-black uppercase tracking-widest mb-4">ACCESS RESTRICTED</h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground leading-relaxed">
            This link is no longer active. If you need access to this file, please request a new share link from the owner.
          </p>
        </div>
      </div>
    );
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
                {(!isAccessible || hasExpired) && (
                  <span className="px-2 py-0.5 border border-foreground text-[10px] font-bold bg-foreground text-background shrink-0 select-none">ADMIN PREVIEW</span>
                )}
              </div>
              <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight break-all">
                {fileMeta.file_name.replace(/\.md$/, '')}
              </h1>
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  <Calendar size={12} />
                  <span>PUBLISHED: {formatDate(fileMeta.created_at)}</span>
                </div>
                {fileMeta.expires_at && (
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    <span className={`w-1.5 h-1.5 rounded-none shrink-0 ${hasExpired ? 'bg-foreground/45 animate-none' : 'bg-foreground animate-pulse'}`} />
                    <span>
                      {hasExpired 
                        ? `LINK EXPIRED ON: ${formatTakedownTime(fileMeta.expires_at, fileMeta.timezone || 'GMT+7')}`
                        : `You can access this file until: ${formatTakedownTime(fileMeta.expires_at, fileMeta.timezone || 'GMT+7')}`
                      }
                    </span>
                  </div>
                )}
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
