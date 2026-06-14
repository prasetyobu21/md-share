'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import sharp from 'sharp';
import { supabaseServer } from '@/lib/supabase';
import { scanForLocalImages, rewriteMarkdownImages, ImagePlaceholder } from '@/utils/markdown';

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

// Helpers moved to '@/utils/markdown' to comply with Next.js Server Actions async rule

// Generates a random 8-character hex short ID
function generateShortId(): string {
  return crypto.randomBytes(4).toString('hex');
}

// Uploads a markdown file to private storage and database
export async function uploadMarkdownFile(
  formData: FormData
): Promise<{
  success: boolean;
  status?: 'missing_images' | 'completed';
  missingImages?: string[];
  shortId?: string;
  markdownContent?: string;
  fileName?: string;
  error?: string;
}> {
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
    console.log(`Server: Processing upload for file: ${file.name}. Content size: ${textContent.length} bytes.`);

    // Scan for local images
    const localImages = scanForLocalImages(textContent);
    console.log(`Server: Scanned for local images. Found count: ${localImages.length}. Matches:`, localImages);

    if (localImages.length > 0) {
      // Pause final submission and return missing image metadata
      console.log('Server: Halting final submission. Returning missing images intercept to client.');
      return {
        success: false,
        status: 'missing_images',
        missingImages: localImages.map(img => img.filename),
        shortId: generateShortId(),
        markdownContent: textContent,
        fileName: file.name,
      };
    }

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
    return { success: true, status: 'completed' };
  } catch (err: any) {
    console.error('Unexpected upload error:', err);
    return { success: false, error: err?.message || 'An unexpected error occurred during upload.' };
  }
}

// Finalizes upload of markdown file after uploading missing images
export async function finalizeUploadWithImages(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  // 1. Auth check
  const auth = await isAuthenticated();
  if (!auth) {
    return { success: false, error: 'Unauthorized.' };
  }

  const shortId = formData.get('shortId') as string;
  const fileName = formData.get('fileName') as string;
  const markdownContent = formData.get('markdownContent') as string;

  if (!shortId || !fileName || !markdownContent) {
    return { success: false, error: 'Missing required upload parameters.' };
  }

  const imageFiles = formData.getAll('images') as File[];

  try {
    const imageUrls: Record<string, string> = {};
    const uploadedStoragePaths: string[] = [];

    // Programmatically check and create public 'shares' bucket if not exist
    try {
      const { data: buckets } = await supabaseServer.storage.listBuckets();
      if (!buckets?.some(b => b.name === 'shares')) {
        await supabaseServer.storage.createBucket('shares', {
          public: true,
          allowedMimeTypes: ['image/*'],
        });
      }
    } catch (bucketErr) {
      console.warn('Failed to ensure bucket exists, continuing upload:', bucketErr);
    }

    // Upload each image file to public 'shares' bucket (converting to WebP)
    for (const imageFile of imageFiles) {
      const originalFilename = imageFile.name;
      
      // Extract file buffer for sharp
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      let webpBuffer: Buffer;
      let isConverted = false;

      try {
        // SVG vectors should not be rasterized to WebP
        const isSvg = originalFilename.toLowerCase().endsWith('.svg');
        if (!isSvg) {
          console.log(`Server: Converting ${originalFilename} to WebP on-the-fly...`);
          webpBuffer = await sharp(buffer)
            .webp({ quality: 80 })
            .toBuffer();
          isConverted = true;
        } else {
          webpBuffer = buffer;
        }
      } catch (sharpErr) {
        console.warn(`Server: Sharp WebP conversion failed for ${originalFilename}, falling back to original buffer:`, sharpErr);
        webpBuffer = buffer;
      }

      const baseName = originalFilename.substring(0, originalFilename.lastIndexOf('.')) || originalFilename;
      const finalFilename = isConverted ? `${baseName}.webp` : originalFilename;
      const contentType = isConverted ? 'image/webp' : imageFile.type;
      const imagePath = `${shortId}/${finalFilename}`;

      const { error: imgUploadError } = await supabaseServer.storage
        .from('shares')
        .upload(imagePath, webpBuffer, {
          contentType: contentType,
          cacheControl: '31536000',
          upsert: true,
        });

      if (imgUploadError) {
        console.error(`Failed to upload image ${finalFilename}:`, imgUploadError);
        return { success: false, error: `Image upload failed for ${finalFilename}: ${imgUploadError.message}` };
      }

      uploadedStoragePaths.push(imagePath);

      // Get absolute public URL
      const { data: publicUrlData } = supabaseServer.storage
        .from('shares')
        .getPublicUrl(imagePath);

      // Key the map under the ORIGINAL filename so the markdown rewriter matches it
      imageUrls[originalFilename] = publicUrlData.publicUrl;
      console.log(`Server: Successfully uploaded image. Original: ${originalFilename} -> Public WebP: ${publicUrlData.publicUrl}`);
    }

    // Rewrite markdown image URLs
    const rewrittenMarkdown = rewriteMarkdownImages(markdownContent, imageUrls);
    const storagePath = `${shortId}.md`;

    // Upload rewrited markdown to private storage 'md-files'
    const { error: uploadError } = await supabaseServer.storage
      .from('md-files')
      .upload(storagePath, rewrittenMarkdown, {
        contentType: 'text/markdown',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    // Insert record into PostgreSQL files table
    const { error: dbError } = await supabaseServer
      .from('files')
      .insert({
        short_id: shortId,
        file_name: fileName,
        storage_path: storagePath,
      });

    if (dbError) {
      console.error('Database insertion error:', dbError);
      // Attempt cleanup of markdown file and uploaded WebP images
      await supabaseServer.storage.from('md-files').remove([storagePath]);
      if (uploadedStoragePaths.length > 0) {
        await supabaseServer.storage.from('shares').remove(uploadedStoragePaths);
      }
      return { success: false, error: `Database insertion failed: ${dbError.message}` };
    }

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
    }

    // Clean up associated public images in shares bucket
    const shortId = storagePath.replace(/\.md$/, '');
    try {
      const { data: filesInFolder, error: listError } = await supabaseServer.storage
        .from('shares')
        .list(shortId);

      if (filesInFolder && filesInFolder.length > 0 && !listError) {
        const pathsToDelete = filesInFolder.map(f => `${shortId}/${f.name}`);
        await supabaseServer.storage.from('shares').remove(pathsToDelete);
      }
    } catch (err) {
      console.error('Failed to clean up images from shares storage:', err);
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

// Flips is_accessible to false and clears expires_at
export async function takedownFile(id: string): Promise<{ success: boolean; error?: string }> {
  // 1. Auth check
  const auth = await isAuthenticated();
  if (!auth) {
    return { success: false, error: 'Unauthorized.' };
  }

  try {
    const { error: dbError } = await supabaseServer
      .from('files')
      .update({
        is_accessible: false,
        expires_at: null,
      })
      .eq('id', id);

    if (dbError) {
      console.error('Database takedown error:', dbError);
      return { success: false, error: `Database update failed: ${dbError.message}` };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    console.error('Unexpected takedown error:', err);
    return { success: false, error: err?.message || 'An unexpected error occurred during takedown.' };
  }
}

// Updates sharing state: is_accessible, expires_at, timezone, and password
export async function updateSharingState(
  id: string,
  isAccessible: boolean,
  expiresAt: string | null,
  timezone: string = 'GMT+7',
  password: string | null = null
): Promise<{ success: boolean; error?: string }> {
  // 1. Auth check
  const auth = await isAuthenticated();
  if (!auth) {
    return { success: false, error: 'Unauthorized.' };
  }

  try {
    const { error: dbError } = await supabaseServer
      .from('files')
      .update({
        is_accessible: isAccessible,
        expires_at: expiresAt,
        timezone: timezone,
        password: password,
      })
      .eq('id', id);

    if (dbError) {
      console.error('Database update sharing state error:', dbError);
      return { success: false, error: `Database update failed: ${dbError.message}` };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    console.error('Unexpected update sharing state error:', err);
    return { success: false, error: err?.message || 'An unexpected error occurred.' };
  }
}

// Verifies password for a shareable link and sets a secure cookie if successful
export async function verifySharePassword(
  shortId: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: fileMeta, error: dbError } = await supabaseServer
      .from('files')
      .select('password')
      .eq('short_id', shortId)
      .maybeSingle();

    if (dbError || !fileMeta) {
      return { success: false, error: 'Document not found.' };
    }

    if (fileMeta.password !== password) {
      return { success: false, error: 'Incorrect password.' };
    }

    // Set secure cookie to store the unlocked state
    const cookieStore = await cookies();
    cookieStore.set(`share_pass_${shortId}`, password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours access
      path: '/',
    });

    return { success: true };
  } catch (err: any) {
    console.error('Unexpected password verification error:', err);
    return { success: false, error: err?.message || 'An unexpected error occurred.' };
  }
}

// ==========================================
// DEMO DASHBOARD SERVER ACTIONS
// ==========================================

// 1. Fetch files for a specific demo session
export async function getDemoFiles(demoSessionId: string): Promise<{ success: boolean; files?: unknown[]; error?: string }> {
  if (!demoSessionId || typeof demoSessionId !== 'string') {
    return { success: false, error: 'Invalid session ID.' };
  }
  try {
    const { data: files, error } = await supabaseServer
      .from('files')
      .select('*')
      .eq('is_demo', true)
      .or(`demo_session_id.eq.${demoSessionId},file_name.eq.About MD Share App.md`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching demo files:', error);
      return { success: false, error: error.message };
    }
    return { success: true, files: files || [] };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unexpected error fetching demo files.';
    return { success: false, error: errorMsg };
  }
}

// 2. Upload markdown file for a specific demo session (with 10-file limit check)
export async function uploadDemoMarkdownFile(
  formData: FormData,
  demoSessionId: string
): Promise<{
  success: boolean;
  status?: 'missing_images' | 'completed';
  missingImages?: string[];
  shortId?: string;
  markdownContent?: string;
  fileName?: string;
  error?: string;
}> {
  if (!demoSessionId || typeof demoSessionId !== 'string') {
    return { success: false, error: 'Invalid session ID.' };
  }

  // 10-file limit check
  try {
    const { count, error: countError } = await supabaseServer
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('is_demo', true)
      .eq('demo_session_id', demoSessionId);

    if (countError) {
      console.error('Count query error:', countError);
      return { success: false, error: 'Failed to verify file upload limit.' };
    }

    if (count !== null && count >= 10) {
      return { success: false, error: 'LIMIT REACHED: YOU CAN ONLY UPLOAD UP TO 10 FILES. PLEASE DELETE AN EXISTING FILE FIRST.' };
    }
  } catch (err) {
    console.error('Failed to verify file upload limit:', err);
    return { success: false, error: 'Failed to verify file upload limit.' };
  }

  // Extract and validate file
  const file = formData.get('file') as File | null;
  if (!file) {
    return { success: false, error: 'No file provided.' };
  }

  if (!file.name.endsWith('.md')) {
    return { success: false, error: 'Only .md files are allowed.' };
  }

  try {
    const textContent = await file.text();
    const localImages = scanForLocalImages(textContent);

    if (localImages.length > 0) {
      return {
        success: false,
        status: 'missing_images',
        missingImages: localImages.map(img => img.filename),
        shortId: generateShortId(),
        markdownContent: textContent,
        fileName: file.name,
      };
    }

    const shortId = generateShortId();
    const storagePath = `${shortId}.md`;

    // Upload to private Supabase bucket 'md-files'
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

    // Insert record into PostgreSQL files table
    const { error: dbError } = await supabaseServer
      .from('files')
      .insert({
        short_id: shortId,
        file_name: file.name,
        storage_path: storagePath,
        is_demo: true,
        demo_session_id: demoSessionId,
        is_accessible: true,
      });

    if (dbError) {
      console.error('Database insertion error:', dbError);
      await supabaseServer.storage.from('md-files').remove([storagePath]);
      return { success: false, error: `Database insertion failed: ${dbError.message}` };
    }

    return { success: true, status: 'completed' };
  } catch (err) {
    console.error('Unexpected upload error:', err);
    const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during upload.';
    return { success: false, error: errorMsg };
  }
}

// 3. Finalize demo upload with images
export async function finalizeDemoUploadWithImages(
  formData: FormData,
  demoSessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!demoSessionId || typeof demoSessionId !== 'string') {
    return { success: false, error: 'Invalid session ID.' };
  }

  // 10-file limit check
  try {
    const { count, error: countError } = await supabaseServer
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('is_demo', true)
      .eq('demo_session_id', demoSessionId);

    if (countError) {
      return { success: false, error: 'Failed to verify file upload limit.' };
    }

    if (count !== null && count >= 10) {
      return { success: false, error: 'LIMIT REACHED: YOU CAN ONLY UPLOAD UP TO 10 FILES. PLEASE DELETE AN EXISTING FILE FIRST.' };
    }
  } catch {
    return { success: false, error: 'Failed to verify file upload limit.' };
  }

  const shortId = formData.get('shortId') as string;
  const fileName = formData.get('fileName') as string;
  const markdownContent = formData.get('markdownContent') as string;

  if (!shortId || !fileName || !markdownContent) {
    return { success: false, error: 'Missing required upload parameters.' };
  }

  const imageFiles = formData.getAll('images') as File[];

  try {
    const imageUrls: Record<string, string> = {};
    const uploadedStoragePaths: string[] = [];

    // Ensure shares bucket exists
    try {
      const { data: buckets } = await supabaseServer.storage.listBuckets();
      if (!buckets?.some(b => b.name === 'shares')) {
        await supabaseServer.storage.createBucket('shares', {
          public: true,
          allowedMimeTypes: ['image/*'],
        });
      }
    } catch (bucketErr) {
      console.warn('Failed to ensure bucket exists:', bucketErr);
    }

    for (const imageFile of imageFiles) {
      const originalFilename = imageFile.name;
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      let webpBuffer: Buffer;
      let isConverted = false;

      try {
        const isSvg = originalFilename.toLowerCase().endsWith('.svg');
        if (!isSvg) {
          webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
          isConverted = true;
        } else {
          webpBuffer = buffer;
        }
      } catch {
        webpBuffer = buffer;
      }

      const baseName = originalFilename.substring(0, originalFilename.lastIndexOf('.')) || originalFilename;
      const finalFilename = isConverted ? `${baseName}.webp` : originalFilename;
      const contentType = isConverted ? 'image/webp' : imageFile.type;
      const imagePath = `${shortId}/${finalFilename}`;

      const { error: imgUploadError } = await supabaseServer.storage
        .from('shares')
        .upload(imagePath, webpBuffer, {
          contentType: contentType,
          cacheControl: '31536000',
          upsert: true,
        });

      if (imgUploadError) {
        return { success: false, error: `Image upload failed for ${finalFilename}: ${imgUploadError.message}` };
      }

      uploadedStoragePaths.push(imagePath);

      const { data: publicUrlData } = supabaseServer.storage
        .from('shares')
        .getPublicUrl(imagePath);

      imageUrls[originalFilename] = publicUrlData.publicUrl;
    }

    const rewrittenMarkdown = rewriteMarkdownImages(markdownContent, imageUrls);
    const storagePath = `${shortId}.md`;

    const { error: uploadError } = await supabaseServer.storage
      .from('md-files')
      .upload(storagePath, rewrittenMarkdown, {
        contentType: 'text/markdown',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    const { error: dbError } = await supabaseServer
      .from('files')
      .insert({
        short_id: shortId,
        file_name: fileName,
        storage_path: storagePath,
        is_demo: true,
        demo_session_id: demoSessionId,
        is_accessible: true,
      });

    if (dbError) {
      await supabaseServer.storage.from('md-files').remove([storagePath]);
      if (uploadedStoragePaths.length > 0) {
        await supabaseServer.storage.from('shares').remove(uploadedStoragePaths);
      }
      return { success: false, error: `Database insertion failed: ${dbError.message}` };
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { success: false, error: errorMsg };
  }
}

// 4. Delete demo markdown file
export async function deleteDemoMarkdownFile(
  id: string,
  storagePath: string,
  demoSessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!demoSessionId || typeof demoSessionId !== 'string') {
    return { success: false, error: 'Invalid session ID.' };
  }

  try {
    const { data: fileMeta, error: fetchError } = await supabaseServer
      .from('files')
      .select('file_name, is_demo, demo_session_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !fileMeta) {
      return { success: false, error: 'File not found.' };
    }

    if (fileMeta.file_name.toLowerCase() === 'about md share app.md') {
      return { success: false, error: 'The demo article is pinned and cannot be deleted.' };
    }

    if (!fileMeta.is_demo || fileMeta.demo_session_id !== demoSessionId) {
      return { success: false, error: 'Unauthorized deletion.' };
    }

    // Remove file from storage
    const { error: storageError } = await supabaseServer.storage
      .from('md-files')
      .remove([storagePath]);

    if (storageError) {
      console.error('Storage delete error:', storageError);
    }

    const shortId = storagePath.replace(/\.md$/, '');
    try {
      const { data: filesInFolder, error: listError } = await supabaseServer.storage
        .from('shares')
        .list(shortId);

      if (filesInFolder && filesInFolder.length > 0 && !listError) {
        const pathsToDelete = filesInFolder.map(f => `${shortId}/${f.name}`);
        await supabaseServer.storage.from('shares').remove(pathsToDelete);
      }
    } catch (err) {
      console.error('Failed to clean up images from shares storage:', err);
    }

    // Remove record from database
    const { error: dbError } = await supabaseServer
      .from('files')
      .delete()
      .eq('id', id);

    if (dbError) {
      return { success: false, error: `Database deletion failed: ${dbError.message}` };
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { success: false, error: errorMsg };
  }
}

// 5. Takedown demo file (flips is_accessible to false and clears expires_at)
export async function takedownDemoFile(
  id: string,
  demoSessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!demoSessionId || typeof demoSessionId !== 'string') {
    return { success: false, error: 'Invalid session ID.' };
  }

  try {
    // Verify ownership
    const { data: fileMeta, error: fetchError } = await supabaseServer
      .from('files')
      .select('file_name, is_demo, demo_session_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !fileMeta) {
      return { success: false, error: 'File not found.' };
    }

    if (fileMeta.file_name.toLowerCase() === 'about md share app.md') {
      return { success: false, error: 'The demo article is pinned and its share configuration cannot be modified.' };
    }

    if (!fileMeta.is_demo || fileMeta.demo_session_id !== demoSessionId) {
      return { success: false, error: 'Unauthorized operation.' };
    }

    const { error: dbError } = await supabaseServer
      .from('files')
      .update({
        is_accessible: false,
        expires_at: null,
      })
      .eq('id', id);

    if (dbError) {
      console.error('Database takedown error:', dbError);
      return { success: false, error: `Database update failed: ${dbError.message}` };
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { success: false, error: errorMsg };
  }
}

// 6. Update demo sharing state: is_accessible, expires_at, timezone, and password
export async function updateDemoSharingState(
  id: string,
  isAccessible: boolean,
  expiresAt: string | null,
  timezone: string = 'GMT+7',
  password: string | null = null,
  demoSessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!demoSessionId || typeof demoSessionId !== 'string') {
    return { success: false, error: 'Invalid session ID.' };
  }

  try {
    // Verify ownership
    const { data: fileMeta, error: fetchError } = await supabaseServer
      .from('files')
      .select('file_name, is_demo, demo_session_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !fileMeta) {
      return { success: false, error: 'File not found.' };
    }

    if (fileMeta.file_name.toLowerCase() === 'about md share app.md') {
      return { success: false, error: 'The demo article is pinned and its share configuration cannot be modified.' };
    }

    if (!fileMeta.is_demo || fileMeta.demo_session_id !== demoSessionId) {
      return { success: false, error: 'Unauthorized operation.' };
    }

    const { error: dbError } = await supabaseServer
      .from('files')
      .update({
        is_accessible: isAccessible,
        expires_at: expiresAt,
        timezone: timezone,
        password: password,
      })
      .eq('id', id);

    if (dbError) {
      console.error('Database update sharing state error:', dbError);
      return { success: false, error: `Database update failed: ${dbError.message}` };
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { success: false, error: errorMsg };
  }
}


