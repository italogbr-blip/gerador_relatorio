import { Platform } from 'react-native';
import { supabase } from './supabase';

export interface FooterConfig {
  prefixo: string;
  destaque1: string;
  corDestaque1: string;
  negrito1: boolean;
  conector: string;
  destaque2: string;
  corDestaque2: string;
  negrito2: boolean;
  versao: string;
}

export const defaultFooterConfig: FooterConfig = {
  prefixo: 'DESENVOLVIDO POR ',
  destaque1: 'VERO STUDIO',
  corDestaque1: '#475569',
  negrito1: true,
  conector: ' © PARA ',
  destaque2: 'MMS SUPORTE LOGÍSTICO',
  corDestaque2: '#2563eb',
  negrito2: true,
  versao: 'V1.2.5',
};

const STORAGE_KEY = 'mms_footer_config';

export function getLocalFooterConfig(): FooterConfig {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...defaultFooterConfig, ...JSON.parse(saved) };
      }
    } catch (e) {}
  }
  return defaultFooterConfig;
}

export async function fetchFooterConfig(): Promise<FooterConfig> {
  const local = getLocalFooterConfig();
  try {
    const { data, error } = await supabase
      .from('configuracoes_popups')
      .select('mensagem')
      .eq('estilo', 'footer_config')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    if (!error && data && data.mensagem) {
      const parsed = JSON.parse(data.mensagem);
      const merged = { ...defaultFooterConfig, ...parsed };
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {}
      }
      return merged;
    }
  } catch (e) {}
  return local;
}

export async function saveFooterConfig(config: FooterConfig): Promise<boolean> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {}
  }

  try {
    const payload = {
      mensagem: JSON.stringify(config),
      estilo: 'footer_config',
      duracao: 1,
      frequencia: 'sempre',
    };

    // Tenta atualizar se já existe ou insere novo
    const { data: existing } = await supabase
      .from('configuracoes_popups')
      .select('id')
      .eq('estilo', 'footer_config')
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('configuracoes_popups')
        .update(payload)
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('configuracoes_popups')
        .insert([payload]);
    }
    return true;
  } catch (e) {
    return true; // LocalStorage já garantiu a persistência local
  }
}

export interface AppVersionRecord {
  id?: number;
  versao: string;
  descricao: string;
  data_criacao?: string;
}

export async function fetchLatestAppVersion(): Promise<string> {
  let cached: string | null = null;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      cached = localStorage.getItem('mms_cached_app_version');
    } catch (e) {}
  }
  try {
    const { data, error } = await supabase
      .from('mms_versao_app')
      .select('versao')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.versao) {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_cached_app_version', data.versao);
        } catch (e) {}
      }
      return data.versao;
    }
  } catch (e) {}
  return cached || 'V1.2.4';
}

export async function fetchAllAppVersions(): Promise<AppVersionRecord[]> {
  try {
    const { data, error } = await supabase
      .from('mms_versao_app')
      .select('*')
      .order('id', { ascending: false })
      .limit(50);

    if (!error && data) {
      return data as AppVersionRecord[];
    }
  } catch (e) {}
  return [];
}

export async function insertAppVersion(versao: string, descricao: string): Promise<boolean> {
  try {
    const v = versao.trim();
    const d = descricao.trim();
    const { error } = await supabase
      .from('mms_versao_app')
      .insert([{
        versao: v,
        descricao: d,
        data_criacao: new Date().toISOString(),
      }]);
    if (!error) {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_cached_app_version', v);
        } catch (e) {}
      }
      return true;
    }
  } catch (e) {}
  return false;
}

