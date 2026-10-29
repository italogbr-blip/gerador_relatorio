import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// URL dummy segura para evitar erros de DNS (ERR_NAME_NOT_RESOLVED) caso o projeto antigo tenha sido desativado
const supabaseUrl = 'https://supabase.local';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.localStorage : undefined) : AsyncStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

/**
 * Envia um arquivo PDF para o Storage ou retorna null de forma segura
 */
export async function uploadPdfToSupabaseStorage(
  fileName: string,
  fileData: Blob | Uint8Array | ArrayBuffer
): Promise<string | null> {
  return null;
}
