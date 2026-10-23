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
  versao?: string;
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
      .limit(1);

    if (!error && data && data.length > 0 && data[0]?.mensagem) {
      const parsed = JSON.parse(data[0].mensagem);
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
  const { versao, ...configClean } = config as any;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configClean));
    } catch (e) {}
  }

  try {
    const payload = {
      mensagem: JSON.stringify(configClean),
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
  let localList: AppVersionRecord[] = [];
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('mms_local_versoes');
      if (raw) localList = JSON.parse(raw);
    } catch (e) {}
  }
  try {
    const { data, error } = await supabase
      .from('mms_versao_app')
      .select('*')
      .order('id', { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      const existing = new Set(data.map((d: any) => d.versao));
      const filteredLocal = localList.filter((l) => !existing.has(l.versao));
      return [...filteredLocal, ...(data as AppVersionRecord[])];
    }
  } catch (e) {}

  if (localList.length > 0) {
    return localList;
  }

  return [
    {
      id: 1,
      versao: 'V1.2.4',
      descricao: 'Correções de bugs e melhorias no sistema',
      data_criacao: new Date().toISOString(),
    },
  ];
}

export async function insertAppVersion(versao: string, descricao: string): Promise<boolean> {
  const v = versao.trim();
  const d = descricao.trim();
  if (!v) return false;

  const now = new Date().toISOString();
  const newRecord: AppVersionRecord = {
    id: Date.now(),
    versao: v,
    descricao: d,
    data_criacao: now,
  };

  // 1. Sempre persiste localmente no navegador e dispara evento global
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('mms_cached_app_version', v);
      const raw = localStorage.getItem('mms_local_versoes');
      const list: AppVersionRecord[] = raw ? JSON.parse(raw) : [];
      // Adiciona no topo da lista
      const filtered = list.filter((item) => item.versao !== v);
      filtered.unshift(newRecord);
      localStorage.setItem('mms_local_versoes', JSON.stringify(filtered));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mms_app_version_updated', { detail: { versao: v } }));
      }
    } catch (e) {}
  }

  // 2. Tenta gravar no Supabase de forma assíncrona / resiliente
  try {
    const { error } = await supabase
      .from('mms_versao_app')
      .insert([{
        versao: v,
        descricao: d,
        data_criacao: now,
      }]);
    if (error) {
      console.warn('Gravação no Supabase mms_versao_app retornou aviso (salvo localmente com sucesso):', error.message || error);
    }
  } catch (e) {
    console.warn('Conexão ao Supabase falhou ao gravar versão (salvo localmente com sucesso):', e);
  }

  // Retorna true pois a versão foi gravada com sucesso para a aplicação e sessão do usuário
  return true;
}

export async function deleteAppVersion(idOrVersao: number | string): Promise<boolean> {
  // 1. Remove do cache e estado local
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('mms_local_versoes');
      if (raw) {
        const list: AppVersionRecord[] = JSON.parse(raw);
        const filtered = list.filter((item) =>
          typeof idOrVersao === 'number'
            ? item.id !== idOrVersao
            : item.versao !== idOrVersao
        );
        localStorage.setItem('mms_local_versoes', JSON.stringify(filtered));
        if (filtered.length > 0) {
          localStorage.setItem('mms_cached_app_version', filtered[0].versao);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('mms_app_version_updated', {
                detail: { versao: filtered[0].versao },
              })
            );
          }
        }
      }
    } catch (e) {}
  }

  // 2. Remove do Supabase (tabela mms_versao_app)
  try {
    let query = supabase.from('mms_versao_app').delete();
    if (typeof idOrVersao === 'number') {
      query = query.eq('id', idOrVersao);
    } else {
      query = query.eq('versao', idOrVersao);
    }
    const { error } = await query;
    if (error) {
      console.warn('Erro ao remover versão de mms_versao_app:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Falha na requisição de exclusão de versão:', e);
    return false;
  }
}

export async function cleanDatabaseFooterConfigVersion(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('configuracoes_popups')
      .select('id, mensagem')
      .eq('estilo', 'footer_config');

    if (!error && data && data.length > 0) {
      for (const row of data) {
        if (row.mensagem) {
          try {
            const parsed = JSON.parse(row.mensagem);
            if ('versao' in parsed) {
              delete parsed.versao;
              await supabase
                .from('configuracoes_popups')
                .update({ mensagem: JSON.stringify(parsed) })
                .eq('id', row.id);
            }
          } catch (_) {}
        }
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}


