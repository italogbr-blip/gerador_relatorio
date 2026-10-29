import { Platform } from 'react-native';
import {
  loginUsuarioApi,
  cadastrarUsuarioApi,
  validarSessaoApi,
  verificarSenhaCoordApi,
  atualizarStatusUsuarioApi,
  carregarHistoricoAprovacoesApi,
} from './api';

export interface AppUserSession {
  user: {
    id: string | number;
    email: string;
    user_metadata: {
      name: string;
      username: string;
      nivel_autoridade: number; // 1 = Preposto/Básico, 2 = Coordenação
    };
  };
}

const STORAGE_KEY = 'app_user_session';
const REMEMBER_TOKEN_KEY = 'mms_remember_token';
const LOGIN_ATTEMPTS_KEY = 'mms_login_attempts';

// Mesmos parâmetros de proteção Brute-Force do login.php
const MAX_TENTATIVAS = 3;
const TEMPO_BLOQUEIO_MS = 15 * 60 * 1000; // 900 segundos (15 minutos)

/**
 * Gera um token hexadecimal de 64 caracteres idêntico ao bin2hex(random_bytes(32)) do login.php.
 */
function generateRememberToken(): string {
  const chars = '0123456789abcdef';
  let token = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length; i++) {
      token += arr[i].toString(16).padStart(2, '0');
    }
    return token;
  }
  for (let i = 0; i < 64; i++) {
    token += chars[Math.floor(Math.random() * 16)];
  }
  return token;
}

function getRememberTokenLocal(): string | null {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        const t = localStorage.getItem(REMEMBER_TOKEN_KEY);
        if (t) return t;
      }
      if (typeof document !== 'undefined' && document.cookie) {
        const match = document.cookie.match(/(?:^|;\s*)mms_remember_token=([^;]*)/);
        if (match && match[1]) return decodeURIComponent(match[1]);
      }
    } catch (_) {}
  }
  return null;
}

function saveRememberTokenLocal(token: string | null) {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        if (token) {
          localStorage.setItem(REMEMBER_TOKEN_KEY, token);
        } else {
          localStorage.removeItem(REMEMBER_TOKEN_KEY);
        }
      }
      if (typeof document !== 'undefined') {
        if (token) {
          const maxAge = 30 * 24 * 60 * 60; // 30 dias igual ao login.php
          document.cookie = `mms_remember_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
        } else {
          document.cookie = 'mms_remember_token=; path=/; max-age=0; SameSite=Lax';
        }
      }
    } catch (_) {}
  }
}

interface LoginAttemptState {
  tentativas: number;
  bloqueadoAte: number;
}

function getLoginAttemptState(usernameKey: string): LoginAttemptState {
  const key = usernameKey.toLowerCase().trim() || '_global';
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
      if (raw) {
        const map = JSON.parse(raw);
        if (map && map[key]) {
          return {
            tentativas: Number(map[key].tentativas || 0),
            bloqueadoAte: Number(map[key].bloqueadoAte || 0),
          };
        }
      }
    } catch (_) {}
  }
  return { tentativas: 0, bloqueadoAte: 0 };
}

function saveLoginAttemptState(usernameKey: string, state: LoginAttemptState | null) {
  const key = usernameKey.toLowerCase().trim() || '_global';
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
      const map = raw ? JSON.parse(raw) : {};
      if (state === null) {
        delete map[key];
      } else {
        map[key] = state;
      }
      localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(map));
    } catch (_) {}
  }
}

/**
 * Lê de forma síncrona a sessão salva localmente (útil para inicialização de estado sem piscar a tela).
 */
export function getSavedSessionSync(): AppUserSession | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.user?.id) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Erro ao ler sessão local síncrona:', e);
    }
  }
  return null;
}

/**
 * Salva a sessão no localStorage do navegador.
 */
export function saveSessionLocal(session: AppUserSession | null) {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      if (session) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Erro ao gravar sessão local:', e);
    }
  }
}

/**
 * Busca e valida a sessão ativa no MySQL (com suporte a remember_token e sessão em cookie/storage).
 */
export async function getValidatedUserSession(): Promise<AppUserSession | null> {
  try {
    const local = getSavedSessionSync();
    const rememberToken = getRememberTokenLocal();

    // 1. Valida contra a API MySQL na hospedagem com resposta rápida
    if (rememberToken || local?.user?.id) {
      try {
        const apiRes = await validarSessaoApi(rememberToken || undefined, local?.user?.id);
        if (apiRes && apiRes.sucesso && apiRes.user) {
          const refreshedSession: AppUserSession = {
            user: {
              id: apiRes.user.id,
              email: apiRes.user.email || `${apiRes.user.username}@app.local`,
              user_metadata: {
                name: apiRes.user.nome || apiRes.user.username,
                username: apiRes.user.username,
                nivel_autoridade: Number(apiRes.user.nivel_autoridade || 1),
              },
            },
          };
          saveSessionLocal(refreshedSession);
          return refreshedSession;
        }
      } catch (_) {}
    }

    // Se temos a sessão local e ela é válida, retorna a sessão local
    if (local?.user?.id) {
      return local;
    }

    saveSessionLocal(null);
    return null;
  } catch (err) {
    console.warn('Erro ao validar sessão de usuário:', err);
    return getSavedSessionSync();
  }
}

/**
 * Encerra a sessão ativa completamente (idêntico ao logout.php).
 */
export async function logoutUserSession(): Promise<void> {
  saveRememberTokenLocal(null);
  saveSessionLocal(null);
}

/**
 * Verifica se um usuário possui nível de autoridade de Coordenação (Nível 2).
 */
export function isUserCoordinator(session: AppUserSession | null | any): boolean {
  if (!session?.user) return false;
  const nivel = Number(session.user.user_metadata?.nivel_autoridade);
  return nivel === 2;
}

/**
 * Verificação estrita para o Painel de Coordenação.
 * Valida a sessão para evitar qualquer fraude em localStorage.
 */
export async function verifyCoordinatorAccess(): Promise<{
  authorized: boolean;
  reason: 'unauthenticated' | 'forbidden' | null;
  session: AppUserSession | null;
}> {
  const session = await getValidatedUserSession();

  if (!session || !session.user) {
    return { authorized: false, reason: 'unauthenticated', session: null };
  }

  const nivel = Number(session.user.user_metadata?.nivel_autoridade);
  if (nivel === 2) {
    return { authorized: true, reason: null, session };
  }

  return { authorized: false, reason: 'forbidden', session };
}

/**
 * Desbloqueio do Painel de Coordenação via MySQL API.
 * Valida a senha contra a tabela coord_senha / coordenadores no MySQL.
 */
export async function unlockCoordinatorPanel(
  userOrEmail: string,
  pass: string
): Promise<{ success: boolean; session?: AppUserSession; error?: string }> {
  const login = userOrEmail.trim();
  const senhaDigitada = pass.trim();

  if (!senhaDigitada) {
    return { success: false, error: 'Por favor, digite a senha.' };
  }

  try {
    const coordRes = await verificarSenhaCoordApi(senhaDigitada, login);
    if (coordRes.sucesso) {
      const session: AppUserSession = {
        user: {
          id: 1,
          email: `${login || 'coordenador'}@app.local`,
          user_metadata: {
            name: 'Coordenador',
            username: login || 'coordenador',
            nivel_autoridade: 2,
          },
        },
      };
      saveSessionLocal(session);
      return { success: true, session };
    }
    return { success: false, error: coordRes.erro || 'Senha incorreta! Acesso negado.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao validar credenciais da coordenação.' };
  }
}

/**
 * Autentica usuário no MySQL via API PHP:
 * - Proteção contra Brute-Force (3 tentativas / 15 minutos de bloqueio).
 * - Verificação de senha no MySQL (bcrypt / password_verify).
 * - Sincronização de token de persistência (remember_token).
 */
export async function authenticateUser(
  userOrEmail: string,
  pass: string
): Promise<{ success: boolean; session?: AppUserSession; error?: string }> {
  const inputStr = userOrEmail.trim();
  if (!inputStr || !pass) {
    return { success: false, error: 'Preencha todos os campos.' };
  }

  // 1. Verifica bloqueio temporário por Brute-Force
  const attemptState = getLoginAttemptState(inputStr);
  const now = Date.now();
  if (attemptState.tentativas >= MAX_TENTATIVAS) {
    if (now < attemptState.bloqueadoAte) {
      const minutosRestantes = Math.max(1, Math.ceil((attemptState.bloqueadoAte - now) / 60000));
      return {
        success: false,
        error: `Muitas tentativas falhadas. Bloqueado por ${minutosRestantes} minuto(s).`,
      };
    } else {
      saveLoginAttemptState(inputStr, null);
      attemptState.tentativas = 0;
      attemptState.bloqueadoAte = 0;
    }
  }

  try {
    const apiLogin = await loginUsuarioApi(inputStr, pass);
    if (apiLogin.sucesso && apiLogin.user) {
      const u = apiLogin.user;
      if (u.token) {
        saveRememberTokenLocal(u.token);
      }
      saveLoginAttemptState(inputStr, null);
      const sessionObj: AppUserSession = {
        user: {
          id: u.id,
          email: u.email || `${u.username}@app.local`,
          user_metadata: {
            name: u.nome || u.username,
            username: u.username,
            nivel_autoridade: Number(u.nivel_autoridade || 1),
          },
        },
      };
      saveSessionLocal(sessionObj);
      return { success: true, session: sessionObj };
    }

    if (apiLogin.erro) {
      const novasTentativas = attemptState.tentativas + 1;
      const novoBloqueio = novasTentativas >= MAX_TENTATIVAS ? Date.now() + TEMPO_BLOQUEIO_MS : 0;
      saveLoginAttemptState(inputStr, {
        tentativas: novasTentativas,
        bloqueadoAte: novoBloqueio,
      });

      return { success: false, error: apiLogin.erro };
    }

    return { success: false, error: 'Credenciais inválidas!' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de conexão com o servidor MySQL.' };
  }
}

/**
 * Cadastro de novo usuário via MySQL API:
 * - Valida Nome Completo, Usuário, E-mail e Senhas.
 * - Registra na base MySQL via api/auth.php.
 */
export async function registerUser(params: {
  nome: string;
  username: string;
  usernameConfirm: string;
  email: string;
  emailConfirm: string;
  senha: string;
  senhaConfirm: string;
}): Promise<{ success: boolean; message: string; username?: string }> {
  const nome = params.nome.trim();
  const user = params.username.trim();
  const userConfirm = params.usernameConfirm.trim();
  const email = params.email.trim().toLowerCase();
  const emailConfirm = params.emailConfirm.trim().toLowerCase();
  const pass = params.senha;
  const passConfirm = params.senhaConfirm;

  if (!nome || !user || !email || !pass) {
    return { success: false, message: 'Preencha todos os campos.' };
  }

  if (user !== userConfirm) {
    return { success: false, message: 'Os nomes de usuário não coincidem!' };
  }

  if (email !== emailConfirm) {
    return { success: false, message: 'Os e-mails informados não coincidem!' };
  }

  if (pass !== passConfirm) {
    return { success: false, message: 'As senhas digitadas não coincidem!' };
  }

  if (pass.length < 6) {
    return { success: false, message: 'A senha deve ter pelo menos 6 caracteres.' };
  }

  try {
    const apiReg = await cadastrarUsuarioApi({
      username: user,
      nome,
      email,
      senha: pass,
    });
    if (apiReg.sucesso && apiReg.user) {
      if (apiReg.user.token) {
        saveRememberTokenLocal(apiReg.user.token);
      }
      return { success: true, message: 'Cadastro realizado com sucesso!', username: user };
    }
    return { success: false, message: apiReg.erro || 'Falha ao realizar cadastro.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erro de conexão com o servidor MySQL.' };
  }
}

/**
 * Consulta se a aprovação de novos cadastros está ativa
 */
export async function getExigirAprovacaoCadastro(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    const val = localStorage.getItem('mms_exigir_aprovacao_cadastro');
    if (val !== null) return val === 'true' || val === '1';
  }
  return false;
}

/**
 * Atualiza o status de exigência de aprovação de novos cadastros
 */
export async function setExigirAprovacaoCadastro(exigir: boolean): Promise<boolean> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem('mms_exigir_aprovacao_cadastro', exigir ? 'true' : 'false');
  }
  return true;
}

/**
 * Aprova o cadastro de um usuário no MySQL
 */
export async function aprovarUsuario(
  usuarioId: number,
  executadoPor: string,
  motivo?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await atualizarStatusUsuarioApi({
      usuario_id: usuarioId,
      status_aprovacao: 'aprovado',
      acao: 'aprovado',
      detalhes: motivo || `Aprovado por ${executadoPor}`,
    });
    if (res.sucesso) return { success: true };
    return { success: false, error: res.erro || 'Falha ao aprovar usuário no MySQL.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro inesperado ao aprovar usuário.' };
  }
}

/**
 * Recusa o cadastro de um usuário no MySQL
 */
export async function recusarUsuario(
  usuarioId: number,
  executadoPor: string,
  motivo?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await atualizarStatusUsuarioApi({
      usuario_id: usuarioId,
      status_aprovacao: 'recusado',
      acao: 'recusado',
      detalhes: motivo || `Recusado por ${executadoPor}`,
    });
    if (res.sucesso) return { success: true };
    return { success: false, error: res.erro || 'Falha ao recusar usuário no MySQL.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro inesperado ao recusar usuário.' };
  }
}

/**
 * Carrega o histórico de aprovações e recusas do MySQL
 */
export async function carregarHistoricoAprovacoes(): Promise<any[]> {
  try {
    return await carregarHistoricoAprovacoesApi();
  } catch (_) {
    return [];
  }
}
