'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { uploadMarkdownFile, deleteMarkdownFile, logout } from '../actions';
import { LogOut, Copy, Check, Trash2, FileText, Upload, ExternalLink } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface FileRecord {
  id: string;
  short_id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
}

interface DashboardProps {
  files: FileRecord[];
}

export default function Dashboard({ files }: DashboardProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await uploadMarkdownFile(formData);
      if (res.success) {
        setUploadSuccess(`SUCCESSFULLY UPLOADED: ${file.name}`);
      } else {
        setUploadError(`UPLOAD FAILED: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setUploadError(`ERROR: ${err?.message || 'An error occurred during upload'}`);
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  const handleCopyLink = (shortId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${origin}/${shortId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(shortId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string, storagePath: string) => {
    if (deletingId) return;
    if (!confirm('CONFIRM DELETE: THIS OPERATION CANNOT BE UNDONE.')) return;

    setDeletingId(id);
    try {
      const res = await deleteMarkdownFile(id, storagePath);
      if (!res.success) {
        alert(`DELETE FAILED: ${res.error}`);
      }
    } catch (err: any) {
      alert(`DELETE ERROR: ${err?.message || 'An error occurred'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toISOString().split('T')[0];
    } catch (e) {
      return 'N/A';
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-12 flex-1 flex flex-col justify-start">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-foreground pb-6 mb-12">
        <div>
          <h1 className="text-2xl font-black tracking-widest uppercase">MD SHARE SITE</h1>
          <p className="text-xs text-muted-foreground uppercase font-mono mt-1">Stark Minimalist Workspace</p>
        </div>
        <div className="flex items-center gap-4 animate-fade-in">
          <ThemeToggle />
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 px-4 py-2 border border-foreground/30 hover:border-foreground hover:bg-foreground hover:text-background transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <LogOut size={14} />
            LOGOUT
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="space-y-12">
        {/* Upload Zone */}
        <div className="space-y-4">
          <h2 className="text-xs uppercase font-bold tracking-widest font-mono">
            / UPLOAD WORKSPACE
          </h2>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-150 ${
              isDragActive
                ? 'border-foreground bg-foreground/5'
                : 'border-foreground/30 hover:border-foreground hover:bg-foreground/[0.02]'
            } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center space-y-4">
              <Upload size={32} className="text-foreground/75 stroke-[1.5]" />
              {uploading ? (
                <p className="text-xs font-mono uppercase tracking-wider animate-pulse">
                  UPLOADING FILE... PLEASE WAIT
                </p>
              ) : isDragActive ? (
                <p className="text-xs font-mono uppercase tracking-wider text-foreground">
                  DROP THE MARKDOWN FILE HERE...
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-mono uppercase tracking-wider font-bold">
                    DRAG & DROP A .MD FILE HERE
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    OR CLICK TO BROWSE LOCAL FILES
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Upload Status Feedback */}
          {uploadError && (
            <div className="border border-red-500 bg-red-500/10 text-red-500 text-xs font-mono uppercase px-4 py-3">
              {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div className="border border-foreground bg-foreground/5 text-foreground text-xs font-mono uppercase px-4 py-3">
              {uploadSuccess}
            </div>
          )}
        </div>

        {/* Listings */}
        <div className="space-y-4">
          <div className="flex justify-between items-end border-b border-foreground/15 pb-2">
            <h2 className="text-xs uppercase font-bold tracking-widest font-mono">
              / UPLOADED FILES ({files.length})
            </h2>
            <span className="text-[10px] text-muted-foreground uppercase font-mono">
              ORDERED BY CREATED DATE
            </span>
          </div>

          {files.length === 0 ? (
            <div className="border border-dashed border-foreground/20 p-12 text-center text-xs text-muted-foreground uppercase font-mono">
              NO FILES HAVE BEEN SHARED YET. UPLOAD A FILE ABOVE TO BEGIN.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono border-collapse text-xs">
                <thead>
                  <tr className="border-b border-foreground/30 text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">File Name</th>
                    <th className="py-3 px-4 font-bold w-32">Created At</th>
                    <th className="py-3 px-4 text-right font-bold w-48">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {files.map((file) => (
                    <tr
                      key={file.id}
                      className="hover:bg-foreground/[0.01] transition-colors group"
                    >
                      <td className="py-4 px-4 font-medium flex items-center gap-2 max-w-xs md:max-w-md truncate">
                        <FileText size={14} className="shrink-0 text-muted-foreground" />
                        <Link
                          href={`/${file.short_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/link inline-flex items-center gap-1.5 truncate hover:underline text-foreground/80 group-hover:text-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Open shared document in new tab"
                        >
                          <span className="truncate">{file.file_name}</span>
                          <ExternalLink size={12} className="opacity-0 group-hover/link:opacity-100 transition-opacity text-muted-foreground shrink-0" />
                        </Link>
                      </td>
                      <td className="py-4 px-4 text-muted-foreground">
                        {formatDate(file.created_at)}
                      </td>
                      <td className="py-4 px-4 shrink-0">
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            onClick={() => handleCopyLink(file.short_id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-foreground/25 hover:border-foreground hover:bg-foreground hover:text-background transition-all uppercase tracking-wider text-[10px] font-bold cursor-pointer min-w-[100px] justify-center"
                          >
                            {copiedId === file.short_id ? (
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
                          <button
                            onClick={() => handleDelete(file.id, file.storage_path)}
                            disabled={deletingId === file.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all uppercase tracking-wider text-[10px] font-bold disabled:opacity-50 cursor-pointer min-w-[100px] justify-center"
                          >
                            <Trash2 size={10} />
                            {deletingId === file.id ? 'DELETING...' : 'DELETE'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
