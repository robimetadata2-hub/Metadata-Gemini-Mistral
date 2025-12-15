
import { createClient } from '@supabase/supabase-js';

// ⚠️ IMPORTANT: REPLACE THESE WITH YOUR ACTUAL SUPABASE PROJECT CREDENTIALS
// You can get these from your Supabase Dashboard -> Project Settings -> API
// The placeholder URL 'https://your-project.supabase.co' is valid syntax to prevent crashes, 
// but you MUST replace it with your actual Supabase URL for authentication to work.

const SUPABASE_URL = 'https://clbzukasviiimihwshtk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsYnp1a2FzdmlpaW1paHdzaHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0MTMyMDUsImV4cCI6MjA3MDk4OTIwNX0.EApf7bcbKwVNBIUIfO0_4BotG-T4aZFb2wHwCMdo3_M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
