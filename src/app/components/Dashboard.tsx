'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { uploadMarkdownFile, deleteMarkdownFile, logout, takedownFile, updateSharingState } from '../actions';
import { LogOut, Copy, Check, Trash2, FileText, Upload, ExternalLink, X, ChevronRight } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface FileRecord {
  id: string;
  short_id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
  is_accessible: boolean;
  expires_at: string | null;
  timezone: string;
}

const TIMEZONES = [
  { label: 'GMT+7 (Bangkok, Jakarta, Hanoi)', value: 'GMT+7', offset: 7 },
  { label: 'GMT+8 (Singapore, Beijing, Manila)', value: 'GMT+8', offset: 8 },
  { label: 'GMT+9 (Tokyo, Seoul)', value: 'GMT+9', offset: 9 },
  { label: 'GMT+0 (UTC, London, Lisbon)', value: 'GMT+0', offset: 0 },
  { label: 'GMT-5 (New York, Toronto, EST)', value: 'GMT-5', offset: -5 },
  { label: 'GMT-8 (Los Angeles, PST)', value: 'GMT-8', offset: -8 },
];

interface DashboardProps {
  files: FileRecord[];
}

export default function Dashboard({ files }: DashboardProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [activeFile, setActiveFile] = useState<FileRecord | null>(null);
  const [modalStep, setModalStep] = useState<'select' | 'schedule' | 'success'>('select');
  
  // Schedule Form State
  const [expiresDate, setExpiresDate] = useState('');
  const [expiresTime, setExpiresTime] = useState('23:59');
  const [timezone, setTimezone] = useState('GMT+7');
  
  // Success Share URL State
  const [shareUrl, setShareUrl] = useState('');
  const [updatingState, setUpdatingState] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 2500);
  };

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

  const handleTakedown = async (id: string) => {
    try {
      const res = await takedownFile(id);
      if (!res.success) {
        alert(`TAKEDOWN FAILED: ${res.error}`);
      }
    } catch (err: any) {
      alert(`TAKEDOWN ERROR: ${err?.message || 'An error occurred'}`);
    }
  };

  const triggerShareModal = (file: FileRecord) => {
    setActiveFile(file);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setShareUrl(`${origin}/${file.short_id}`);
    
    // Reset inputs
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setExpiresDate(tomorrow.toISOString().split('T')[0]);
    setExpiresTime('23:59');
    setTimezone('GMT+7');
    
    setModalStep('select');
    setModalOpen(true);
  };

  const handleShareForever = async () => {
    if (!activeFile) return;
    setUpdatingState(true);
    try {
      const res = await updateSharingState(activeFile.id, true, null);
      if (res.success) {
        setModalStep('success');
      } else {
        alert(`FAILED TO ACTIVATE LINK: ${res.error}`);
      }
    } catch (err: any) {
      alert(`ERROR: ${err?.message || 'An error occurred'}`);
    } finally {
      setUpdatingState(false);
    }
  };

  const handleConfirmSchedule = async () => {
    if (!activeFile || !expiresDate) return;
    setUpdatingState(true);
    try {
      const localDateTimeStr = `${expiresDate}T${expiresTime}:00`;
      const selectedTz = TIMEZONES.find(t => t.value === timezone) || TIMEZONES[0];
      const offsetHours = selectedTz.offset;

      const sign = offsetHours >= 0 ? '+' : '-';
      const absOffset = Math.abs(offsetHours);
      const padOffset = String(absOffset).padStart(2, '0');
      const offsetString = `${sign}${padOffset}:00`;

      const isoStringWithOffset = `${localDateTimeStr}${offsetString}`;
      const utcDate = new Date(isoStringWithOffset);
      
      if (isNaN(utcDate.getTime())) {
        alert('INVALID DATE OR TIME SELECTION');
        setUpdatingState(false);
        return;
      }
      
      const utcTimestamp = utcDate.toISOString();

      const res = await updateSharingState(activeFile.id, true, utcTimestamp, timezone);
      if (res.success) {
        setModalStep('success');
      } else {
        alert(`FAILED TO ACTIVATE LINK: ${res.error}`);
      }
    } catch (err: any) {
      alert(`ERROR: ${err?.message || 'An error occurred'}`);
    } finally {
      setUpdatingState(false);
    }
  };

  const handleCopySuccessLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedId('success');
    setTimeout(() => setCopiedId(null), 2000);
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
                          <div className="flex gap-2">
                            {file.is_accessible && (!file.expires_at || new Date().getTime() < new Date(file.expires_at).getTime()) ? (
                              <>
                                <button
                                  onClick={() => handleCopyLink(file.short_id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-foreground/25 hover:border-foreground hover:bg-foreground hover:text-background transition-all uppercase tracking-wider text-[10px] font-bold cursor-pointer min-w-[100px] justify-center rounded-none"
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
                                  onClick={() => handleTakedown(file.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-foreground/25 hover:border-foreground hover:bg-foreground hover:text-background transition-all uppercase tracking-wider text-[10px] font-bold cursor-pointer min-w-[100px] justify-center rounded-none"
                                >
                                  TAKEDOWN
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => triggerShareModal(file)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-foreground/25 hover:border-foreground hover:bg-foreground hover:text-background transition-all uppercase tracking-wider text-[10px] font-bold cursor-pointer min-w-[208px] justify-center rounded-none"
                              >
                                CREATE SHAREABLE LINK
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => handleDelete(file.id, file.storage_path)}
                            disabled={deletingId === file.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all uppercase tracking-wider text-[10px] font-bold disabled:opacity-50 cursor-pointer min-w-[208px] justify-center rounded-none"
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

      {/* Geometric Monochrome Scheduling Modal */}
      {modalOpen && activeFile && (
        <div 
          onClick={() => {
            if (modalStep === 'success') {
              setModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in px-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md border-2 border-foreground bg-background p-6 rounded-none shadow-none font-mono relative"
          >
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
              title="Close modal"
            >
              <X size={16} />
            </button>
            
            {modalStep === 'select' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">/ SHARE LINK CONFIG</h3>
                  <h2 className="text-sm font-black uppercase tracking-wider text-foreground truncate">
                    {activeFile.file_name}
                  </h2>
                </div>
                
                <p className="text-[11px] text-muted-foreground uppercase leading-relaxed">
                  SELECT SHARING CONFIGURATION FOR THIS DOCUMENT. SCHEDULED LINKS WILL AUTOMATICALLY EXPIRE AND ACCESS WILL BE RESTRICTED.
                </p>
                
                <div className="space-y-3 pt-2">
                  <button
                    onClick={handleShareForever}
                    disabled={updatingState}
                    className="w-full text-left p-4 border border-foreground/30 hover:border-foreground hover:bg-foreground hover:text-background transition-all group cursor-pointer rounded-none flex justify-between items-center"
                  >
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider">ACCESSIBLE FOREVER</div>
                      <div className="text-[10px] text-muted-foreground group-hover:text-background/80 transition-colors uppercase mt-0.5">No expiration date. Active until manual takedown.</div>
                    </div>
                    <ChevronRight size={14} className="shrink-0" />
                  </button>
                  
                  <button
                    onClick={() => setModalStep('schedule')}
                    disabled={updatingState}
                    className="w-full text-left p-4 border border-foreground/30 hover:border-foreground hover:bg-foreground hover:text-background transition-all group cursor-pointer rounded-none flex justify-between items-center"
                  >
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider">SCHEDULED</div>
                      <div className="text-[10px] text-muted-foreground group-hover:text-background/80 transition-colors uppercase mt-0.5">Specify a custom date and time for link takedown.</div>
                    </div>
                    <ChevronRight size={14} className="shrink-0" />
                  </button>
                </div>
              </div>
            )}
            
            {modalStep === 'schedule' && (
              <div className="space-y-6">
                <div>
                  <button
                    onClick={() => setModalStep('select')}
                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider flex items-center gap-1 mb-2"
                  >
                    ← BACK TO SELECTION
                  </button>
                  <h3 className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">/ SCHEDULE EXPIRATION</h3>
                  <h2 className="text-sm font-black uppercase tracking-wider text-foreground truncate">
                    {activeFile.file_name}
                  </h2>
                </div>
                
                <div className="space-y-4 pt-2">
                  {/* Date Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      SELECT EXPIRATION DATE
                    </label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().split('T')[0]}
                      value={expiresDate}
                      onChange={(e) => setExpiresDate(e.target.value)}
                      className="w-full p-2.5 border border-foreground/30 bg-background text-foreground text-xs rounded-none font-mono focus:outline-none focus:border-foreground"
                    />
                  </div>
                  
                  {/* Time Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      SELECT EXPIRATION TIME (24-HOUR)
                    </label>
                    <input
                      type="time"
                      required
                      value={expiresTime}
                      onChange={(e) => setExpiresTime(e.target.value)}
                      className="w-full p-2.5 border border-foreground/30 bg-background text-foreground text-xs rounded-none font-mono focus:outline-none focus:border-foreground"
                    />
                  </div>
                  
                  {/* Timezone Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      SELECT TIMEZONE OFFSET
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full p-2.5 border border-foreground/30 bg-background text-foreground text-xs rounded-none font-mono focus:outline-none focus:border-foreground"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <button
                    onClick={handleConfirmSchedule}
                    disabled={updatingState || !expiresDate}
                    className="w-full py-3 border border-foreground bg-foreground text-background hover:bg-transparent hover:text-foreground transition-all font-bold text-xs uppercase tracking-widest cursor-pointer rounded-none disabled:opacity-50 disabled:pointer-events-none mt-2"
                  >
                    {updatingState ? 'ACTIVATING LINK...' : 'CONFIRM & ACTIVATE'}
                  </button>
                </div>
              </div>
            )}
            
            {modalStep === 'success' && (
              <div className="space-y-6 text-center py-4">
                <div className="flex justify-center mb-2">
                  <div className="p-3 border border-foreground rounded-none bg-foreground text-background">
                    <Check size={24} />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-xs text-foreground uppercase font-black tracking-widest">
                    LINK SUCCESSFULLY ACTIVATED
                  </h3>
                  <p className="text-[10px] text-muted-foreground uppercase font-mono">
                    YOUR DOCUMENT IS NOW LIVE AND ACCESSIBLE PUBLICLY.
                  </p>
                </div>
                
                <div className="p-3 border border-foreground/20 bg-foreground/[0.01] rounded-none font-mono text-[10px] break-all select-all text-left">
                  {shareUrl}
                </div>
                
                <div className="pt-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      setModalOpen(false);
                      triggerToast('LINK COPIED TO CLIPBOARD');
                    }}
                    className="w-full py-3 border border-foreground bg-foreground text-background hover:bg-transparent hover:text-foreground transition-all text-xs font-bold uppercase tracking-widest cursor-pointer rounded-none"
                  >
                    COPY LINK & CLOSE
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stark Geometric Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 border-2 border-foreground bg-background text-foreground font-mono text-[10px] font-bold tracking-widest uppercase px-6 py-3.5 shadow-none rounded-none animate-toast select-none">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
