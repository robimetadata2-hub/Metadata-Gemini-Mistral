
import { createClient } from '@supabase/supabase-js';

// ⚠️ IMPORTANT: REPLACE THESE WITH YOUR ACTUAL SUPABASE PROJECT CREDENTIALS
// You can get these from your Supabase Dashboard -> Project Settings -> API
// The placeholder URL 'https://your-project.supabase.co' is valid syntax to prevent crashes, 
// but you MUST replace it with your actual Supabase URL for authentication to work.

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
