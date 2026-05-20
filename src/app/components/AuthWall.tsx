'use client';

import { useState } from 'react';
import { authenticate } from '../actions';
import { Eye, EyeOff } from 'lucide-react';

export default function AuthWall() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    try {
      const res = await authenticate(password);
      if (!res.success) {
        setError(res.error || 'Authentication failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen px-4 bg-background">
      <div className="w-full max-w-sm border border-foreground p-8 bg-background">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-widest uppercase mb-2">MD SHARE</h1>
          <p className="text-xs text-muted-foreground uppercase font-mono">Administration Wall</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wider font-mono font-medium">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="ENTER ADMIN PASSWORD"
                className="w-full px-4 py-3 bg-background text-foreground text-sm font-mono border border-foreground/30 focus:border-foreground focus:outline-none placeholder:text-muted-foreground/50 transition-colors uppercase"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 font-mono uppercase bg-red-500/10 border border-red-500/30 px-3 py-2">
              ERROR: {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-foreground text-background font-mono text-xs uppercase tracking-widest font-bold border border-foreground hover:bg-background hover:text-foreground active:bg-foreground active:text-background transition-colors duration-150 cursor-pointer disabled:opacity-55"
          >
            {loading ? 'VERIFYING...' : 'ACCESS WORKSPACE'}
          </button>
        </form>
      </div>
    </div>
  );
}
