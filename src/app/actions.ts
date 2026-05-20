'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';

// Helper to check if the current request is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    console.error('Error: ADMIN_PASSWORD environment variable is not set!');
    return false;
  }

  // Create a secure hash of the password to compare with the cookie value
  const expectedToken = crypto.createHash('sha256').update(adminPassword).digest('hex');
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  
  return token === expectedToken;
}

// Authenticates the user and sets a secure cookie
export async function authenticate(password: string): Promise<{ success: boolean; error?: string }> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    return { success: false, error: 'Admin password is not configured on the server.' };
  }

  if (password !== adminPassword) {
    return { success: false, error: 'Incorrect password.' };
  }

  const token = crypto.createHash('sha256').update(adminPassword).digest('hex');
  const cookieStore = await cookies();
  
  cookieStore.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });

  revalidatePath('/');
  return { success: true };
}

// Logs out the user by deleting the cookie
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('admin_token');
  revalidatePath('/');
}

// Generates a random 8-character hex short ID
function generateShortId(): string {
  return crypto.randomBytes(4).toString('hex');
}

// Uploads a markdown file to private storage and database
export async function uploadMarkdownFile(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  // 1. Auth check
  const auth = await isAuthenticated();
  if (!auth) {
    return { success: false, error: 'Unauthorized.' };
  }

  // 2. Extract and validate file
  const file = formData.get('file') as File | null;
  if (!file) {
    return { success: false, error: 'No file provided.' };
  }

  if (!file.name.endsWith('.md')) {
    return { success: false, error: 'Only .md files are allowed.' };
  }

  try {
    // Read markdown text
    const textContent = await file.text();
    const shortId = generateShortId();
    const storagePath = `${shortId}.md`;

    // 3. Upload to private Supabase bucket 'md-files'
    const { error: uploadError } = await supabaseServer.storage
      .from('md-files')
      .upload(storagePath, textContent, {
        contentType: 'text/markdown',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    // 4. Insert record into PostgreSQL files table
    const { error: dbError } = await supabaseServer
      .from('files')
      .insert({
        short_id: shortId,
        file_name: file.name,
        storage_path: storagePath,
      });

    if (dbError) {
      console.error('Database insertion error:', dbError);
      // Attempt to clean up uploaded storage file if db fails
      await supabaseServer.storage.from('md-files').remove([storagePath]);
      return { success: false, error: `Database insertion failed: ${dbError.message}` };
    }

    // 5. Success and revalidate
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    console.error('Unexpected upload error:', err);
    return { success: false, error: err?.message || 'An unexpected error occurred during upload.' };
  }
}

// Deletes a markdown file from storage and database
export async function deleteMarkdownFile(
  id: string,
  storagePath: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Auth check
  const auth = await isAuthenticated();
  if (!auth) {
    return { success: false, error: 'Unauthorized.' };
  }

  try {
    // 2. Remove file from storage
    const { error: storageError } = await supabaseServer.storage
      .from('md-files')
      .remove([storagePath]);

    if (storageError) {
      console.error('Storage delete error:', storageError);
      // We still proceed to try and delete db record if storage fails, or report error.
      // But typically, we want both deleted. Let's log it.
    }

    // 3. Remove record from database
    const { error: dbError } = await supabaseServer
      .from('files')
      .delete()
      .eq('id', id);

    if (dbError) {
      console.error('Database delete error:', dbError);
      return { success: false, error: `Database deletion failed: ${dbError.message}` };
    }

    // 4. Revalidate
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    console.error('Unexpected deletion error:', err);
    return { success: false, error: err?.message || 'An unexpected error occurred during deletion.' };
  }
}
