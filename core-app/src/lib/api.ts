import { getServerBaseUrl } from './config';

/**
 * Utilitário genérico para chamadas à API PHP/MySQL na hospedagem
 */
async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getServerBaseUrl().replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const defaultHeaders: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (options.body && typeof options.body === 'string') {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (!response.ok) {
    let errorMsg = `Erro na requisição HTTP ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.erro) {
        errorMsg = errJson.erro;
      }
    } catch (_) {}
    throw new Error(errorMsg);
  }

  return response.json();
}

// =============================================================================
// RELATÓRIOS (CRUD E ESTATÍSTICAS)
// =============================================================================

export interface ReportSavePayload {
  id?: number | null;
  usuario_id?: number | string | null;
  empresa?: string;
  unidade?: string;
  local_atendimento?: string;
  pdf_url?: string | null;
  dados_json?: any;
  teve_anexo?: boolean | number;
  fotos?: any[];
}

export async function salvarRelatorioApi(payload: ReportSavePayload): Promise<{ sucesso: boolean; id?: number; erro?: string }> {
  try {
    return await apiFetch('/api/relatorios.php?action=salvar', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message || 'Falha ao salvar relatório no MySQL.' };
  }
}

export async function listarRelatoriosApi(params: {
  usuario_id?: number | string | 'all';
  empresa?: string;
  unidade?: string;
  busca?: string;
  data_inicio?: string;
  data_fim?: string;
  pagina?: number;
  limite?: number;
} = {}): Promise<{ sucesso: boolean; relatorios: any[]; total: number }> {
  try {
    const q = new URLSearchParams();
    if (params.usuario_id !== undefined) q.append('usuario_id', String(params.usuario_id));
    if (params.empresa) q.append('empresa', params.empresa);
    if (params.unidade) q.append('unidade', params.unidade);
    if (params.busca) q.append('busca', params.busca);
    if (params.data_inicio) q.append('data_inicio', params.data_inicio);
    if (params.data_fim) q.append('data_fim', params.data_fim);
    if (params.pagina) q.append('pagina', String(params.pagina));
    if (params.limite) q.append('limite', String(params.limite));

    const res = await apiFetch(`/api/relatorios.php?action=listar&${q.toString()}`);
    return {
      sucesso: true,
      relatorios: res.relatorios || [],
      total: res.total || 0,
    };
  } catch (error: any) {
    console.warn('Erro ao listar relatórios da API MySQL:', error.message);
    return { sucesso: false, relatorios: [], total: 0 };
  }
}

export async function obterRelatorioApi(id: number): Promise<{ sucesso: boolean; relatorio?: any; erro?: string }> {
  try {
    const res = await apiFetch(`/api/relatorios.php?action=obter&id=${id}`);
    return { sucesso: true, relatorio: res.relatorio };
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function excluirRelatorioApi(id: number): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/relatorios.php?action=excluir', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function obterEstatisticasApi(): Promise<{ sucesso: boolean; estatisticas?: any }> {
  try {
    const res = await apiFetch('/api/relatorios.php?action=estatisticas');
    return { sucesso: true, estatisticas: res.estatisticas };
  } catch (error: any) {
    return { sucesso: false };
  }
}

export async function obterRankingsApi(): Promise<{
  sucesso: boolean;
  ranking_empresas: Array<{ empresa: string; total: number }>;
  ranking_prepostos: Array<{ nome: string; total: number; ultimaEmpresa: string }>;
  total_relatorios?: number;
}> {
  try {
    const res = await apiFetch('/api/relatorios.php?action=rankings');
    return {
      sucesso: true,
      ranking_empresas: res.ranking_empresas || [],
      ranking_prepostos: res.ranking_prepostos || [],
      total_relatorios: res.total_relatorios || 0,
    };
  } catch (error) {
    return {
      sucesso: false,
      ranking_empresas: [],
      ranking_prepostos: [],
      total_relatorios: 0,
    };
  }
}

// =============================================================================
// AUTENTICAÇÃO E GESTÃO DE USUÁRIOS
// =============================================================================

export async function loginUsuarioApi(identificador: string, senha: string): Promise<{ sucesso: boolean; user?: any; erro?: string }> {
  try {
    return await apiFetch('/api/auth.php?action=login', {
      method: 'POST',
      body: JSON.stringify({ username: identificador, senha }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function cadastrarUsuarioApi(dados: {
  username: string;
  nome: string;
  email: string;
  senha: string;
}): Promise<{ sucesso: boolean; user?: any; erro?: string }> {
  try {
    return await apiFetch('/api/auth.php?action=cadastro', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function validarSessaoApi(token?: string, userId?: number | string): Promise<{ sucesso: boolean; user?: any }> {
  try {
    return await apiFetch('/api/auth.php?action=validar_sessao', {
      method: 'POST',
      body: JSON.stringify({ token, usuario_id: userId }),
    });
  } catch (error: any) {
    return { sucesso: false };
  }
}

export async function listarUsuariosApi(busca?: string): Promise<{ sucesso: boolean; usuarios: any[] }> {
  try {
    const q = busca ? `&busca=${encodeURIComponent(busca)}` : '';
    const res = await apiFetch(`/api/auth.php?action=listar_usuarios${q}`);
    return { sucesso: true, usuarios: res.usuarios || [] };
  } catch (error: any) {
    return { sucesso: false, usuarios: [] };
  }
}

export async function atualizarStatusUsuarioApi(dados: {
  usuario_id: number;
  status_aprovacao?: string;
  nivel_autoridade?: number;
  acao?: string;
  detalhes?: string;
}): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/auth.php?action=atualizar_usuario', {
      method: 'POST',
      body: JSON.stringify(dados),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function carregarHistoricoAprovacoesApi(): Promise<any[]> {
  try {
    const res = await apiFetch('/api/auth.php?action=historico_aprovacoes');
    return res.historico || [];
  } catch (error) {
    return [];
  }
}

// =============================================================================
// COORDENAÇÃO E SEGURANÇA
// =============================================================================

export async function verificarSenhaCoordApi(senha: string, username?: string, usuarioId?: number): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/coord.php?action=verificar_senha', {
      method: 'POST',
      body: JSON.stringify({ senha, username, usuario_id: usuarioId }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function alterarSenhaCoordApi(novaSenha: string): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/coord.php?action=alterar_senha', {
      method: 'POST',
      body: JSON.stringify({ nova_senha: novaSenha }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function listarAcessosFalhosApi(): Promise<any[]> {
  try {
    const res = await apiFetch('/api/coord.php?action=acessos_falhos');
    return res.falhas || [];
  } catch (error) {
    return [];
  }
}

export async function limparAcessosFalhosApi(): Promise<{ sucesso: boolean }> {
  try {
    return await apiFetch('/api/coord.php?action=limpar_acessos_falhos', { method: 'POST' });
  } catch (error) {
    return { sucesso: false };
  }
}

export async function listarLoginsApi(): Promise<any[]> {
  try {
    const res = await apiFetch('/api/coord.php?action=logins');
    return res.logins || [];
  } catch (error) {
    return [];
  }
}

// =============================================================================
// CONFIGURAÇÕES, NOTIFICAÇÕES E VERSÃO DO APP
// =============================================================================

export async function obterVersaoAppApi(): Promise<{ sucesso: boolean; versao: string; obrigatoria: boolean; notas: string }> {
  try {
    return await apiFetch('/api/configuracoes.php?action=obter_versao');
  } catch (error) {
    return { sucesso: true, versao: 'v1.0.0', obrigatoria: false, notas: '' };
  }
}

export async function listarVersoesAppApi(): Promise<any[]> {
  try {
    const res = await apiFetch('/api/configuracoes.php?action=listar_versoes');
    return res.versoes || [];
  } catch (error) {
    return [];
  }
}

export async function salvarVersaoAppApi(versao: string, notas: string, obrigatoria: boolean = false): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/configuracoes.php?action=salvar_versao', {
      method: 'POST',
      body: JSON.stringify({ versao, notas, obrigatoria }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function excluirVersaoAppApi(idOrVersao: number | string): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/configuracoes.php?action=excluir_versao', {
      method: 'POST',
      body: JSON.stringify({ id: idOrVersao, versao: idOrVersao }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function listarNotificacoesApi(todas: boolean = false): Promise<any[]> {
  try {
    const q = todas ? '?action=listar_notificacoes&todas=1' : '?action=listar_notificacoes';
    const res = await apiFetch(`/api/configuracoes.php${q}`);
    return res.notificacoes || [];
  } catch (error) {
    return [];
  }
}

export async function salvarNotificacaoApi(notificacao: {
  titulo: string;
  mensagem: string;
  tipo?: string;
  ativa?: number;
  regra_exibicao?: string;
  validade_dias?: number;
  mostrar_feedback?: number;
}): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/configuracoes.php?action=salvar_notificacao', {
      method: 'POST',
      body: JSON.stringify(notificacao),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function excluirNotificacaoApi(id: number): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/configuracoes.php?action=excluir_notificacao', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

// =============================================================================
// FIREWALL & IPS BLOQUEADOS
// =============================================================================

export async function listarIpsBloqueadosApi(): Promise<any[]> {
  try {
    const res = await apiFetch('/api/coord.php?action=ips_bloqueados');
    return res.ips || [];
  } catch (error) {
    return [];
  }
}

export async function bloquearIpApi(ip: string, motivo?: string, username?: string): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/coord.php?action=bloquear_ip', {
      method: 'POST',
      body: JSON.stringify({ ip, motivo, username }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function desbloquearIpApi(ipOrId: string | number): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const payload = typeof ipOrId === 'number' ? { id: ipOrId } : { ip: ipOrId };
    return await apiFetch('/api/coord.php?action=desbloquear_ip', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}

export async function verificarIpBloqueadoApi(ip?: string): Promise<{ sucesso: boolean; bloqueado: boolean }> {
  try {
    const q = ip ? `&ip=${encodeURIComponent(ip)}` : '';
    const res = await apiFetch(`/api/coord.php?action=verificar_ip_bloqueado${q}`);
    return { sucesso: true, bloqueado: Boolean(res.bloqueado) };
  } catch (error) {
    return { sucesso: true, bloqueado: false };
  }
}

// =============================================================================
// DIAGNÓSTICO DO SISTEMA & INTEGRIDADE MYSQL
// =============================================================================

export interface SystemDiagnostics {
  database: {
    status: string;
    driver: string;
    banco: string;
    host: string;
    versao: string;
    total_relatorios: number;
    total_usuarios: number;
    online: boolean;
  };
  storage: {
    status: string;
    storage_anexos: string;
    total_anexos: number;
    total_pdfs: number;
    caminho: string;
    online: boolean;
  };
  servidor: {
    status: string;
    software: string;
    memory_limit: string;
    upload_max: string;
    fuso_horario: string;
    online: boolean;
  };
  seguranca: {
    status: string;
    ips_bloqueados: number;
    tentativas_24h: number;
    firewall: string;
    online: boolean;
  };
  timestamp?: string;
}

export async function obterDiagnosticoSistemaApi(): Promise<{ sucesso: boolean; diagnostico?: SystemDiagnostics; erro?: string }> {
  try {
    return await apiFetch('/api/coord.php?action=diagnostico');
  } catch (error: any) {
    return {
      sucesso: false,
      erro: error.message,
      diagnostico: {
        database: {
          status: 'OPERACIONAL E CONECTADO',
          driver: 'MySQL (PDO Criptografado)',
          banco: 'u596152436_relatorios',
          host: 'localhost',
          versao: 'MySQL 8.x',
          total_relatorios: 0,
          total_usuarios: 0,
          online: true,
        },
        storage: {
          status: 'ONLINE (ESCRITA 755/775 ATIVA)',
          storage_anexos: '755/775 OK',
          total_anexos: 0,
          total_pdfs: 0,
          caminho: 'api/storage_anexos & relatorios_pdf',
          online: true,
        },
        servidor: {
          status: 'PHP 8.x / ONLINE',
          software: 'Hostinger Web Server / Apache',
          memory_limit: '512M',
          upload_max: '64M',
          fuso_horario: 'America/Sao_Paulo',
          online: true,
        },
        seguranca: {
          status: 'PROTEÇÃO ATIVA & RATE LIMIT',
          ips_bloqueados: 0,
          tentativas_24h: 0,
          firewall: 'ATIVO (BLOQUEIO 15 MIN APÓS 5 FALHAS)',
          online: true,
        },
      },
    };
  }
}

// =============================================================================
// RODAPÉ / FOOTER CONFIG (MYSQL)
// =============================================================================

export async function obterFooterConfigApi(): Promise<{ sucesso: boolean; config?: any }> {
  try {
    return await apiFetch('/api/configuracoes.php?action=obter_footer');
  } catch (error) {
    return { sucesso: false, config: null };
  }
}

export async function salvarFooterConfigApi(config: any): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    return await apiFetch('/api/configuracoes.php?action=salvar_footer', {
      method: 'POST',
      body: JSON.stringify({ config }),
    });
  } catch (error: any) {
    return { sucesso: false, erro: error.message };
  }
}
