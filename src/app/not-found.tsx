import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm border border-foreground p-8 text-center bg-background">
        <h1 className="text-xl font-black tracking-widest uppercase mb-4">404 • NOT FOUND</h1>
        <p className="text-xs text-muted-foreground uppercase font-mono mb-8 leading-6">
          THE SPECIFIED MARKDOWN DOCUMENT DOES NOT EXIST OR HAS BEEN DELETED BY THE ADMINISTRATOR.
        </p>
        <Link
          href="/"
          className="inline-block w-full py-3 bg-foreground text-background font-mono text-xs uppercase tracking-widest font-bold border border-foreground hover:bg-background hover:text-foreground active:bg-foreground active:text-background transition-colors duration-150"
        >
          RETURN TO WORKSPACE
        </Link>
      </div>
    </div>
  );
}
