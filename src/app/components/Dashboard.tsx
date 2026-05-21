'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { uploadMarkdownFile, deleteMarkdownFile, logout, finalizeUploadWithImages } from '../actions';
import { LogOut, Copy, Check, Trash2, FileText, Upload, ExternalLink, X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
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

  // Missing images intercept state
  const [missingImagesModalOpen, setMissingImagesModalOpen] = useState(false);
  const [missingImagesList, setMissingImagesList] = useState<string[]>([]);
  const [providedImages, setProvidedImages] = useState<Record<string, File>>({});
  const [interceptedFileMeta, setInterceptedFileMeta] = useState<{
    shortId: string;
    markdownContent: string;
    fileName: string;
  } | null>(null);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: any[]) => {
    console.log('Client: onDrop triggered.', { acceptedFiles, fileRejections });

    if (fileRejections.length > 0) {
      const errorMsg = `FILE REJECTED: ${fileRejections[0].errors[0]?.message || 'Invalid file type'}. ONLY .MD FILES ARE ALLOWED.`;
      console.warn('Client: File drop rejected:', errorMsg);
      setUploadError(errorMsg.toUpperCase());
      return;
    }

    if (acceptedFiles.length === 0) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      console.log('Client: Uploading markdown file:', file.name);
      const res = await uploadMarkdownFile(formData);
      console.log('Client: Server response received:', res);

      if (res.success) {
        setUploadSuccess(`SUCCESSFULLY UPLOADED: ${file.name}`);
      } else if (res.status === 'missing_images') {
        console.log('Client: Intercepted missing images:', res.missingImages);
        if (res.missingImages && res.shortId && typeof res.markdownContent === 'string' && res.fileName) {
          setMissingImagesList(res.missingImages);
          setInterceptedFileMeta({
            shortId: res.shortId,
            markdownContent: res.markdownContent,
            fileName: res.fileName
          });
          setProvidedImages({});
          setMissingImagesModalOpen(true);
        } else {
          console.warn('Client: Intercepted missing_images but some metadata fields were missing or invalid:', res);
          setUploadError(`UPLOAD INTERCEPTED BUT RESPONSE METADATA WAS INCOMPLETE.`);
        }
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
      'text/plain': ['.md'],
      'text/x-markdown': ['.md'],
      'application/octet-stream': ['.md'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  const handleSelectImageForSlot = (imgName: string, file: File) => {
    setProvidedImages(prev => ({
      ...prev,
      [imgName]: file
    }));
  };

  const handleRemoveImageForSlot = (imgName: string) => {
    setProvidedImages(prev => {
      const next = { ...prev };
      delete next[imgName];
      return next;
    });
  };

  const handleCancelUpload = () => {
    setMissingImagesModalOpen(false);
    setMissingImagesList([]);
    setProvidedImages({});
    setInterceptedFileMeta(null);
    setUploadError('');
  };

  const handleFinalizeUpload = async () => {
    if (!allImagesProvided || !interceptedFileMeta) return;

    setImagesUploading(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      const formData = new FormData();
      formData.append('shortId', interceptedFileMeta.shortId);
      formData.append('fileName', interceptedFileMeta.fileName);
      formData.append('markdownContent', interceptedFileMeta.markdownContent);

      // Map provided images to their expected slot name in the formData payload!
      Object.entries(providedImages).forEach(([requiredName, file]) => {
        const renamedFile = new File([file], requiredName, { type: file.type });
        formData.append('images', renamedFile);
      });

      const res = await finalizeUploadWithImages(formData);
      if (res.success) {
        setUploadSuccess(`SUCCESSFULLY UPLOADED: ${interceptedFileMeta.fileName} WITH ${Object.keys(providedImages).length} IMAGES`);
        setMissingImagesModalOpen(false);
        setProvidedImages({});
        setInterceptedFileMeta(null);
      } else {
        setUploadError(`UPLOAD FAILED: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setUploadError(`ERROR: ${err?.message || 'An error occurred during upload'}`);
    } finally {
      setImagesUploading(false);
    }
  };

  const allImagesProvided = missingImagesList.every(imgName =>
    !!providedImages[imgName]
  );

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

      {/* Missing Images Modal */}
      {missingImagesModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border-2 border-foreground p-8 max-w-lg w-full rounded-none font-mono text-xs uppercase relative space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-foreground pb-4">
              <div className="space-y-1">
                <h3 className="text-sm font-black tracking-widest flex items-center gap-2">
                  <AlertTriangle className="text-amber-500 animate-pulse" size={16} />
                  INTERCEPTED: MISSING IMAGES
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Your markdown file references local images that must be uploaded.
                </p>
              </div>
              <button
                onClick={handleCancelUpload}
                className="p-1 border border-foreground/20 hover:border-foreground hover:bg-foreground hover:text-background transition-colors cursor-pointer"
                title="Cancel upload"
              >
                <X size={14} />
              </button>
            </div>

            {/* Missing Files Checklist Slots */}
            <div className="space-y-4">
              <span className="font-bold tracking-widest text-[11px] block border-b border-foreground/15 pb-2">
                / RESOLVE REQUIRED ASSET SLOTS ({Object.keys(providedImages).length} OF {missingImagesList.length} READY)
              </span>
              
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {missingImagesList.map((imgName, index) => {
                  const providedFile = providedImages[imgName];
                  const isDragOver = dragOverSlot === imgName;
                  
                  return (
                    <div
                      key={imgName}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverSlot(imgName);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setDragOverSlot(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverSlot(null);
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          handleSelectImageForSlot(imgName, file);
                        }
                      }}
                      className={`border p-3.5 transition-all duration-150 rounded-none relative flex flex-col gap-3 ${
                        providedFile
                          ? 'border-foreground bg-foreground/[0.01]'
                          : isDragOver
                          ? 'border-foreground bg-foreground/5 scale-[1.01]'
                          : 'border-foreground/20 text-muted-foreground border-dashed hover:border-foreground/50'
                      }`}
                    >
                      {/* Slot Header */}
                      <div className="flex justify-between items-center font-mono">
                        <span className="font-bold text-[10px] tracking-wider flex items-center gap-2">
                          <span className="bg-foreground text-background w-4 h-4 flex items-center justify-center font-bold text-[9px] rounded-none">
                            {index + 1}
                          </span>
                          SLOT: <span className="underline select-all text-foreground font-black">{imgName}</span>
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${providedFile ? 'text-foreground font-black' : 'text-muted-foreground/70'}`}>
                          {providedFile ? '✓ READY' : '✗ MISSING'}
                        </span>
                      </div>

                      {/* Slot Body */}
                      {providedFile ? (
                        <div className="flex items-center justify-between bg-foreground/5 p-2 border border-foreground/20 font-mono text-[10px] text-foreground">
                          <span className="truncate flex items-center gap-2 pr-4">
                            <ImageIcon size={12} className="shrink-0" />
                            <span className="font-bold truncate">{providedFile.name}</span>
                            <span className="text-[8px] text-muted-foreground shrink-0 uppercase">
                              ({(providedFile.size / 1024).toFixed(1)} KB)
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveImageForSlot(imgName)}
                            className="text-[8px] font-bold border border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white px-2 py-1 transition-all cursor-pointer shrink-0 uppercase rounded-none"
                          >
                            REMOVE
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            const el = document.getElementById(`file-input-${imgName}`);
                            if (el) (el as HTMLInputElement).click();
                          }}
                          className="group cursor-pointer p-3 border border-foreground/5 hover:border-foreground/30 bg-foreground/[0.005] hover:bg-foreground/[0.02] transition-all text-center flex flex-col items-center justify-center gap-1"
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id={`file-input-${imgName}`}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleSelectImageForSlot(imgName, file);
                              }
                            }}
                          />
                          <Upload size={14} className="text-muted-foreground/60 group-hover:text-foreground transition-colors stroke-[1.5]" />
                          <p className="text-[9px] text-muted-foreground/70 group-hover:text-foreground transition-colors font-mono uppercase font-bold tracking-wider">
                            DROP IMAGE OR CLICK TO BROWSE FOR SLOT {index + 1}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-4 pt-2">
              <button
                onClick={handleCancelUpload}
                className="flex-1 py-3 border border-foreground/30 hover:border-foreground transition-all uppercase tracking-wider text-[10px] font-bold cursor-pointer rounded-none text-center"
              >
                CANCEL
              </button>
              <button
                onClick={handleFinalizeUpload}
                disabled={!allImagesProvided || imagesUploading}
                className={`flex-1 py-3 border uppercase tracking-wider text-[10px] font-bold cursor-pointer rounded-none text-center transition-all ${
                  allImagesProvided && !imagesUploading
                    ? 'border-foreground bg-foreground text-background hover:bg-background hover:text-foreground'
                    : 'border-foreground/20 text-muted-foreground opacity-50 cursor-not-allowed'
                }`}
              >
                {imagesUploading ? 'FINALIZING...' : 'FINALIZE UPLOAD'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
