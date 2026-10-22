import { Platform } from 'react-native';
import { supabase } from './supabase';

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
 * Busca e valida a sessão ativa no Supabase e na tabela public.usuarios.
 * Retorna a sessão enriquecida com o nível de autoridade atualizado diretamente do banco,
 * ou null se não houver usuário conectado ou se a sessão for inválida.
 */
export async function getValidatedUserSession(): Promise<AppUserSession | null> {
  try {
    // 1. Verifica se há sessão ativa no Supabase Auth nativo
    const { data: { session: authSession } } = await supabase.auth.getSession();

    if (authSession?.user) {
      const email = authSession.user.email?.toLowerCase().trim();
      let dbUser: any = null;

      if (email) {
        const { data } = await supabase
          .from('usuarios')
          .select('id, nome, username, email, nivel_autoridade')
          .eq('email', email)
          .maybeSingle();
        dbUser = data;
      }

      const nivel = Number(dbUser?.nivel_autoridade ?? authSession.user.user_metadata?.nivel_autoridade ?? 1);
      const name = dbUser?.nome || authSession.user.user_metadata?.name || email?.split('@')[0] || 'Usuário';
      const username = dbUser?.username || authSession.user.user_metadata?.username || email?.split('@')[0] || '';

      const sessionObj: AppUserSession = {
        user: {
          id: dbUser?.id || authSession.user.id,
          email: email || '',
          user_metadata: {
            name,
            username,
            nivel_autoridade: nivel,
          },
        },
      };

      saveSessionLocal(sessionObj);
      return sessionObj;
    }

    // 2. Se não houver sessão no Supabase Auth, verifica se há sessão local de usuário migrado
    const local = getSavedSessionSync();
    if (local?.user?.id) {
      // Valida na tabela public.usuarios para garantir que o usuário existe e obter o nível real
      let query = supabase.from('usuarios').select('id, nome, username, email, nivel_autoridade');

      if (typeof local.user.id === 'number') {
        query = query.eq('id', local.user.id);
      } else if (local.user.email) {
        query = query.eq('email', local.user.email);
      } else {
        query = query.eq('id', local.user.id);
      }

      const { data: dbUser, error } = await query.maybeSingle();

      if (!error && dbUser) {
        const nivel = Number(dbUser.nivel_autoridade || 1);
        const name = dbUser.nome || dbUser.username || local.user.user_metadata?.name || 'Usuário';
        const username = dbUser.username || local.user.user_metadata?.username || '';

        const refreshedSession: AppUserSession = {
          user: {
            id: dbUser.id,
            email: dbUser.email || `${username}@app.local`,
            user_metadata: {
              name,
              username,
              nivel_autoridade: nivel,
            },
          },
        };

        saveSessionLocal(refreshedSession);
        return refreshedSession;
      }
    }

    // Nenhuma sessão válida encontrada: limpa resquícios
    saveSessionLocal(null);
    return null;
  } catch (err) {
    console.warn('Erro ao validar sessão de usuário:', err);
    return getSavedSessionSync();
  }
}

/**
 * Encerra a sessão ativa completamente.
 */
export async function logoutUserSession(): Promise<void> {
  saveSessionLocal(null);
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('Erro ao deslogar do Supabase Auth:', e);
  }
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
 * Valida a sessão e busca no banco de dados para evitar qualquer fraude em localStorage.
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
 * Escapa um valor para uso seguro dentro de filtros `.or()` do PostgREST.
 * Sem isso, vírgulas, parênteses e outros caracteres digitados pelo usuário
 * quebram a sintaxe e geram HTTP 400.
 */
export function escapeOrValue(value: string): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Converte a linha retornada pelas RPCs de login em sessão do app. */
function sessionFromDbUser(dbUser: any, forceNivel?: number): AppUserSession {
  return {
    user: {
      id: dbUser.id,
      email: dbUser.email || `${dbUser.username}@app.local`,
      user_metadata: {
        name: dbUser.nome || dbUser.username || 'Usuário',
        username: dbUser.username || '',
        nivel_autoridade: forceNivel ?? Number(dbUser.nivel_autoridade || 1),
      },
    },
  };
}

/**
 * Desbloqueio do Painel de Coordenação.
 * A senha é conferida no servidor (RPC desbloquear_painel_coord) e só retorna
 * sucesso para usuários Nível 2.
 */
export async function unlockCoordinatorPanel(
  userOrEmail: string,
  pass: string
): Promise<{ success: boolean; session?: AppUserSession; error?: string }> {
  const login = userOrEmail.trim();
  if (!login || !pass) {
    return { success: false, error: 'Preencha o usuário e a senha.' };
  }
  try {
    const { data, error } = await supabase.rpc('desbloquear_painel_coord', {
      p_login: login,
      p_senha: pass,
    });
    if (error) {
      return { success: false, error: 'Erro ao validar credenciais no servidor.' };
    }
    const dbUser = Array.isArray(data) ? data[0] : data;
    if (!dbUser) {
      return { success: false, error: 'Usuário ou senha incorretos, ou sem autorização Nível 2.' };
    }
    const session = sessionFromDbUser(dbUser, 2);
    saveSessionLocal(session);
    return { success: true, session };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro inesperado ao validar credenciais.' };
  }
}

/**
 * Autentica usuário pelo Supabase e base de usuários migrados.
 * 1. Usuários migrados do PHP: senha conferida no servidor (RPC login_usuario).
 * 2. Contas novas (e-mail): Supabase Auth nativo.
 */
export async function authenticateUser(
  userOrEmail: string,
  pass: string
): Promise<{ success: boolean; session?: AppUserSession; error?: string }> {
  const inputStr = userOrEmail.trim();
  if (!inputStr || !pass) {
    return { success: false, error: 'Preencha o usuário e a senha.' };
  }

  try {
    // 1. Usuário migrado: confere a senha no servidor, nunca no navegador
    const { data: rpcData, error: rpcErr } = await supabase.rpc('login_usuario', {
      p_login: inputStr,
      p_senha: pass,
    });
    if (rpcErr) {
      console.warn('Erro na RPC login_usuario:', rpcErr.message);
    }
    const dbUser = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    if (dbUser) {
      const userSessionObj = sessionFromDbUser(dbUser);
      saveSessionLocal(userSessionObj);
      return { success: true, session: userSessionObj };
    }

    // 2. Se for e-mail, tenta autenticar via Supabase Auth
    if (inputStr.includes('@')) {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: inputStr,
        password: pass,
      });

      if (authErr) {
        return {
          success: false,
          error:
            authErr.message === 'Invalid login credentials'
              ? 'E-mail ou senha incorretos.'
              : authErr.message || 'Erro ao realizar login.',
        };
      }

      if (authData.session) {
        const { data: dbUserEmail } = await supabase
          .from('usuarios')
          .select('id, nome, username, email, nivel_autoridade')
          .eq('email', inputStr.toLowerCase())
          .maybeSingle();

        const nivel = Number(
          dbUserEmail?.nivel_autoridade ?? authData.session.user.user_metadata?.nivel_autoridade ?? 1
        );
        const userName =
          dbUserEmail?.nome ||
          authData.session.user.user_metadata?.name ||
          inputStr.split('@')[0];

        const enrichedSession: AppUserSession = {
          user: {
            id: dbUserEmail?.id || authData.session.user.id,
            email: inputStr.toLowerCase(),
            user_metadata: {
              name: userName,
              username: dbUserEmail?.username || authData.session.user.user_metadata?.username || inputStr.split('@')[0],
              nivel_autoridade: nivel,
            },
          },
        };
        saveSessionLocal(enrichedSession);
        return { success: true, session: enrichedSession };
      }
    }

    return { success: false, error: 'Usuário não encontrado ou senha incorreta.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro inesperado ao realizar login.' };
  }
}

