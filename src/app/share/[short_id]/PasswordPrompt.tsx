'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifySharePassword } from '../../actions';
import { Lock, Eye, EyeOff, Check, AlertTriangle, Key } from 'lucide-react';
import ThemeToggle from '../../components/ThemeToggle';

interface PasswordPromptProps {
  shortId: string;
}

export default function PasswordPrompt({ shortId }: PasswordPromptProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('PLEASE ENTER THE PASSWORD');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await verifySharePassword(shortId, password.trim());
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          router.refresh();
        }, 800);
      } else {
        setError(res.error || 'INCORRECT PASSWORD');
        setLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'AN UNEXPECTED ERROR OCCURRED');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4 bg-background font-mono selection:bg-foreground selection:text-background">
      {/* Visual Accent header */}
      <div className="fixed top-6 right-6 flex items-center gap-4 animate-fade-in">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md border-2 border-foreground bg-background p-8 rounded-none relative space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] transition-all duration-200">
        
        {/* Security Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className={`p-4 border-2 border-foreground rounded-none transition-all duration-300 ${success ? 'bg-foreground text-background scale-110' : 'bg-background text-foreground'}`}>
              {success ? <Check size={28} className="animate-pulse" /> : <Lock size={28} />}
            </div>
          </div>
          
          <div className="space-y-1">
            <h1 className="text-sm font-black uppercase tracking-widest text-foreground">
              {success ? 'ACCESS GRANTED' : 'PASSWORD PROTECTED'}
            </h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {success 
                ? 'UNLOCKING DOCUMENT... PREPARING MARKDOWN' 
                : 'THIS SHAREABLE LINK IS PRIVATE. PLEASE ENTER PASSWORD.'}
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">
              ENTER DECRYPTION KEY
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={loading || success}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="PASSWORD"
                className="w-full p-3 pr-10 border border-foreground/30 bg-background text-foreground text-xs rounded-none font-mono focus:outline-none focus:border-foreground disabled:opacity-50 transition-all uppercase tracking-widest text-center font-bold"
              />
              <button
                type="button"
                disabled={loading || success}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-foreground/50 hover:text-foreground cursor-pointer disabled:opacity-50"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Dynamic Error State */}
          {error && (
            <div className="border border-red-500 bg-red-500/10 text-red-500 text-[10px] font-bold uppercase px-4 py-3 flex items-center gap-2 animate-shake">
              <AlertTriangle size={12} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || success || !password.trim()}
            className={`w-full py-3.5 border uppercase tracking-widest text-xs font-bold transition-all rounded-none cursor-pointer flex items-center justify-center gap-2 ${
              loading || success
                ? 'bg-foreground/10 border-foreground/20 text-muted-foreground cursor-not-allowed'
                : 'border-foreground bg-foreground text-background hover:bg-background hover:text-foreground'
            }`}
          >
            {success ? (
              <>
                <Check size={14} />
                DECRYPTED
              </>
            ) : loading ? (
              <>
                <span className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin shrink-0" />
                VERIFYING...
              </>
            ) : (
              <>
                <Key size={14} />
                UNLOCK DOCUMENT
              </>
            )}
          </button>
        </form>
      </div>

      {/* Footer info */}
      <div className="mt-8 text-center">
        <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
          MD SHARE SITE • SECURED WITH END-TO-END VERIFICATION
        </p>
      </div>
    </div>
  );
}
