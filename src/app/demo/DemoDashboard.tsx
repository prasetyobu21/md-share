'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useDropzone, FileRejection } from 'react-dropzone';
import { 
  getDemoFiles, 
  uploadDemoMarkdownFile, 
  finalizeDemoUploadWithImages, 
  deleteDemoMarkdownFile,
  takedownDemoFile,
  updateDemoSharingState
} from '../actions';
import { 
  LogOut, 
  Copy, 
  Check, 
  Trash2, 
  FileText, 
  Upload, 
  ExternalLink, 
  X, 
  ChevronRight, 
  Image as ImageIcon, 
  AlertTriangle, 
  Lock, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  MoreVertical 
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

interface FileRecord {
  id: string;
  short_id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
  is_accessible: boolean;
  expires_at: string | null;
  timezone: string;
  password?: string | null;
  demo_session_id?: string | null;
}

const TIMEZONES = [
  { label: 'GMT+7 (Bangkok, Jakarta, Hanoi)', value: 'GMT+7', offset: 7 },
  { label: 'GMT+8 (Singapore, Beijing, Manila)', value: 'GMT+8', offset: 8 },
  { label: 'GMT+9 (Tokyo, Seoul)', value: 'GMT+9', offset: 9 },
  { label: 'GMT+0 (UTC, London, Lisbon)', value: 'GMT+0', offset: 0 },
  { label: 'GMT-5 (New York, Toronto, EST)', value: 'GMT-5', offset: -5 },
  { label: 'GMT-8 (Los Angeles, PST)', value: 'GMT-8', offset: -8 },
];

export default function DemoDashboard() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileRecord | null>(null);

  // Upload limits count (excluding globally pinned templates)
  const sessionFilesCount = files.filter(f => f.demo_session_id === sessionId).length;

  // Sort files so that "About MD Share App.md" is always at the top (pinned)
  const sortedFiles = [...files].sort((a, b) => {
    const isAPinned = a.file_name.toLowerCase() === 'about md share app.md';
    const isBPinned = b.file_name.toLowerCase() === 'about md share app.md';
    if (isAPinned && !isBPinned) return -1;
    if (!isAPinned && isBPinned) return 1;
    return 0;
  });

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

  // Password Protection State
  const [isPrivate, setIsPrivate] = useState(false);
  const [modalPassword, setModalPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Kebab Dropdown State
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

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

  // Initialize session ID
  useEffect(() => {
    let session = localStorage.getItem('demo_session_id');
    if (!session) {
      session = typeof crypto.randomUUID === 'function' 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('demo_session_id', session);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(session);
  }, []);

  // Fetch session files
  const loadFiles = useCallback(async (sid: string) => {
    setLoading(true);
    try {
      const res = await getDemoFiles(sid);
      if (res.success && res.files) {
        setFiles(res.files as FileRecord[]);
      } else {
        console.error('Failed to load demo files:', res.error);
      }
    } catch (err) {
      console.error('Error fetching demo files:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadFiles(sessionId);
    }
  }, [sessionId, loadFiles]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.kebab-menu-container')) {
        setActiveDropdownId(null);
      }
    };

    if (activeDropdownId) {
      document.addEventListener('click', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [activeDropdownId]);

  const triggerToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
    if (!sessionId) return;

    if (fileRejections.length > 0) {
      const errorMsg = `FILE REJECTED: ${fileRejections[0].errors[0]?.message || 'Invalid file type'}. ONLY .MD FILES ARE ALLOWED.`;
      setUploadError(errorMsg.toUpperCase());
      return;
    }
    if (acceptedFiles.length === 0) return;

    if (sessionFilesCount >= 10) {
      setUploadError('LIMIT REACHED: YOU CAN ONLY UPLOAD UP TO 10 FILES. PLEASE DELETE AN EXISTING FILE FIRST.');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await uploadDemoMarkdownFile(formData, sessionId);

      if (res.success) {
        setUploadSuccess(`SUCCESSFULLY UPLOADED: ${file.name}`);
        loadFiles(sessionId);
      } else if (res.status === 'missing_images') {
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
          setUploadError(`UPLOAD INTERCEPTED BUT RESPONSE METADATA WAS INCOMPLETE.`);
        }
      } else {
        setUploadError(`UPLOAD FAILED: ${res.error || 'Unknown error'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred during upload';
      setUploadError(`ERROR: ${errorMsg}`);
    } finally {
      setUploading(false);
    }
  }, [sessionId, sessionFilesCount, loadFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md'],
      'text/plain': ['.md'],
      'text/x-markdown': ['.md'],
      'application/octet-stream': ['.md'],
    },
    maxFiles: 1,
    disabled: uploading || sessionFilesCount >= 10,
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
    if (!sessionId || !allImagesProvided || !interceptedFileMeta) return;

    setImagesUploading(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      const formData = new FormData();
      formData.append('shortId', interceptedFileMeta.shortId);
      formData.append('fileName', interceptedFileMeta.fileName);
      formData.append('markdownContent', interceptedFileMeta.markdownContent);

      Object.entries(providedImages).forEach(([requiredName, file]) => {
        const renamedFile = new File([file], requiredName, { type: file.type });
        formData.append('images', renamedFile);
      });

      const res = await finalizeDemoUploadWithImages(formData, sessionId);
      if (res.success) {
        setUploadSuccess(`SUCCESSFULLY UPLOADED: ${interceptedFileMeta.fileName} WITH ${Object.keys(providedImages).length} IMAGES`);
        setMissingImagesModalOpen(false);
        setProvidedImages({});
        setInterceptedFileMeta(null);
        loadFiles(sessionId);
      } else {
        setUploadError(`UPLOAD FAILED: ${res.error || 'Unknown error'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred during upload';
      setUploadError(`ERROR: ${errorMsg}`);
    } finally {
      setImagesUploading(false);
    }
  };

  const allImagesProvided = missingImagesList.every(imgName =>
    !!providedImages[imgName]
  );

  const handleCopyLink = (shortId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${origin}/share/${shortId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(shortId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const triggerDeleteModal = (file: FileRecord) => {
    setFileToDelete(file);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sessionId || !fileToDelete || deletingId) return;
    setDeletingId(fileToDelete.id);
    try {
      const res = await deleteDemoMarkdownFile(fileToDelete.id, fileToDelete.storage_path, sessionId);
      if (res.success) {
        setDeleteModalOpen(false);
        setFileToDelete(null);
        loadFiles(sessionId);
        triggerToast('FILE DELETED');
      } else {
        alert(`DELETE FAILED: ${res.error}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      alert(`DELETE ERROR: ${errorMsg}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleTakedown = async (id: string) => {
    if (!sessionId) return;
    try {
      const res = await takedownDemoFile(id, sessionId);
      if (res.success) {
        loadFiles(sessionId);
        triggerToast('LINK TAKEN DOWN');
      } else {
        alert(`TAKEDOWN FAILED: ${res.error}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      alert(`TAKEDOWN ERROR: ${errorMsg}`);
    }
  };

  const triggerShareModal = (file: FileRecord) => {
    setActiveFile(file);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setShareUrl(`${origin}/share/${file.short_id}`);
    
    // Reset inputs
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setExpiresDate(tomorrow.toISOString().split('T')[0]);
    setExpiresTime('23:59');
    setTimezone('GMT+7');

    // Reset password state
    setIsPrivate(false);
    setModalPassword('');
    setShowPassword(false);
    setCopiedPassword(false);
    
    setModalStep('select');
    setModalOpen(true);
  };

  const handleShareForever = async () => {
    if (!sessionId || !activeFile) return;
    if (isPrivate && !modalPassword.trim()) {
      alert('PLEASE ENTER OR GENERATE A PASSWORD');
      return;
    }
    setUpdatingState(true);
    try {
      const pwd = isPrivate ? modalPassword.trim() : null;
      const res = await updateDemoSharingState(activeFile.id, true, null, 'GMT+7', pwd, sessionId);
      if (res.success) {
        setModalStep('success');
        loadFiles(sessionId);
      } else {
        alert(`FAILED TO ACTIVATE LINK: ${res.error}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      alert(`ERROR: ${errorMsg}`);
    } finally {
      setUpdatingState(false);
    }
  };

  const handleConfirmSchedule = async () => {
    if (!sessionId || !activeFile || !expiresDate) return;
    if (isPrivate && !modalPassword.trim()) {
      alert('PLEASE ENTER OR GENERATE A PASSWORD');
      return;
    }
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
      const pwd = isPrivate ? modalPassword.trim() : null;

      const res = await updateDemoSharingState(activeFile.id, true, utcTimestamp, timezone, pwd, sessionId);
      if (res.success) {
        setModalStep('success');
        loadFiles(sessionId);
      } else {
        alert(`FAILED TO ACTIVATE LINK: ${res.error}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      alert(`ERROR: ${errorMsg}`);
    } finally {
      setUpdatingState(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toISOString().split('T')[0];
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-12 flex-1 flex flex-col justify-start">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-foreground pb-6 mb-12">
        <div>
          <h1 className="text-2xl font-black tracking-widest uppercase">MD SHARE SITE (DEMO)</h1>
          <p className="text-xs text-muted-foreground uppercase font-mono mt-1">Stark Minimalist Workspace</p>
        </div>
        <div className="flex items-center gap-4 animate-fade-in">
          <ThemeToggle />
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 border border-foreground/30 hover:border-foreground hover:bg-foreground hover:text-background transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <LogOut size={14} className="rotate-180" />
            EXIT DEMO
          </Link>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="space-y-12">
        {/* Info Panel */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-foreground/5 border border-foreground/15 p-6 gap-4 animate-fade-in">
          <div className="space-y-1">
            <span className="text-xs font-black uppercase tracking-widest text-foreground block">SANDBOX SANDBOX ENVIRONMENT</span>
            <p className="text-[10px] text-muted-foreground uppercase leading-relaxed font-mono">
              Upload files privately without password authentication. Your files are isolated and stored using a session ID. Limit of 10 files.
            </p>
          </div>
          <div className="text-left md:text-right shrink-0">
            <span className="text-xl font-black font-mono block">{sessionFilesCount} / 10</span>
            <p className="text-[9px] text-muted-foreground uppercase font-mono tracking-widest">FILES UPLOADED</p>
          </div>
        </div>

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
            } ${uploading || sessionFilesCount >= 10 ? 'pointer-events-none opacity-50' : ''}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center space-y-4">
              <Upload size={32} className="text-foreground/75 stroke-[1.5]" />
              {uploading ? (
                <p className="text-xs font-mono uppercase tracking-wider animate-pulse">
                  UPLOADING FILE... PLEASE WAIT
                </p>
              ) : sessionFilesCount >= 10 ? (
                <p className="text-xs font-mono uppercase tracking-wider text-red-500 font-bold">
                  UPLOAD LIMIT REACHED (10/10). DELETE A FILE TO UPLOAD MORE.
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

          {loading ? (
            <div className="border border-dashed border-foreground/20 p-12 text-center text-xs text-muted-foreground uppercase font-mono flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              LOADING SANDBOX FILES...
            </div>
          ) : files.length === 0 ? (
            <div className="border border-dashed border-foreground/20 p-12 text-center text-xs text-muted-foreground uppercase font-mono">
              NO FILES HAVE BEEN SHARED YET. UPLOAD A FILE ABOVE TO BEGIN.
            </div>
          ) : (
            <div className="overflow-visible">
              <table className="w-full text-left font-mono border-collapse text-xs">
                <thead>
                  <tr className="border-b border-foreground/30 text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">File Name</th>
                    <th className="py-3 px-4 font-bold w-32">Created At</th>
                    <th className="py-3 px-4 text-right font-bold w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {sortedFiles.map((file) => (
                    <tr
                      key={file.id}
                      className="hover:bg-foreground/[0.01] transition-colors group"
                    >
                      <td className="py-4 px-4 font-medium flex items-center gap-2 max-w-xs md:max-w-md truncate">
                        <FileText size={14} className="shrink-0 text-muted-foreground" />
                        {file.file_name.toLowerCase() === 'about md share app.md' && (
                          <span title="Pinned File (Cannot be deleted)" className="shrink-0 inline-flex items-center bg-foreground/5 dark:bg-foreground/10 px-1 py-0.5 text-[8px] border border-foreground/20 text-foreground/60 font-mono font-bold tracking-wider">
                            PINNED
                          </span>
                        )}
                        {file.password && (
                          <span title="Password Protected Link" className="shrink-0 flex items-center">
                            <Lock size={12} className="text-foreground/70" />
                          </span>
                        )}
                        <Link
                          href={`/share/${file.short_id}`}
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
                      <td className="py-4 px-4 shrink-0 text-right relative">
                        <div className="kebab-menu-container relative inline-block text-left">
                          <button
                            onClick={() => {
                              setActiveDropdownId(activeDropdownId === file.id ? null : file.id);
                            }}
                            className={`p-2 border transition-all cursor-pointer rounded-none inline-flex items-center justify-center ${
                              activeDropdownId === file.id
                                ? 'border-foreground bg-foreground text-background font-black'
                                : 'border-foreground/25 text-foreground hover:border-foreground hover:bg-foreground/5'
                            }`}
                            title="File actions"
                          >
                            <MoreVertical size={14} />
                          </button>

                          {activeDropdownId === file.id && (
                            <div className="absolute right-0 top-full mt-1.5 z-20 w-48 border border-foreground bg-background shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] py-1 animate-fade-in font-mono text-[10px] font-bold uppercase tracking-wider text-left">
                              {file.is_accessible && (!file.expires_at || new Date().getTime() < new Date(file.expires_at).getTime()) ? (
                                <>
                                  {/* Copy Link Option */}
                                  <button
                                    onClick={() => {
                                      handleCopyLink(file.short_id);
                                      setActiveDropdownId(null);
                                    }}
                                    className="w-full px-4 py-2.5 text-left hover:bg-foreground hover:text-background transition-colors flex items-center gap-2 cursor-pointer"
                                  >
                                    <Copy size={12} />
                                    {copiedId === file.short_id ? 'COPIED LINK' : 'COPY LINK'}
                                  </button>

                                  {/* Copy Password Option (if applicable) */}
                                  {file.password && (
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(file.password!);
                                        triggerToast('PASSWORD COPIED');
                                        setActiveDropdownId(null);
                                      }}
                                      className="w-full px-4 py-2.5 text-left hover:bg-foreground hover:text-background transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <Lock size={12} />
                                      COPY PASSWORD
                                    </button>
                                  )}

                                  {/* Takedown Option */}
                                  <button
                                    onClick={() => {
                                      if (file.file_name.toLowerCase() === 'about md share app.md') {
                                        triggerToast('PINNED FILE CONFIG IS LOCKED');
                                        setActiveDropdownId(null);
                                        return;
                                      }
                                      handleTakedown(file.id);
                                      setActiveDropdownId(null);
                                    }}
                                    disabled={file.file_name.toLowerCase() === 'about md share app.md'}
                                    className={`w-full px-4 py-2.5 text-left transition-colors flex items-center gap-2 cursor-pointer border-b border-foreground/10 ${
                                      file.file_name.toLowerCase() === 'about md share app.md'
                                        ? 'text-foreground/40 cursor-not-allowed'
                                        : 'hover:bg-foreground hover:text-background'
                                    }`}
                                  >
                                    <X size={12} />
                                    TAKEDOWN LINK
                                  </button>
                                </>
                              ) : (
                                /* Create Shareable Link Option */
                                <button
                                  onClick={() => {
                                    if (file.file_name.toLowerCase() === 'about md share app.md') {
                                      triggerToast('PINNED FILE CONFIG IS LOCKED');
                                      setActiveDropdownId(null);
                                      return;
                                    }
                                    triggerShareModal(file);
                                    setActiveDropdownId(null);
                                  }}
                                  disabled={file.file_name.toLowerCase() === 'about md share app.md'}
                                  className={`w-full px-4 py-2.5 text-left transition-colors flex items-center gap-2 cursor-pointer border-b border-foreground/10 ${
                                    file.file_name.toLowerCase() === 'about md share app.md'
                                      ? 'text-foreground/40 cursor-not-allowed'
                                      : 'hover:bg-foreground hover:text-background'
                                  }`}
                                >
                                  <ExternalLink size={12} />
                                  CREATE LINK
                                </button>
                              )}

                              {/* Delete Option */}
                              <button
                                onClick={() => {
                                  if (file.file_name.toLowerCase() === 'about md share app.md') {
                                    triggerToast('PINNED FILE CANNOT BE DELETED');
                                    setActiveDropdownId(null);
                                    return;
                                  }
                                  triggerDeleteModal(file);
                                  setActiveDropdownId(null);
                                }}
                                disabled={file.file_name.toLowerCase() === 'about md share app.md'}
                                className={`w-full px-4 py-2.5 text-left transition-colors flex items-center gap-2 cursor-pointer ${
                                  file.file_name.toLowerCase() === 'about md share app.md'
                                    ? 'text-red-500/40 cursor-not-allowed'
                                    : 'text-red-500 hover:bg-red-500 hover:text-white'
                                }`}
                              >
                                <Trash2 size={12} />
                                DELETE FILE
                              </button>
                            </div>
                          )}
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

                {/* Privacy Toggle Section */}
                <div className="space-y-3 border-t border-b border-foreground/10 py-4 my-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    / ACCESS PRIVACY
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPrivate(false);
                        setModalPassword('');
                      }}
                      className={`py-2 px-3 border text-center transition-all text-xs font-bold uppercase tracking-wider cursor-pointer rounded-none ${
                        !isPrivate
                          ? 'border-foreground bg-foreground text-background font-black'
                          : 'border-foreground/30 text-foreground hover:border-foreground'
                      }`}
                    >
                      PUBLIC
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPrivate(true);
                        if (!modalPassword) {
                          const randomPass = Math.random().toString(36).substring(2, 10).toUpperCase();
                          setModalPassword(randomPass);
                        }
                      }}
                      className={`py-2 px-3 border text-center transition-all text-xs font-bold uppercase tracking-wider cursor-pointer rounded-none ${
                        isPrivate
                          ? 'border-foreground bg-foreground text-background font-black'
                          : 'border-foreground/30 text-foreground hover:border-foreground'
                      }`}
                    >
                      PRIVATE (PASSWORD)
                    </button>
                  </div>

                  {isPrivate && (
                    <div className="space-y-2 pt-2 animate-fade-in">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          SET SHARE PASSWORD
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const randomPass = Math.random().toString(36).substring(2, 10).toUpperCase();
                            setModalPassword(randomPass);
                            triggerToast('GENERATED NEW PASSWORD');
                          }}
                          className="text-[9px] font-bold text-foreground hover:underline uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw size={10} />
                          GENERATE
                        </button>
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={modalPassword}
                          onChange={(e) => setModalPassword(e.target.value)}
                          placeholder="ENTER PASSWORD"
                          className="w-full p-2.5 pr-10 border border-foreground/30 bg-background text-foreground text-xs rounded-none font-mono focus:outline-none focus:border-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 text-foreground/50 hover:text-foreground cursor-pointer"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
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
              <div className="space-y-6 py-4">
                <div className="flex justify-center mb-2">
                  <div className="p-3 border border-foreground rounded-none bg-foreground text-background">
                    <Check size={24} />
                  </div>
                </div>
                
                <div className="space-y-1 text-center">
                  <h3 className="text-xs text-foreground uppercase font-black tracking-widest">
                    LINK SUCCESSFULLY ACTIVATED
                  </h3>
                  <p className="text-[10px] text-muted-foreground uppercase font-mono">
                    YOUR DOCUMENT IS NOW LIVE AND SECURED WITH {isPrivate ? 'A PASSWORD' : 'PUBLIC ACCESS'}.
                  </p>
                </div>
                
                {/* Shareable Link Block */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">
                    SHAREABLE URL
                  </label>
                  <div className="flex border border-foreground/30">
                    <div className="flex-1 p-2.5 bg-foreground/[0.01] font-mono text-[10px] break-all select-all truncate align-middle">
                      {shareUrl}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        triggerToast('LINK COPIED TO CLIPBOARD');
                      }}
                      className="px-3 border-l border-foreground/30 bg-background text-foreground hover:bg-foreground hover:text-background transition-all text-[9px] font-bold uppercase cursor-pointer shrink-0 rounded-none"
                    >
                      COPY
                    </button>
                  </div>
                </div>

                {/* Shareable Password Block */}
                {isPrivate && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">
                      LINK PASSWORD
                    </label>
                    <div className="flex border border-foreground/30">
                      <div className="flex-1 p-2.5 bg-foreground/[0.01] font-mono text-[10px] select-all font-bold tracking-wider text-foreground">
                        {modalPassword}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(modalPassword);
                          setCopiedPassword(true);
                          triggerToast('PASSWORD COPIED TO CLIPBOARD');
                          setTimeout(() => setCopiedPassword(false), 2000);
                        }}
                        className="px-3 border-l border-foreground/30 bg-background text-foreground hover:bg-foreground hover:text-background transition-all text-[9px] font-bold uppercase cursor-pointer shrink-0 rounded-none flex items-center justify-center min-w-[60px]"
                      >
                        {copiedPassword ? 'COPIED' : 'COPY'}
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setModalOpen(false);
                    }}
                    className="w-full py-3 border border-foreground bg-foreground text-background hover:bg-transparent hover:text-foreground transition-all text-xs font-bold uppercase tracking-widest cursor-pointer rounded-none text-center"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && fileToDelete && (
        <div 
          onClick={() => setDeleteModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in px-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm border-2 border-foreground bg-background p-6 rounded-none shadow-none font-mono relative space-y-6"
          >
            <button
              onClick={() => setDeleteModalOpen(false)}
              className="absolute top-4 right-4 text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
              title="Close modal"
            >
              <X size={16} />
            </button>

            <div className="space-y-2">
              <h3 className="text-xs text-red-500 uppercase font-bold tracking-widest flex items-center gap-2">
                <AlertTriangle size={14} className="stroke-[2]" />
                / CONFIRM DELETE
              </h3>
              <h2 className="text-sm font-black uppercase tracking-wider text-foreground truncate">
                {fileToDelete.file_name}
              </h2>
            </div>

            <p className="text-[11px] text-muted-foreground uppercase leading-relaxed">
              THIS OPERATION IS PERMANENT AND CANNOT BE UNDONE. ALL PHYSICAL MARKDOWN FILES AND PUBLICLY SHARED IMAGES ASSOCIATED WITH THIS DOCUMENT WILL BE DELETED IMMEDIATELY.
            </p>

            <div className="flex gap-4 pt-2">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 py-3 border border-foreground/30 hover:border-foreground transition-all uppercase tracking-wider text-[10px] font-bold cursor-pointer rounded-none text-center"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletingId === fileToDelete.id}
                className="flex-1 py-3 border border-red-500 bg-red-500 text-white hover:bg-transparent hover:text-red-500 transition-all uppercase tracking-wider text-[10px] font-bold cursor-pointer rounded-none text-center disabled:opacity-50"
              >
                {deletingId === fileToDelete.id ? 'DELETING...' : 'CONFIRM DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stark Geometric Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 border-2 border-foreground bg-background text-foreground font-mono text-[10px] font-bold tracking-widest uppercase px-6 py-3.5 shadow-none rounded-none animate-toast select-none">
          {toastMessage}
        </div>
      )}

      {/* Missing Images Intercept Modal */}
      {missingImagesModalOpen && interceptedFileMeta && (
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
