import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  obterVersaoAppApi,
  listarVersoesAppApi,
  salvarVersaoAppApi,
  excluirVersaoAppApi,
  obterFooterConfigApi,
  salvarFooterConfigApi,
} from './api';

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
    const apiRes = await obterFooterConfigApi();
    if (apiRes.sucesso && apiRes.config && Object.keys(apiRes.config).length > 0) {
      const merged = { ...defaultFooterConfig, ...apiRes.config };
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
    await salvarFooterConfigApi(configClean);
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

  // 1. Prioriza API MySQL na hospedagem
  try {
    const apiRes = await obterVersaoAppApi();
    if (apiRes.sucesso && apiRes.versao) {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_cached_app_version', apiRes.versao);
        } catch (e) {}
      }
      return apiRes.versao;
    }
  } catch (e) {}

  // 2. Retorna versão em cache ou padrão
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

  // 1. Prioriza API MySQL
  try {
    const apiVersoes = await listarVersoesAppApi();
    if (apiVersoes && apiVersoes.length > 0) {
      const mapped: AppVersionRecord[] = apiVersoes.map((v: any) => ({
        id: Number(v.id),
        versao: v.versao,
        descricao: v.notas || v.descricao || '',
        data_criacao: v.data_atualizacao || v.data_criacao || new Date().toISOString(),
      }));
      return mapped;
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

  // 2. Grava na API MySQL
  try {
    await salvarVersaoAppApi(v, d);
  } catch (e) {}

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

  // 2. Remove da API MySQL
  try {
    await excluirVersaoAppApi(idOrVersao);
  } catch (e) {}

  return true;
}

export async function cleanDatabaseFooterConfigVersion(): Promise<boolean> {
  return true;
}


