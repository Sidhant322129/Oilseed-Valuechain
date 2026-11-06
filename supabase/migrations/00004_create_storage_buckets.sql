-- ============================================================================
-- Migration 00004: Supabase Storage Buckets & Policies
-- Project: AI-Enabled Value Chain Platform for Oilseed Self-Reliance
-- Week 1: System Design and Database Setup
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CREATE STORAGE BUCKETS
-- ----------------------------------------------------------------------------

-- 1.1 'crop-images' bucket: For pest disease photos, crop status images (Publicly readable)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'crop-images',
    'crop-images',
    true,
    15728640, -- 15MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- 1.2 'documents' bucket: For KYC, land title deeds, loan & insurance paperwork (Private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    26214400, -- 25MB limit
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

-- 1.3 'ml-models' bucket: Private storage for AI/ML weights and ONNX artifacts (Weeks 5-6)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ml-models',
    'ml-models',
    false,
    524288000, -- 500MB limit for PyTorch / ONNX / TFLite models
    ARRAY['application/octet-stream', 'application/x-zip-compressed', 'application/zip', 'application/x-tar']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 524288000;

-- ----------------------------------------------------------------------------
-- 2. STORAGE ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- A. 'crop-images' Policies
-- Anyone can view crop images
DROP POLICY IF EXISTS "Public read access for crop images" ON storage.objects;
CREATE POLICY "Public read access for crop images"
ON storage.objects FOR SELECT
USING (bucket_id = 'crop-images');

-- Authenticated users can upload crop images
DROP POLICY IF EXISTS "Authenticated users can upload crop images" ON storage.objects;
CREATE POLICY "Authenticated users can upload crop images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'crop-images');

-- Users can update/delete their own uploaded crop images
DROP POLICY IF EXISTS "Users can update their own crop images" ON storage.objects;
CREATE POLICY "Users can update their own crop images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'crop-images' AND (auth.uid() = owner OR auth.uid()::text = (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "Users can delete their own crop images" ON storage.objects;
CREATE POLICY "Users can delete their own crop images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'crop-images' AND (auth.uid() = owner OR auth.uid()::text = (storage.foldername(name))[1]));

-- B. 'documents' Policies (Private KYC, Deeds, Claims)
-- Users can view their own documents or admins/officers can view
DROP POLICY IF EXISTS "Users and officers can view documents" ON storage.objects;
CREATE POLICY "Users and officers can view documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents' AND (
        auth.uid() = owner OR
        auth.uid()::text = (storage.foldername(name))[1] OR
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role IN ('government', 'admin')
        )
    )
);

-- Authenticated users can upload documents to their folder
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Users can delete their own documents
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents' AND (auth.uid() = owner OR auth.uid()::text = (storage.foldername(name))[1]));

-- C. 'ml-models' Policies (Private Model Storage for Weeks 5-6)
-- Only service role and admin can view and upload ML model files
DROP POLICY IF EXISTS "Admin and service role read ML models" ON storage.objects;
CREATE POLICY "Admin and service role read ML models"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'ml-models' AND
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);

DROP POLICY IF EXISTS "Admin upload ML models" ON storage.objects;
CREATE POLICY "Admin upload ML models"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'ml-models' AND
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);
