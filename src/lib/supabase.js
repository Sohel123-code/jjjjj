import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://fzpxenoejuzopwjgauzh.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cHhlbm9lanV6b3B3amdhdXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MzczNDYsImV4cCI6MjEwNzIxMzM0Nn0.Mp55ELzQeJXUhvnabpzZrQpCjWsumdzRpm-LZBJHY5g';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
