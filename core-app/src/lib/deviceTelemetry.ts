import { Platform } from 'react-native';
import { supabase } from './supabase';

export interface DeviceTelemetryInfo {
  deviceId: string;
  ip: string;
  model: string;
  os: string;
  browser: string;
  screenResolution: string;
  hardware: string;
  language: string;
  timezone: string;
  userAgent: string;
  dataRegistro: string;
  tipo: 'acesso_gerador' | 'login_sucesso' | 'login_falha' | 'painel_coord';
  username?: string;
  usuarioId?: number | string | null;
}

const STORAGE_DEVICE_ID_KEY = 'mms_telemetry_device_id';
const STORAGE_ACCESS_LOGS_KEY = 'mms_telemetry_access_logs';

/**
 * Obtém ou gera um Identificador Único e Permanente para o Aparelho / Telefone (Device ID)
 */
export function getOrCreateDeviceId(): string {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      let savedId = localStorage.getItem(STORAGE_DEVICE_ID_KEY);
      if (!savedId) {
        // Tenta buscar no sessionStorage ou gera novo UUID
        if (typeof sessionStorage !== 'undefined') {
          savedId = sessionStorage.getItem(STORAGE_DEVICE_ID_KEY);
        }
      }
      if (savedId && savedId.trim() !== '') {
        const cleaned = savedId.replace(/^MMS-/i, '');
        if (cleaned !== savedId) {
          localStorage.setItem(STORAGE_DEVICE_ID_KEY, cleaned);
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(STORAGE_DEVICE_ID_KEY, cleaned);
          }
        }
        return cleaned;
      }

      // Gera um identificador único de hardware/aparelho padrão DEV-XXXXXXXX-XXXX
      const randomSegment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const timestampSegment = Date.now().toString(36).substring(2, 6).toUpperCase();
      const newId = `DEV-${timestampSegment}-${randomSegment()}-${randomSegment()}`;

      localStorage.setItem(STORAGE_DEVICE_ID_KEY, newId);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(STORAGE_DEVICE_ID_KEY, newId);
      }
      return newId;
    } catch (_) {}
  }
  return 'DEV-LOCAL-001';
}

/**
 * Detecta marca, modelo e sistema do aparelho a partir do User Agent e telas
 */
export function detectDeviceModel(): { model: string; os: string; browser: string } {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
    return {
      model: Platform.OS === 'ios' ? 'Apple iPhone/iPad' : 'Dispositivo Android',
      os: `${Platform.OS.toUpperCase()} Native App`,
      browser: 'Expo Native WebView',
    };
  }

  const ua = navigator.userAgent || '';
  let model = 'Dispositivo Desconhecido';
  let os = 'Sistema Não Identificado';
  let browser = 'Navegador Padrão';

  // 1. Identificação do Sistema Operacional
  if (/iPhone/i.test(ua)) {
    os = 'iOS';
    const match = ua.match(/OS (\d+[._]\d+)/i);
    if (match) os = `iOS ${match[1].replace('_', '.')}`;
    model = 'Apple iPhone';
    if (typeof window !== 'undefined') {
      const w = window.screen.width;
      const h = window.screen.height;
      if ((w === 430 && h === 932) || (w === 932 && h === 430)) model = 'Apple iPhone 15/14 Pro Max';
      else if ((w === 393 && h === 852) || (w === 852 && h === 393)) model = 'Apple iPhone 15/14 Pro';
      else if ((w === 390 && h === 844) || (w === 844 && h === 390)) model = 'Apple iPhone 14/13/12';
      else if ((w === 414 && h === 896) || (w === 896 && h === 414)) model = 'Apple iPhone 11/XR/XS Max';
      else if ((w === 375 && h === 667) || (w === 667 && h === 375)) model = 'Apple iPhone SE / 8';
    }
  } else if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    os = 'iPadOS';
    model = 'Apple iPad';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    const osMatch = ua.match(/Android (\d+(\.\d+)?)/i);
    if (osMatch) os = `Android ${osMatch[1]}`;

    // Tenta extrair o modelo do Android (ex: SM-G998B, Redmi Note 10, etc.)
    const modelMatch = ua.match(/;\s*([^;)]+)\s*Build/i);
    if (modelMatch && modelMatch[1]) {
      const rawModel = modelMatch[1].trim();
      if (/SM-/i.test(rawModel)) model = `Samsung Galaxy (${rawModel})`;
      else if (/Redmi|POCO|Mi\s/i.test(rawModel)) model = `Xiaomi (${rawModel})`;
      else if (/moto/i.test(rawModel)) model = `Motorola (${rawModel})`;
      else if (/Pixel/i.test(rawModel)) model = `Google Pixel (${rawModel})`;
      else model = `Android (${rawModel})`;
    } else {
      model = 'Smartphone Android';
    }
  } else if (/Windows/i.test(ua)) {
    model = 'Computador / PC';
    if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10 / 11';
    else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
    else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
    else os = 'Windows PC';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    model = 'Apple Mac / MacBook';
    const macMatch = ua.match(/Mac OS X (\d+[._]\d+)/i);
    os = macMatch ? `macOS ${macMatch[1].replace('_', '.')}` : 'macOS';
  } else if (/Linux/i.test(ua)) {
    model = 'Computador Linux';
    os = 'Linux';
  }

  // 2. Identificação do Navegador
  if (/Edg\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/Chrome\//i.test(ua) && !/Chromium|OPR|Edg/i.test(ua)) {
    browser = /Mobile/i.test(ua) ? 'Chrome Mobile' : 'Google Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    browser = /Mobile/i.test(ua) ? 'Safari Mobile' : 'Apple Safari';
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'Mozilla Firefox';
  } else if (/OPR|Opera/i.test(ua)) {
    browser = 'Opera';
  }

  return { model, os, browser };
}

/**
 * Cache do IP em memória para evitar chamadas de rede repetitivas
 */
let cachedPublicIp: string | null = null;
let lastIpFetchTime = 0;

/**
 * Obtém o IP público real com timeout de 2.5s
 */
export async function getPublicIp(): Promise<string> {
  const now = Date.now();
  if (cachedPublicIp && now - lastIpFetchTime < 1000 * 60 * 10) {
    return cachedPublicIp;
  }

  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('mms_last_detected_ip');
      if (stored) cachedPublicIp = stored;
    } catch (_) {}
  }

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;

    const res = await fetch('https://api.ipify.org?format=json', {
      signal: controller ? controller.signal : undefined,
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        cachedPublicIp = data.ip;
        lastIpFetchTime = now;
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('mms_last_detected_ip', data.ip);
          } catch (_) {}
        }
        return data.ip;
      }
    }
  } catch (_) {}

  return cachedPublicIp || '127.0.0.1';
}

/**
 * Coleta todas as informações de telemetria do aparelho
 */
export async function collectDeviceTelemetry(
  tipo: 'acesso_gerador' | 'login_sucesso' | 'login_falha' | 'painel_coord' = 'acesso_gerador',
  username?: string | any,
  usuarioId?: number | string | null
): Promise<DeviceTelemetryInfo> {
  const deviceId = getOrCreateDeviceId();
  const { model, os, browser } = detectDeviceModel();
  const ip = await getPublicIp();

  let resolvedUsername: string | undefined;
  if (typeof username === 'string' && username.trim() !== '') {
    resolvedUsername = username.trim();
  } else if (typeof username === 'object' && username) {
    resolvedUsername = username.usuario || username.username;
  }

  // Tenta puxar preposto previamente identificado deste aparelho
  if (!resolvedUsername && Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const savedPrep = localStorage.getItem('mms_telemetria_preposto');
      if (savedPrep && savedPrep.trim() !== '') {
        resolvedUsername = savedPrep.trim();
      }
    } catch (_) {}
  }

  // Se ainda não tiver preposto, busca o último relatório gerado a partir deste IP
  if (!resolvedUsername && ip && ip !== '127.0.0.1') {
    try {
      const { data } = await supabase
        .from('relatorios')
        .select('dados_json')
        .eq('ip_origem', ip)
        .order('id', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const rawJson = data[0].dados_json;
        const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
        const prep = parsed?.preposto || parsed?.nome_preposto || parsed?.preposto_nome || parsed?.responsavel;
        if (prep && typeof prep === 'string' && prep.trim() !== '' && prep.trim().toUpperCase() !== 'N/A') {
          resolvedUsername = prep.trim();
          if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('mms_telemetria_preposto', resolvedUsername);
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  let screenResolution = 'N/A';
  let hardware = 'Padrão';
  let language = 'pt-BR';
  let timezone = 'America/Sao_Paulo';
  let userAgent = 'App';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const w = window.screen.width;
      const h = window.screen.height;
      const pr = window.devicePixelRatio || 1;
      screenResolution = `${w} x ${h} (${pr}x)`;
      language = navigator.language || 'pt-BR';
      userAgent = navigator.userAgent || 'Web';
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

      const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} núcleos CPU` : '';
      const ram = (navigator as any).deviceMemory ? `~${(navigator as any).deviceMemory}GB RAM` : '';
      hardware = [cores, ram].filter(Boolean).join(', ') || 'Dispositivo Móvel/Web';
    } catch (_) {}
  }

  return {
    deviceId,
    ip,
    model,
    os,
    browser,
    screenResolution,
    hardware,
    language,
    timezone,
    userAgent,
    dataRegistro: new Date().toISOString(),
    tipo,
    username: resolvedUsername || 'Visitante',
    usuarioId: usuarioId || null,
  };
}

/**
 * Registra o acesso do dispositivo no banco de dados e no cache local
 */
export async function registerDeviceAccess(
  tipo: 'acesso_gerador' | 'login_sucesso' | 'login_falha' | 'painel_coord' = 'acesso_gerador',
  username?: string | any,
  usuarioId?: number | string | null
): Promise<DeviceTelemetryInfo> {
  const telemetry = await collectDeviceTelemetry(tipo, username, usuarioId);
  const nomeFinal = telemetry.username && telemetry.username !== 'Visitante' ? telemetry.username : undefined;

  // 1. Grava no LocalStorage para acesso instantâneo na UI
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_ACCESS_LOGS_KEY);
      const list: DeviceTelemetryInfo[] = raw ? JSON.parse(raw) : [];
      list.unshift(telemetry);
      localStorage.setItem(STORAGE_ACCESS_LOGS_KEY, JSON.stringify(list.slice(0, 100)));

      // Atualiza também último acesso registrado
      localStorage.setItem('mms_last_access_record', JSON.stringify(telemetry));
    } catch (_) {}
  }

  // 2. Grava no Supabase (coord_acessos_falhos) como telemetria centralizada
  // Guardamos os metadados do aparelho completos no campo user_agent
  try {
    const payload = {
      usuario_id: usuarioId ? Number(usuarioId) : null,
      username: nomeFinal || (tipo === 'acesso_gerador' ? 'Visitante (Gerador)' : 'Acesso Geral'),
      ip: telemetry.ip,
      user_agent: JSON.stringify({
        deviceId: telemetry.deviceId,
        usuario: nomeFinal || 'Visitante',
        model: telemetry.model,
        os: telemetry.os,
        browser: telemetry.browser,
        screen: telemetry.screenResolution,
        hardware: telemetry.hardware,
        timezone: telemetry.timezone,
        tipo: telemetry.tipo,
        versao: '2.4.0',
      }),
      data_tentativa: telemetry.dataRegistro,
    };

    await supabase.from('coord_acessos_falhos').insert([payload]);
  } catch (err) {
    console.warn('Falha na gravação remota de telemetria:', err);
  }

  // 3. Se for login com sucesso, grava também em registro_logins
  if (tipo === 'login_sucesso') {
    try {
      await supabase.from('registro_logins').insert([{
        usuario_id: usuarioId ? Number(usuarioId) : 1,
        ip: telemetry.ip,
        data_login: telemetry.dataRegistro,
      }]);
    } catch (_) {}
  }

  return telemetry;
}

/**
 * Obtém os registros locais de telemetria
 */
export function getLocalDeviceAccessLogs(): DeviceTelemetryInfo[] {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_ACCESS_LOGS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
  }
  return [];
}
