import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://woknxtboezccvsbszpga.supabase.co';
const supabaseAnonKey = 'sb_publishable_JmDSMqTi1RouHLMlOLrtmA_KjTim1uC';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.localStorage : undefined) : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

/**
 * Envia um arquivo PDF para o Supabase Storage (Bucket relatorios_pdf)
 * e retorna a URL pública permanente para salvar no banco de dados.
 */
export async function uploadPdfToSupabaseStorage(
  fileName: string,
  fileData: Blob | Uint8Array | ArrayBuffer
): Promise<string | null> {
  try {
    const filePath = `relatorios_pdf/${Date.now()}_${fileName}`;
    const { data, error } = await supabase.storage
      .from('relatorios_pdf')
      .upload(filePath, fileData, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      console.warn('Storage relatorios_pdf aviso:', error.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('relatorios_pdf')
      .getPublicUrl(filePath);

    return publicUrlData?.publicUrl || null;
  } catch (err: any) {
    console.error('Erro ao enviar PDF para Supabase Storage:', err.message);
    return null;
  }
}
