import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  SafeAreaView,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { formatReportPdfUrl, PHP_SERVER_URL } from '../lib/config';
import {
  baixarPdfRelatorio,
  compartilharPdfRelatorio,
  gerarNomeArquivoPdf,
  visualizarRelatorioHtml,
} from '../lib/pdfManager';
import { ReportPdfData } from '../lib/pdfHtmlGenerator';
import { verifyCoordinatorAccess, logoutUserSession, saveSessionLocal, getSavedSessionSync, AppUserSession, unlockCoordinatorPanel, escapeOrValue } from '../lib/auth';
import {
  fetchFooterConfig,
  saveFooterConfig,
  FooterConfig,
  defaultFooterConfig,
  fetchAllAppVersions,
  insertAppVersion,
  AppVersionRecord,
} from '../lib/footerConfig';

const modernFont = Platform.OS === 'web'
  ? "'Inter', system-ui, -apple-system, sans-serif"
  : undefined;

const corporateFont = Platform.OS === 'web'
  ? '"Times New Roman", Times, serif'
  : undefined;

const EMPRESAS = ['TODAS', 'ALPHA OFFSHORE', 'NEXUS LOGÍSTICA', 'OCEANIC ENERGY', 'SOLARIS SHIPPING', 'VANGUARD MARÍTIMA', 'OUTROS'];

export default function PainelCoordScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Sessão do Usuário e Controle Estrito de Autoridade Nível 2
  const [userSession, setUserSession] = useState<AppUserSession | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [unauthReason, setUnauthReason] = useState<'unauthenticated' | 'forbidden' | null>(null);

  // Tema da Coordenação: 100% Tema Claro Exclusivo
  const isDarkMode = false;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }
  }, []);

  // Abas do Painel: 'relatorios' | 'ranking' | 'popups' | 'mensagens' | 'usuarios' | 'seguranca' | 'sistema' | 'version'
  const [activeTab, setActiveTab] = useState<'relatorios' | 'ranking' | 'popups' | 'mensagens' | 'usuarios' | 'seguranca' | 'sistema' | 'version'>('relatorios');

  // Estados de Controle de Versões (Central mms_versao_app)
  const [versoesList, setVersoesList] = useState<AppVersionRecord[]>([]);
  const [loadingVersoes, setLoadingVersoes] = useState<boolean>(false);
  const [inputVersaoNumero, setInputVersaoNumero] = useState<string>('');
  const [inputVersaoDescricao, setInputVersaoDescricao] = useState<string>('');
  const [salvandoVersao, setSalvandoVersao] = useState<boolean>(false);
  const [msgSucessoVersao, setMsgSucessoVersao] = useState<string>('');

  // Estados de Segurança / Auditoria e Acessos Falhos (Logins mal sucedidos)
  const [acessosFalhos, setAcessosFalhos] = useState<any[]>([]);
  const [ultimosLogins, setUltimosLogins] = useState<any[]>([]);
  const [loadingSeguranca, setLoadingSeguranca] = useState<boolean>(false);

  // Estados de Dados
  const [relatorios, setRelatorios] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [popups, setPopups] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalRelatoriosGeral, setTotalRelatoriosGeral] = useState<number>(0);
  const [relatoriosHojeCount, setRelatoriosHojeCount] = useState<number>(0);
  const [relatoriosMesCount, setRelatoriosMesCount] = useState<number>(0);

  // Filtros de Relatórios
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('TODAS');
  const [filtroBusca, setFiltroBusca] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');
  const [paginaRelatorios, setPaginaRelatorios] = useState<number>(1);
  const porPagina = 15;

  // Filtro de Usuários
  const [filtroBuscaUsuario, setFiltroBuscaUsuario] = useState<string>('');
  const [filtroUsuarioId, setFiltroUsuarioId] = useState<number | null>(null);
  const [isUsuarioDropdownOpen, setIsUsuarioDropdownOpen] = useState<boolean>(false);

  // Navbar Superior: Data/Hora e IP
  const [dataHoraAtual, setDataHoraAtual] = useState<string>('17/10/2026 18:43');
  const [userIp, setUserIp] = useState<string>('2804:14d:2a23:9...');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const formatted = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setDataHoraAtual(formatted);
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    fetch('https://api.ipify.org?format=json')
      .then((res) => res.json())
      .then((data) => {
        if (data.ip) setUserIp(data.ip);
      })
      .catch(() => { });
    return () => clearInterval(timer);
  }, []);

  const nomeMesAtual = useMemo(() => {
    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const d = new Date();
    return `${meses[d.getMonth()]} de ${d.getFullYear()}`;
  }, []);

  const mesAnoCurto = useMemo(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `em ${m}/${d.getFullYear()}`;
  }, []);

  // Modal de Detalhes do Relatório
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Modal de Criação de Popup/Notificação
  const [isNovoPopupModalVisible, setIsNovoPopupModalVisible] = useState<boolean>(false);
  const [novoPopupTitulo, setNovoPopupTitulo] = useState<string>('');
  const [novoPopupMensagem, setNovoPopupMensagem] = useState<string>('');
  const [novoPopupTipo, setNovoPopupTipo] = useState<'aviso' | 'urgente' | 'feedback'>('aviso');
  const [salvandoPopup, setSalvandoPopup] = useState<boolean>(false);

  // Personalização do Rodapé / Versão
  const [footerDraft, setFooterDraft] = useState<FooterConfig>(defaultFooterConfig);
  const [salvandoFooter, setSalvandoFooter] = useState<boolean>(false);

  useEffect(() => {
    fetchFooterConfig().then((cfg) => {
      if (cfg) setFooterDraft(cfg);
    });
  }, []);

  const handleSalvarFooter = async () => {
    setSalvandoFooter(true);
    const success = await saveFooterConfig(footerDraft);
    setSalvandoFooter(false);
    if (success) {
      showCustomAlert('RODAPÉ ATUALIZADO', 'A nova personalização do rodapé foi salva com sucesso e já está ativa no gerador de relatórios.');
    } else {
      showCustomAlert('ERRO AO SALVAR', 'Não foi possível gravar a configuração do rodapé.');
    }
  };

  // Controle de Acesso e Desbloqueio do Painel de Coordenação (Nível 2 via RPC)
  const [isPanelUnlocked, setIsPanelUnlocked] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('mms_coord_unlocked') === 'true';
    }
    return false;
  });
  const [inputUsuarioPainel, setInputUsuarioPainel] = useState<string>(() => {
    try {
      const syncSession = getSavedSessionSync();
      if (syncSession?.user) {
        return syncSession.user.user_metadata?.name || syncSession.user.user_metadata?.username || syncSession.user.email?.split('@')[0] || '';
      }
    } catch (e) {}
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('mms_last_coord_user');
      if (saved) return saved;
    }
    return '';
  });
  const [inputSenhaPainel, setInputSenhaPainel] = useState<string>('');
  const [erroSenhaPainel, setErroSenhaPainel] = useState<string | null>(null);
  const [validandoSenhaPainel, setValidandoSenhaPainel] = useState<boolean>(false);
  const [isEmpresaDropdownOpen, setIsEmpresaDropdownOpen] = useState<boolean>(false);

  // Sincroniza o campo USUÁRIO com o nome do usuário logado no momento
  useEffect(() => {
    if (userSession?.user) {
      const nomeAtual =
        userSession.user.user_metadata?.name ||
        userSession.user.user_metadata?.username ||
        userSession.user.email?.split('@')[0];
      if (nomeAtual) {
        setInputUsuarioPainel(nomeAtual);
      }
    }
  }, [userSession]);

  const handleDesbloquearPainel = async () => {
    const usuarioDigitado = (
      inputUsuarioPainel ||
      userSession?.user?.user_metadata?.username ||
      userSession?.user?.email ||
      ''
    ).trim();
    const loginParaValidar = usuarioDigitado || 'italogabriel';
    const senhaDigitada = inputSenhaPainel.trim();

    if (!senhaDigitada) {
      setErroSenhaPainel('Por favor, digite a senha do painel.');
      return;
    }

    setValidandoSenhaPainel(true);
    setErroSenhaPainel(null);

    try {
      const result = await unlockCoordinatorPanel(loginParaValidar, senhaDigitada);

      if (result.success && result.session) {
        const sessionPayload = result.session;
        const coordUser = {
          id: sessionPayload.user.id,
          username: sessionPayload.user.user_metadata.username,
        };

        setUserSession(sessionPayload);
        setIsAuthorized(true);
        setIsPanelUnlocked(true);

        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            window.scrollTo(0, 0);
          }
          try {
            sessionStorage.setItem('mms_coord_unlocked', 'true');
            localStorage.setItem('mms_last_coord_user', loginParaValidar);
          } catch (e) { }
        }

        // Grava login bem-sucedido na auditoria de segurança (localStorage + Supabase)
        const loginObj = {
          id: Date.now(),
          usuario_id: coordUser.id ? Number(coordUser.id) : 1,
          ip: userIp || '127.0.0.1',
          data_login: new Date().toISOString(),
          username: coordUser.username || usuarioDigitado || 'italogabriel',
        };
        if (typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem('mms_registro_logins');
            const lista = raw ? JSON.parse(raw) : [];
            lista.unshift(loginObj);
            localStorage.setItem('mms_registro_logins', JSON.stringify(lista.slice(0, 50)));
          } catch (e) {}
        }
        try {
          await supabase.from('registro_logins').insert([{
            usuario_id: loginObj.usuario_id,
            ip: loginObj.ip,
            data_login: loginObj.data_login,
          }]);
        } catch (e) {}

        carregarDadosIniciais();
      } else {
        // Grava tentativa falha em coord_acessos_falhos (com redundância local imediata)
        const falhaObj = {
          id: Date.now(),
          usuario_id: null,
          username: usuarioDigitado || 'desconhecido',
          ip: userIp || '127.0.0.1',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 500) : 'App',
          data_tentativa: new Date().toISOString(),
        };

        if (typeof localStorage !== 'undefined') {
          try {
            const raw = localStorage.getItem('mms_coord_acessos_falhos');
            const lista = raw ? JSON.parse(raw) : [];
            lista.unshift(falhaObj);
            localStorage.setItem('mms_coord_acessos_falhos', JSON.stringify(lista.slice(0, 100)));
          } catch (e) {}
        }

        try {
          await supabase.from('coord_acessos_falhos').insert([falhaObj]);
        } catch (e) { }

        setErroSenhaPainel(`${result.error || 'Usuário ou senha incorretos.'} Tentativa registrada.`);
      }
    } catch (e) {
      setErroSenhaPainel('Erro ao validar credenciais no banco de dados.');
    } finally {
      setValidandoSenhaPainel(false);
    }
  };

  const handleBloquearPainel = () => {
    setIsPanelUnlocked(false);
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('mms_coord_unlocked');
    }
  };

  // Alerta / Confirmação Customizado
  const [customDialog, setCustomDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDanger?: boolean;
    onConfirm?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  const showCustomAlert = (title: string, message: string, onConfirm?: () => void, isDanger = false) => {
    setCustomDialog({
      visible: true,
      title,
      message,
      confirmText: onConfirm ? 'Confirmar' : 'OK',
      isDanger,
      onConfirm: () => {
        setCustomDialog((prev) => ({ ...prev, visible: false }));
        if (onConfirm) onConfirm();
      },
    });
  };

  // Carregar e Verificar Autorização de Acesso (Exclusivo Nível 2)
  useEffect(() => {
    verifyCoordinatorAccess().then((res) => {
      setUserSession(res.session);
      setIsAuthorized(res.authorized);
      setUnauthReason(res.reason);
      setAuthChecked(true);

      if (res.authorized) {
        carregarDadosIniciais();
      }
    }).catch((err) => {
      console.warn('Erro na verificação de acesso à coordenação:', err);
      setIsAuthorized(false);
      setUnauthReason('unauthenticated');
      setAuthChecked(true);
    });
  }, []);

  // Carregamento de Métricas e Dados Iniciais
  const carregarDadosIniciais = async () => {
    setLoading(true);
    try {
      await Promise.all([
        carregarMetricas(),
        carregarRelatorios(),
        carregarUsuarios(),
        carregarPopups(),
        carregarVersoes(),
        carregarSeguranca(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const carregarSeguranca = async () => {
    setLoadingSeguranca(true);
    try {
      let falhosDb: any[] = [];
      let loginsDb: any[] = [];

      try {
        const [resFalhos, resLogins] = await Promise.all([
          supabase
            .from('coord_acessos_falhos')
            .select('*')
            .order('data_tentativa', { ascending: false })
            .limit(100),
          supabase
            .from('registro_logins')
            .select('*')
            .order('data_login', { ascending: false })
            .limit(50),
        ]);

        if (!resFalhos.error && resFalhos.data) {
          falhosDb = resFalhos.data;
        }
        if (!resLogins.error && resLogins.data) {
          loginsDb = resLogins.data;
        }
      } catch (errDb) {
        console.warn('Erro ao consultar segurança do banco:', errDb);
      }

      // Lê histórico salvo em localStorage para garantir exibição mesmo com RLS ativo
      let falhosLocais: any[] = [];
      let loginsLocais: any[] = [];
      if (typeof localStorage !== 'undefined') {
        try {
          const rawF = localStorage.getItem('mms_coord_acessos_falhos');
          if (rawF) falhosLocais = JSON.parse(rawF);
          const rawL = localStorage.getItem('mms_registro_logins');
          if (rawL) loginsLocais = JSON.parse(rawL);
        } catch (e) {}
      }

      // Mescla e desduplica acessos falhos por username, data e IP
      const mapFalhos = new Map<string, any>();
      falhosLocais.forEach((f) => {
        const key = `${f.username}_${f.data_tentativa}_${f.ip}`;
        mapFalhos.set(key, f);
      });
      falhosDb.forEach((f) => {
        const key = `${f.username}_${f.data_tentativa}_${f.ip}`;
        mapFalhos.set(key, f);
      });
      const mergedFalhos = Array.from(mapFalhos.values()).sort(
        (a, b) => new Date(b.data_tentativa).getTime() - new Date(a.data_tentativa).getTime()
      );
      setAcessosFalhos(mergedFalhos);

      // Mescla e desduplica logins bem-sucedidos
      const mapLogins = new Map<string, any>();
      loginsLocais.forEach((l) => {
        const key = `${l.usuario_id || l.username}_${l.data_login}_${l.ip}`;
        mapLogins.set(key, l);
      });
      loginsDb.forEach((l) => {
        const key = `${l.usuario_id}_${l.data_login}_${l.ip}`;
        mapLogins.set(key, l);
      });
      const mergedLogins = Array.from(mapLogins.values()).sort(
        (a, b) => new Date(b.data_login).getTime() - new Date(a.data_login).getTime()
      );
      setUltimosLogins(mergedLogins);
    } catch (e) {
      console.warn('Erro ao carregar dados de segurança:', e);
    } finally {
      setLoadingSeguranca(false);
    }
  };

  const handleLimparAcessosFalhos = async () => {
    showCustomAlert(
      'LIMPAR HISTÓRICO DE ACESSOS FALHOS',
      'Tem certeza que deseja apagar todos os registros de tentativas de acesso incorretas?',
      async () => {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('mms_coord_acessos_falhos');
          }
          await supabase.from('coord_acessos_falhos').delete().neq('id', 0);
          setAcessosFalhos([]);
          showCustomAlert('Sucesso', 'Histórico de acessos falhos limpo com sucesso.');
        } catch (e: any) {
          setAcessosFalhos([]);
          showCustomAlert('Sucesso', 'Histórico de acessos falhos limpo com sucesso.');
        }
      },
      true
    );
  };

  const carregarVersoes = async () => {
    setLoadingVersoes(true);
    try {
      const data = await fetchAllAppVersions();
      setVersoesList(data);
    } finally {
      setLoadingVersoes(false);
    }
  };

  const handleSalvarVersao = async () => {
    const v = inputVersaoNumero.trim();
    if (!v) {
      showCustomAlert('CAMPO OBRIGATÓRIO', 'Por favor, informe a versão a ser registrada (Ex: V1.2.5).');
      return;
    }
    setSalvandoVersao(true);
    setMsgSucessoVersao('');
    try {
      const ok = await insertAppVersion(v, inputVersaoDescricao);
      if (ok) {
        setMsgSucessoVersao(`Nova versão (${v.toUpperCase()}) registrada com sucesso!`);
        setInputVersaoNumero('');
        setInputVersaoDescricao('');
        await carregarVersoes();
        showCustomAlert('VERSÃO REGISTRADA', `A versão ${v.toUpperCase()} foi registrada e agora é a versão padrão ativa no sistema!`);
      } else {
        showCustomAlert('ERRO AO SALVAR', 'Não foi possível gravar a nova versão no banco de dados.');
      }
    } finally {
      setSalvandoVersao(false);
    }
  };

  const carregarMetricas = async () => {
    try {
      const hojeStr = new Date().toISOString().split('T')[0];
      const agora = new Date();
      const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();

      // Executa as 3 contagens simultaneamente em paralelo na nuvem
      const [resTotal, resHoje, resMes] = await Promise.all([
        supabase.from('relatorios').select('*', { count: 'exact', head: true }),
        supabase.from('relatorios').select('*', { count: 'exact', head: true }).gte('data_criacao', `${hojeStr}T00:00:00`),
        supabase.from('relatorios').select('*', { count: 'exact', head: true }).gte('data_criacao', primeiroDiaMes),
      ]);

      if (resTotal.count !== null && resTotal.count !== undefined) {
        setTotalRelatoriosGeral(resTotal.count);
      }
      if (resHoje.count !== null && resHoje.count !== undefined) {
        setRelatoriosHojeCount(resHoje.count);
      }
      if (resMes.count !== null && resMes.count !== undefined) {
        setRelatoriosMesCount(resMes.count);
      }
    } catch (e) {
      console.warn('Erro ao carregar métricas:', e);
    }
  };

  const formatarDataFiltro = (d: string) => {
    if (!d) return '';
    const trimmed = d.trim();
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return trimmed;
  };

  const limparFiltros = () => {
    setFiltroEmpresa('TODAS');
    setFiltroBusca('');
    setFiltroBuscaUsuario('');
    setFiltroUsuarioId(null);
    setFiltroDataInicio('');
    setFiltroDataFim('');
    setPaginaRelatorios(1);
    setTimeout(() => {
      carregarRelatorios();
    }, 50);
  };

  // Carregamento Confiável e 100% Funcional dos Relatórios com select('*')
  const carregarRelatorios = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('relatorios')
        .select('*', { count: 'exact' });

      if (filtroEmpresa && filtroEmpresa !== 'TODAS') {
        query = query.eq('empresa', filtroEmpresa);
      }

      if (filtroUsuarioId) {
        query = query.eq('usuario_id', filtroUsuarioId);
      }

      if (filtroBusca.trim()) {
        const term = escapeOrValue(`%${filtroBusca.trim()}%`);
        query = query.or(`unidade.ilike.${term},local_atendimento.ilike.${term}`);
      }

      const dtIni = formatarDataFiltro(filtroDataInicio);
      if (dtIni) {
        query = query.gte('data_criacao', `${dtIni}T00:00:00`);
      }

      const dtFim = formatarDataFiltro(filtroDataFim);
      if (dtFim) {
        query = query.lte('data_criacao', `${dtFim}T23:59:59`);
      }

      const from = (paginaRelatorios - 1) * porPagina;
      const to = from + porPagina - 1;

      query = query.order('data_criacao', { ascending: false }).range(from, to);

      const { data, count, error } = await query;
      if (error) {
        console.warn('Erro ao carregar relatórios do painel:', error.message);
      } else if (data) {
        // Se houver busca por usuário por texto, filtra também localmente
        let resultado = data;
        if (filtroBuscaUsuario.trim()) {
          const uTerm = filtroBuscaUsuario.toLowerCase().trim();
          resultado = resultado.filter((r) => {
            const parsed = parseReportData(r);
            const prep = (parsed?.preposto || '').toLowerCase();
            const autor = (usuarios.find((u) => u.id === r.usuario_id)?.nome || '').toLowerCase();
            const autorUser = (usuarios.find((u) => u.id === r.usuario_id)?.username || '').toLowerCase();
            const rUnid = (r.unidade || '').toLowerCase();
            return prep.includes(uTerm) || autor.includes(uTerm) || autorUser.includes(uTerm) || rUnid.includes(uTerm);
          });
        }
        setRelatorios(resultado);
        if (count !== null && count !== undefined) setTotalRelatoriosGeral(count);
      }
    } catch (e) {
      console.warn('Erro ao carregar relatórios do painel:', e);
    } finally {
      setLoading(false);
    }
  };

  // Carregamento sob demanda dos dados completos do relatório (detalhes no modal)
  const handleAbrirDetalhesModal = async (item: any) => {
    if (item.dados_json) {
      setSelectedReport(item);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('relatorios')
        .select('*')
        .eq('id', item.id)
        .single();
      if (!error && data) {
        setSelectedReport(data);
      } else {
        setSelectedReport(item);
      }
    } catch (e) {
      setSelectedReport(item);
    } finally {
      setLoading(false);
    }
  };

  const carregarUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, username, email, nivel_autoridade, data_cadastro, last_activity')
        .order('id', { ascending: false });

      if (!error && data) {
        setUsuarios(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar usuários:', e);
    }
  };

  const carregarPopups = async () => {
    try {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .order('id', { ascending: false });

      if (!error && data) {
        setPopups(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar popups:', e);
    }
  };

  useEffect(() => {
    if (authChecked && isAuthorized) {
      carregarRelatorios();
    }
  }, [filtroEmpresa, paginaRelatorios, filtroDataInicio, filtroDataFim]);

  // Alterar Nível de Acesso de Usuário (Promover/Rebaixar)
  const handleAlterarNivelUsuario = async (userId: number, nivelAtual: number) => {
    const novoNivel = nivelAtual === 2 ? 1 : 2;
    const acaoNome = novoNivel === 2 ? 'promover a Nível 2 (Coordenação)' : 'rebaixar a Nível 1 (Básico)';

    showCustomAlert(
      'ALTERAR NÍVEL DE AUTORIDADE',
      `Tem certeza que deseja ${acaoNome} este usuário?`,
      async () => {
        try {
          const { error } = await supabase
            .from('usuarios')
            .update({ nivel_autoridade: novoNivel })
            .eq('id', userId);

          if (error) {
            showCustomAlert('Erro', 'Não foi possível alterar a autoridade: ' + error.message);
          } else {
            setUsuarios((prev) =>
              prev.map((u) => (u.id === userId ? { ...u, nivel_autoridade: novoNivel } : u))
            );
            showCustomAlert('Sucesso', 'Nível de autoridade atualizado com sucesso!');
          }
        } catch (e: any) {
          showCustomAlert('Erro', e.message);
        }
      }
    );
  };

  // Excluir Relatório (Ação de Coordenação)
  const handleExcluirRelatorio = (id: number) => {
    showCustomAlert(
      'EXCLUIR RELATÓRIO DEFINITIVAMENTE',
      `Atenção: Você está prestes a excluir o relatório #${id} de forma permanente do sistema de demonstração. Deseja prosseguir?`,
      async () => {
        setLoading(true);
        const { error } = await supabase.from('relatorios').delete().eq('id', id);
        if (error) {
          showCustomAlert('Erro', 'Falha ao excluir: ' + error.message);
        } else {
          setRelatorios((prev) => prev.filter((r) => r.id !== id));
          carregarMetricas();
          showCustomAlert('Sucesso', `Relatório #${id} excluído com sucesso.`);
        }
        setLoading(false);
      },
      true
    );
  };

  // Abrir PDF
  const openReportPdf = (report: any) => {
    if (!report) return;
    const rawUrl = report.pdf_url || report.caminho_pdf;
    const url = formatReportPdfUrl(rawUrl);

    if (url && Platform.OS === 'web') {
      window.open(url, '_blank');
      return;
    }

    if (Platform.OS === 'web') {
      window.open(`${PHP_SERVER_URL}/download_pdf.php?id=${report.id}`, '_blank');
    }
  };


  // Parser dos dados JSON
  const parseReportData = (report: any) => {
    if (!report || !report.dados_json) return null;
    if (typeof report.dados_json === 'object') return report.dados_json;
    try {
      return JSON.parse(report.dados_json);
    } catch (e) {
      return null;
    }
  };

  // Extrai ReportPdfData completo do relatório para geração, download e compartilhamento
  const extractReportPdfData = (report: any): ReportPdfData => {
    const parsed = parseReportData(report) || {};
    const paxEmb =
      parsed.pax_embarcando ||
      parsed.pax1 ||
      (Array.isArray(parsed.embarcando)
        ? parsed.embarcando
            .map((p: any) => (typeof p === 'string' ? p : `${p.nome || ''} - ${p.funcao || p.doc || ''}`.trim()))
            .join('\n')
        : '');
    const paxDes =
      parsed.pax_desembarcando ||
      parsed.pax2 ||
      (Array.isArray(parsed.desembarcando)
        ? parsed.desembarcando
            .map((p: any) => (typeof p === 'string' ? p : `${p.nome || ''} - ${p.funcao || p.doc || ''}`.trim()))
            .join('\n')
        : '');

    return {
      grupo: parsed.grupo || report.empresa || 'MMS',
      unidade: parsed.unidade || report.unidade || 'MMS',
      data: parsed.data || (report.data_criacao ? report.data_criacao.split('T')[0] : new Date().toISOString().split('T')[0]),
      local: parsed.local || parsed.local_atendimento || report.local_atendimento || 'Macaé / Aeroporto',
      modal: parsed.modal || 'Helicóptero',
      preposto: parsed.preposto || report.preposto || 'Coordenação',
      observacao: parsed.observacao || parsed.observacao_nome_arquivo || '',
      observacao_nome_arquivo: parsed.observacao_nome_arquivo || parsed.observacao || '',
      horarios: parsed.horarios || {
        saida_hotel: parsed.listaSaidas || [],
        embarque_previsto: parsed.embarque_previsto || 'N/A',
        embarque_real: parsed.embarque_real || 'N/A',
        atendimento_inicio: parsed.atendimento_inicio || '00:00',
        atendimento_fim: parsed.atendimento_fim || '00:00',
      },
      info_troca: parsed.info_troca || parsed.info || '',
      pax_embarcando: paxEmb,
      pax_desembarcando: paxDes,
      fotos: parsed.fotos || parsed.fotosAnexadas || [],
      alinhamentoInfo: parsed.alinhamentoInfo || 'left',
    };
  };

  // 1. Baixar PDF real gerado
  const handleBaixarRelatorio = async (report: any) => {
    if (!report) return;
    try {
      const pdfData = extractReportPdfData(report);
      const rawUrl = report.pdf_url || report.caminho_pdf;
      const formattedUrl = formatReportPdfUrl(rawUrl);
      const res = await baixarPdfRelatorio(pdfData, formattedUrl);
      if (res.sucesso && Platform.OS !== 'web') {
        showCustomAlert('DOWNLOAD CONCLUÍDO', `Arquivo ${res.nomeArquivo} baixado com sucesso!`);
      }
    } catch (e: any) {
      showCustomAlert('DOWNLOAD DO PDF', e.message || 'Falha ao baixar o PDF do relatório.');
    }
  };

  // 2. Compartilhar Relatório via menu nativo de compartilhamento do navegador (navmenu)
  const handleCompartilharRelatorio = async (report: any) => {
    if (!report) return;
    try {
      const pdfData = extractReportPdfData(report);
      const rawUrl = report.pdf_url || report.caminho_pdf;
      const formattedUrl = formatReportPdfUrl(rawUrl);
      const fallbackUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? (formattedUrl || `${window.location.origin}/ver_relatorio.php?id=${report.id}`)
        : undefined;
      const res = await compartilharPdfRelatorio(pdfData, fallbackUrl, formattedUrl);
      if (!res.sucesso && res.metodo === 'not_supported') {
        showCustomAlert(
          'COMPARTILHAR',
          'Função de compartilhar não suportada neste navegador. Use o botão Baixar.\n(O link foi copiado para a área de transferência).'
        );
      } else if (res.sucesso && res.metodo === 'clipboard') {
        showCustomAlert('LINK COPIADO', 'O link do relatório foi copiado para sua área de transferência para compartilhamento.');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        showCustomAlert('COMPARTILHAR', e?.message || 'Falha ao abrir menu de compartilhamento.');
      }
    }
  };

  // 3. Visualizar relatório em página completa (fidelidade a coord/index.php e ver_relatorio.php)
  const handleVisualizarRelatorio = async (report: any) => {
    if (!report) return;
    let fullReport = report;
    if (!report.dados_json) {
      try {
        const { data } = await supabase.from('relatorios').select('*').eq('id', report.id).single();
        if (data) fullReport = data;
      } catch (e) {}
    }
    const pdfData = extractReportPdfData(fullReport);
    visualizarRelatorioHtml(pdfData);
  };

  const handleVoltarAoGerador = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
    } else {
      router.replace('/');
    }
  };

  // 4. Editar relatório na coordenação (redireciona para o gerador com todos os campos desbloqueados)
  const handleEditarRelatorio = (report: any) => {
    if (!report) return;
    setSelectedReport(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = `/?editId=${report.id}`;
    } else {
      router.push(`/?editId=${report.id}`);
    }
  };

  // Cores de Badge de Empresa idênticas ao coord/index.php
  const getCompanyBadgeStyle = (empresa?: string) => {
    const emp = (empresa || '').toUpperCase().trim();
    if (emp.includes('TECHNIP/DOF')) return { bg: '#fce7f3', text: '#be185d' };
    if (emp.includes('TECHNIP')) return { bg: '#f3e8ff', text: '#7e22ce' };
    if (emp.includes('DOF')) return { bg: '#ffedd5', text: '#c2410c' };
    if (emp.includes('CONSTELLATION')) return { bg: '#dbeafe', text: '#1d4ed8' };
    if (emp.includes('ZONDA')) return { bg: '#ecfccb', text: '#3f6212' };
    return { bg: '#e2e8f0', text: '#334155' };
  };

  // Toggle Status Pop-up
  const handleTogglePopup = async (popupId: number, statusAtual: boolean | number) => {
    const novoStatus = !(statusAtual === true || statusAtual === 1);
    try {
      if (typeof localStorage !== 'undefined') {
        try {
          const rawP = localStorage.getItem('mms_popups_store') || localStorage.getItem('mms_popups_local');
          if (rawP) {
            const listP = JSON.parse(rawP).map((p: any) =>
              p.id === popupId ? { ...p, ativa: novoStatus ? 1 : 0 } : p
            );
            localStorage.setItem('mms_popups_store', JSON.stringify(listP));
            localStorage.setItem('mms_popups_local', JSON.stringify(listP));
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mms_mensagens_atualizadas'));
          }
        } catch (e) {}
      }
      const { error } = await supabase
        .from('notificacoes')
        .update({ ativa: novoStatus ? 1 : 0 })
        .eq('id', popupId);

      if (error) {
        showCustomAlert('Erro', error.message);
      } else {
        setPopups((prev) =>
          prev.map((p) => (p.id === popupId ? { ...p, ativa: novoStatus ? 1 : 0 } : p))
        );
      }
    } catch (e: any) {
      showCustomAlert('Erro', e.message);
    }
  };

  // Excluir Pop-up
  const handleExcluirPopup = async (popupId: number) => {
    showCustomAlert(
      'EXCLUIR COMUNICADO',
      'Deseja remover este comunicado?',
      async () => {
        try {
          if (typeof localStorage !== 'undefined') {
            try {
              const rawP1 = localStorage.getItem('mms_popups_store');
              if (rawP1) {
                const listP1 = JSON.parse(rawP1).filter((p: any) => p.id !== popupId);
                localStorage.setItem('mms_popups_store', JSON.stringify(listP1));
              }
              const rawP2 = localStorage.getItem('mms_popups_local');
              if (rawP2) {
                const listP2 = JSON.parse(rawP2).filter((p: any) => p.id !== popupId);
                localStorage.setItem('mms_popups_local', JSON.stringify(listP2));
              }
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('mms_mensagens_atualizadas'));
              }
            } catch (e) {}
          }
          const { error } = await supabase.from('notificacoes').delete().eq('id', popupId);
          if (error) {
            showCustomAlert('Erro', error.message);
          } else {
            setPopups((prev) => prev.filter((p) => p.id !== popupId));
            showCustomAlert('Sucesso', 'Comunicado removido com sucesso!');
          }
        } catch (e: any) {
          showCustomAlert('Erro', e.message);
        }
      },
      true
    );
  };

  // Salvar Novo Pop-up
  const handleSalvarNovoPopup = async () => {
    if (!novoPopupTitulo.trim() || !novoPopupMensagem.trim()) {
      showCustomAlert('Atenção', 'Preencha o título e a mensagem do comunicado.');
      return;
    }

    setSalvandoPopup(true);
    try {
      const { data, error } = await supabase.from('notificacoes').insert([
        {
          titulo: novoPopupTitulo.trim(),
          mensagem: novoPopupMensagem.trim(),
          tipo: novoPopupTipo,
          ativa: 1,
          regra_exibicao: 'sempre',
          mostrar_feedback: 1,
        },
      ]).select();

      if (error) {
        showCustomAlert('Erro', error.message);
      } else {
        const createdPopup = data && data[0] ? data[0] : {
          id: Date.now(),
          titulo: novoPopupTitulo.trim(),
          mensagem: novoPopupMensagem.trim(),
          tipo: novoPopupTipo,
          ativa: 1,
          data_criacao: new Date().toISOString(),
        };
        if (typeof localStorage !== 'undefined') {
          try {
            const rawP = localStorage.getItem('mms_popups_store') || localStorage.getItem('mms_popups_local');
            const listP = rawP ? JSON.parse(rawP) : [];
            listP.unshift(createdPopup);
            localStorage.setItem('mms_popups_store', JSON.stringify(listP.slice(0, 50)));
            localStorage.setItem('mms_popups_local', JSON.stringify(listP.slice(0, 50)));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('mms_mensagens_atualizadas'));
            }
          } catch (e) {}
        }
        setNovoPopupTitulo('');
        setNovoPopupMensagem('');
        setIsNovoPopupModalVisible(false);
        carregarPopups();
        showCustomAlert('Sucesso', 'Comunicado publicado com sucesso!');
      }
    } catch (e: any) {
      showCustomAlert('Erro', e.message);
    } finally {
      setSalvandoPopup(false);
    }
  };

  // Cálculo de Ranking (Top Geradores)
  const rankingGeradores = useMemo(() => {
    const mapa: { [key: string]: { nome: string; total: number; empresa: string } } = {};

    relatorios.forEach((r) => {
      const parsed = parseReportData(r);
      const preposto = (parsed?.preposto || r.unidade || 'Desconhecido').trim();
      const emp = r.empresa || 'OUTROS';

      if (!mapa[preposto]) {
        mapa[preposto] = { nome: preposto, total: 0, empresa: emp };
      }
      mapa[preposto].total += 1;
    });

    return Object.values(mapa).sort((a, b) => b.total - a.total);
  }, [relatorios]);

  // Lista de Usuários Filtrados
  const usuariosFiltrados = useMemo(() => {
    if (!filtroBuscaUsuario.trim()) return usuarios;
    const term = filtroBuscaUsuario.toLowerCase().trim();
    return usuarios.filter(
      (u) =>
        (u.nome && u.nome.toLowerCase().includes(term)) ||
        (u.username && u.username.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term))
    );
  }, [usuarios, filtroBuscaUsuario]);

  // Badge de Empresa
  const renderEmpresaBadge = (empresa: string) => {
    const emp = (empresa || 'OUTROS').toUpperCase();
    let bg = '#f1f5f9';
    let text = '#475569';

    if (emp.includes('ALPHA')) { bg = '#f3e8ff'; text = '#7e22ce'; }
    else if (emp.includes('NEXUS')) { bg = '#ffedd5'; text = '#c2410c'; }
    else if (emp.includes('OCEANIC')) { bg = '#dbeafe'; text = '#1d4ed8'; }
    else if (emp.includes('SOLARIS')) { bg = '#fef3c7'; text = '#b45309'; }
    else if (emp.includes('VANGUARD')) { bg = '#d1fae5'; text = '#047857'; }

    return (
      <View style={[styles.badgeContainer, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: text }]}>{emp}</Text>
      </View>
    );
  };

  // 1. Tela de Carregamento da Autorização
  if (!authChecked) {
    return (
      <SafeAreaView style={[styles.container, !isDarkMode && { backgroundColor: '#f1f5f9' }, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={{ alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color="#06b6d4" />
          <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '700', color: isDarkMode ? '#f8fafc' : '#0f172a', fontFamily: modernFont }}>
            VERIFICANDO AUTORIZAÇÃO DE COORDENAÇÃO...
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: '#94a3b8', fontFamily: modernFont }}>
            Checando credenciais e nível de autoridade no banco de dados.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 2. Verificação de Acesso / Desbloqueio do Painel com Credenciais de Coordenador (Nível 2)
  if (!isAuthorized || !isPanelUnlocked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#f1f5f9' }]}>
        <View style={styles.coordNavbar} className="coord-navbar coord-navbar-sticky">
          <View style={[styles.coordNavbarInner, { paddingVertical: 12 }]}>
            <View style={styles.coordNavLeft}>
              <View style={styles.coordNavLogoIcon}>
                <Text style={styles.coordNavLogoRay}>🛡️</Text>
              </View>
              <Text style={styles.coordNavLogoText}>PAINEL DE COORDENAÇÃO</Text>
            </View>
            <View style={styles.coordNavRight}>
              <TouchableOpacity
                style={styles.coordNavVoltarBtn}
                onPress={handleVoltarAoGerador}
                activeOpacity={0.8}
              >
                <Text style={styles.coordNavVoltarBtnText}>VOLTAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.restrictedContainer}>
          <View style={[styles.coordLockCard, { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
            <View style={[styles.coordLockIconCircle, { backgroundColor: '#eff6ff', borderColor: '#dbeafe' }]}>
              <Text style={{ fontSize: 36 }}>🔐</Text>
            </View>

            <Text style={[styles.coordLockTitle, { color: '#0f172a' }]}>
              Painel de Coordenação
            </Text>
            <Text style={[styles.coordLockSubtitle, { color: '#64748b' }]}>
              Insira usuário e senha autorizados para acessar o painel
            </Text>

            {erroSenhaPainel && (
              <View style={styles.coordLockErrorBox}>
                <Text style={styles.coordLockErrorText}>❌ {erroSenhaPainel}</Text>
              </View>
            )}

            <View style={styles.coordLockInputGroup}>
              <Text style={[styles.coordLockInputLabel, { color: '#475569' }]}>
                USUÁRIO
              </Text>
              <TextInput
                style={[styles.coordLockInput, styles.coordLockInputLight]}
                value={inputUsuarioPainel}
                onChangeText={setInputUsuarioPainel}
                placeholder="Usuário ou e-mail..."
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.coordLockInputGroup}>
              <Text style={[styles.coordLockInputLabel, { color: '#475569' }]}>
                SENHA DE ACESSO
              </Text>
              <TextInput
                style={[styles.coordLockInput, styles.coordLockInputLight]}
                value={inputSenhaPainel}
                onChangeText={setInputSenhaPainel}
                placeholder="Digite a senha..."
                placeholderTextColor="#94a3b8"
                secureTextEntry
                onSubmitEditing={handleDesbloquearPainel}
              />
            </View>

            <TouchableOpacity
              style={styles.btnDesbloquearPainel}
              onPress={handleDesbloquearPainel}
              disabled={validandoSenhaPainel}
              activeOpacity={0.85}
            >
              {validandoSenhaPainel ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.btnDesbloquearPainelText}>🔓 ACESSAR PAINEL</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnVoltarGeradorLock}
              onPress={handleVoltarAoGerador}
              activeOpacity={0.7}
            >
              <Text style={styles.btnVoltarGeradorLockText}>← Voltar ao Gerador de Relatórios</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 4. Painel de Coordenação Autorizado e Desbloqueado
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#f1f5f9' }]}>
      {/* Navbar Principal com Cabeçalho Customizado (Tema Escuro Idêntico ao index.tsx - Fixo / Sticky) */}
      <View style={styles.coordNavbar} className="coord-navbar coord-navbar-sticky">
        <View style={styles.coordNavbarInner} className="coord-navbar-inner">
          {/* Esquerda: Logo + Título */}
          <View style={styles.coordNavLeft} className="coord-nav-left">
            <View style={styles.coordNavLogoIcon} className="coord-nav-logo-icon">
              <Text style={styles.coordNavLogoRay}>⚡</Text>
            </View>
            <Text style={styles.coordNavLogoText} className="coord-nav-logo-text">COORDENAÇÃO</Text>
          </View>

          {/* Direita: IP / Data-Hora, Usuário, Notificação, Voltar e Sair (Alinhados no Top Right) */}
          <View style={styles.coordNavRight} className="coord-nav-right">
            {!isMobile && (
              <View style={styles.coordNavDateTimeGroup} className="coord-nav-datetime-group">
                <Text style={styles.coordNavDateTimeText}>{dataHoraAtual}</Text>
                <Text style={styles.coordNavIpText}>IP Conectado: {userIp}</Text>
              </View>
            )}

            <View style={styles.coordNavUserGroup} className="coord-nav-user-group">
              <Text style={styles.coordNavUserGreeting}>
                Olá, <Text style={styles.coordNavUserName}>{userSession?.user?.user_metadata?.name || inputUsuarioPainel || 'Ítalo Gabriel'}</Text>
              </Text>

              <View style={styles.coordNavButtonsGroup} className="coord-nav-buttons-group">
                <TouchableOpacity
                  style={styles.coordNavNotificationBtn}
                  className="coord-nav-btn-notif"
                  onPress={() => setActiveTab('popups')}
                  activeOpacity={0.8}
                  accessibilityLabel="Notificações"
                >
                  <Text style={{ fontSize: 16 }}>🔔</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.coordNavVoltarBtn}
                  className="coord-nav-btn-voltar"
                  onPress={handleVoltarAoGerador}
                  activeOpacity={0.8}
                >
                  <Text style={styles.coordNavVoltarBtnText}>VOLTAR</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.coordNavSairBtn}
                  className="coord-nav-btn-sair"
                  onPress={handleBloquearPainel}
                  activeOpacity={0.8}
                >
                  <Text style={styles.coordNavSairBtnText}>SAIR</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Filtro de KPIs / Visão Geral (Refinado) */}
        <View style={styles.overviewSummaryCardLight}>
          <View style={styles.overviewSummaryLeft}>
            <View style={styles.overviewSummaryIconBox}>
              <Text style={{ fontSize: 22, color: '#ffffff' }}>📊</Text>
            </View>
            <View>
              <Text style={styles.overviewSummaryTitle}>VISÃO GERAL</Text>
              <Text style={styles.overviewSummarySubtitle}>Análise de métricas e performance</Text>
            </View>
          </View>

          <View style={styles.overviewSummaryRight}>
            <View style={styles.overviewMonthSelectorLight}>
              <Text style={styles.overviewMonthText}>📅 {nomeMesAtual}</Text>
            </View>
            <TouchableOpacity
              style={styles.overviewBtnFiltrar}
              onPress={() => carregarRelatorios()}
              activeOpacity={0.8}
            >
              <Text style={styles.overviewBtnFiltrarText}>FILTRAR ›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Seção de 4 KPIs / Métricas Principais */}
        {/* Seção de 4 KPIs / Métricas Principais */}
        <View style={styles.kpiCardsGrid} className="coord-kpi-cards-grid">
          {/* Card 1: Hoje (Relatórios gerados hoje em primeiro) */}
          <View style={[styles.kpiMetricCard, styles.kpiMetricCardHoje]} className="coord-interactive-card">
            <View style={styles.kpiMetricTopRow}>
              <Text style={[styles.kpiMetricLabel, { color: '#ea580c' }]}>HOJE</Text>
              <Text style={{ fontSize: 14 }}>⚡</Text>
            </View>
            <Text style={[styles.kpiMetricValue, { color: '#000000' }]}>{relatoriosHojeCount}</Text>
            <Text style={styles.kpiMetricFootnote}>Relatórios gerados hoje</Text>
          </View>

          {/* Card 2: Neste Mês */}
          <View style={[styles.kpiMetricCard, styles.kpiMetricCardMes]} className="coord-interactive-card">
            <View style={styles.kpiMetricTopRow}>
              <Text style={[styles.kpiMetricLabel, { color: '#0284c7' }]}>NESTE MÊS</Text>
              <Text style={{ fontSize: 14 }}>📅</Text>
            </View>
            <Text style={[styles.kpiMetricValue, { color: '#000000' }]}>{relatoriosMesCount}</Text>
            <Text style={styles.kpiMetricFootnote}>Atendimentos no mês atual</Text>
          </View>

          {/* Card 3: Total Geral */}
          <View style={[styles.kpiMetricCard, styles.kpiMetricCardTotal]} className="coord-interactive-card">
            <View style={styles.kpiMetricTopRow}>
              <Text style={[styles.kpiMetricLabel, { color: '#2563eb' }]}>TOTAL GERAL</Text>
              <Text style={{ fontSize: 14 }}>📊</Text>
            </View>
            <Text style={[styles.kpiMetricValue, { color: '#000000' }]}>{totalRelatoriosGeral}</Text>
            <Text style={styles.kpiMetricFootnote}>Relatórios emitidos</Text>
          </View>

          {/* Card 4: Usuários */}
          <View style={[styles.kpiMetricCard, styles.kpiMetricCardUsuarios]} className="coord-interactive-card">
            <View style={styles.kpiMetricTopRow}>
              <Text style={[styles.kpiMetricLabel, { color: '#7c3aed' }]}>USUÁRIOS</Text>
              <Text style={{ fontSize: 14 }}>👥</Text>
            </View>
            <Text style={[styles.kpiMetricValue, { color: '#000000' }]}>{usuarios.length > 0 ? usuarios.length : 10}</Text>
            <Text style={styles.kpiMetricFootnote}>Contas registradas</Text>
          </View>
        </View>

        {/* Abas de Navegação (Scroll horizontal suave e responsivo em qualquer tela) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ width: '100%', marginBottom: 16 }}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={styles.tabsBarRow}>
            <TouchableOpacity
              style={[styles.tabNavButton, activeTab === 'relatorios' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('relatorios')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>📊</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'relatorios' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                RELATÓRIOS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, activeTab === 'ranking' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('ranking')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>🏆</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'ranking' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                RANKING
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, activeTab === 'popups' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('popups')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>📢</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'popups' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                POP-UPS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, activeTab === 'mensagens' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('mensagens')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>💬</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'mensagens' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                MENSAGENS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, activeTab === 'seguranca' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => {
                setActiveTab('seguranca');
                carregarSeguranca();
              }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>🛡️</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'seguranca' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                SEGURANÇA
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, activeTab === 'sistema' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('sistema')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>⚙️</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'sistema' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                SISTEMA
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, activeTab === 'version' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('version')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>🏷️</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'version' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                VERSION
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* ════════════════ ABA 1: RELATÓRIOS GERAIS (CARD UNIFICADO) ════════════════ */}
        {activeTab === 'relatorios' && (
          <View style={styles.tabContent}>
            <View style={styles.unifiedReportsCard}>
              {/* Cabeçalho de Filtros */}
              <View style={styles.reportsFilterSection}>
                <View style={styles.reportsFilterHeaderRow}>
                  <Text style={{ fontSize: 16 }}>📊</Text>
                  <Text style={styles.reportsFilterHeaderTitle}>RELATÓRIOS GERADOS</Text>
                </View>

                <View style={styles.reportsFilterRow}>
                  {/* DE */}
                  <View style={styles.reportsFilterFieldBox}>
                    <Text style={styles.reportsFilterFieldLabel}>DE:</Text>
                    <TextInput
                      style={styles.reportsFilterInput}
                      placeholder="dd/mm/aaaa"
                      placeholderTextColor="#94a3b8"
                      value={filtroDataInicio}
                      onChangeText={setFiltroDataInicio}
                    />
                  </View>

                  {/* ATÉ */}
                  <View style={styles.reportsFilterFieldBox}>
                    <Text style={styles.reportsFilterFieldLabel}>ATÉ:</Text>
                    <TextInput
                      style={styles.reportsFilterInput}
                      placeholder="dd/mm/aaaa"
                      placeholderTextColor="#94a3b8"
                      value={filtroDataFim}
                      onChangeText={setFiltroDataFim}
                    />
                  </View>

                  {/* Buscar Usuário */}
                  <View style={[styles.reportsFilterFieldBox, { minWidth: 150, flex: 1 }]}>
                    <TextInput
                      style={styles.reportsFilterInputNoBorder}
                      placeholder="Buscar usuário..."
                      placeholderTextColor="#94a3b8"
                      value={filtroBuscaUsuario}
                      onChangeText={setFiltroBuscaUsuario}
                    />
                  </View>

                  {/* Unidade */}
                  <View style={[styles.reportsFilterFieldBox, { minWidth: 140, flex: 1 }]}>
                    <TextInput
                      style={styles.reportsFilterInputNoBorder}
                      placeholder="Unidade..."
                      placeholderTextColor="#94a3b8"
                      value={filtroBusca}
                      onChangeText={setFiltroBusca}
                    />
                  </View>

                  {/* Empresa Dropdown */}
                  <TouchableOpacity
                    style={[styles.reportsFilterFieldBox, styles.reportsDropdownBtn]}
                    onPress={() => {
                      setIsEmpresaDropdownOpen(!isEmpresaDropdownOpen);
                      setIsUsuarioDropdownOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.reportsDropdownBtnText} numberOfLines={1}>
                      {filtroEmpresa === 'TODAS' ? 'Empresa...' : filtroEmpresa}
                    </Text>
                    <Text style={styles.reportsDropdownChevron}>▾</Text>
                  </TouchableOpacity>

                  {/* Usuário Dropdown */}
                  <TouchableOpacity
                    style={[styles.reportsFilterFieldBox, styles.reportsDropdownBtn]}
                    onPress={() => {
                      setIsUsuarioDropdownOpen(!isUsuarioDropdownOpen);
                      setIsEmpresaDropdownOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.reportsDropdownBtnText} numberOfLines={1}>
                      {filtroUsuarioId ? (usuarios.find((u) => u.id === filtroUsuarioId)?.nome || 'Usuário...') : 'Usuário...'}
                    </Text>
                    <Text style={styles.reportsDropdownChevron}>▾</Text>
                  </TouchableOpacity>

                  {/* Botões FILTRAR e LIMPAR */}
                  <TouchableOpacity
                    style={styles.btnReportsFiltrar}
                    onPress={() => {
                      setPaginaRelatorios(1);
                      carregarRelatorios();
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnReportsFiltrarText}>FILTRAR</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnReportsLimpar}
                    onPress={limparFiltros}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnReportsLimparText}>LIMPAR</Text>
                  </TouchableOpacity>
                </View>

                {/* Dropdowns flutuantes se abertos */}
                {isUsuarioDropdownOpen && (
                  <View style={styles.coordDropdownOptionsListLight}>
                    <TouchableOpacity
                      style={[styles.coordDropdownOptionItem, !filtroUsuarioId && styles.coordDropdownOptionItemActive]}
                      onPress={() => {
                        setFiltroUsuarioId(null);
                        setIsUsuarioDropdownOpen(false);
                      }}
                    >
                      <Text style={styles.coordDropdownOptionText}>TODOS OS USUÁRIOS</Text>
                      {!filtroUsuarioId && <Text style={styles.coordDropdownOptionCheck}>✓</Text>}
                    </TouchableOpacity>
                    {usuarios.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        style={[styles.coordDropdownOptionItem, filtroUsuarioId === u.id && styles.coordDropdownOptionItemActive]}
                        onPress={() => {
                          setFiltroUsuarioId(u.id);
                          setIsUsuarioDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.coordDropdownOptionText}>
                          {u.nome || u.username} ({u.username})
                        </Text>
                        {filtroUsuarioId === u.id && <Text style={styles.coordDropdownOptionCheck}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {isEmpresaDropdownOpen && (
                  <View style={styles.coordDropdownOptionsListLight}>
                    {EMPRESAS.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.coordDropdownOptionItem,
                          filtroEmpresa === opt && styles.coordDropdownOptionItemActive,
                        ]}
                        onPress={() => {
                          setFiltroEmpresa(opt);
                          setIsEmpresaDropdownOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.coordDropdownOptionText,
                            filtroEmpresa === opt && styles.coordDropdownOptionTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                        {filtroEmpresa === opt && <Text style={styles.coordDropdownOptionCheck}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Header da Tabela UNIDADE / AUTOR vs EMPRESA */}
              <View style={styles.reportsListHeaderRow}>
                <Text style={styles.reportsListHeaderText}>UNIDADE / AUTOR</Text>
                <Text style={styles.reportsListHeaderText}>EMPRESA</Text>
              </View>

              {/* Listagem de Relatórios */}
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color="#0284c7" />
                  <Text style={styles.loadingText}>Carregando relatórios...</Text>
                </View>
              ) : relatorios.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>📭</Text>
                  <Text style={styles.emptyTitle}>Nenhum relatório encontrado</Text>
                  <Text style={styles.emptySubtitle}>Ajuste os filtros ou verifique a conexão com o banco de dados.</Text>
                </View>
              ) : (
                <View style={styles.reportsListContainer}>
                  {relatorios.map((item) => {
                    const parsed = parseReportData(item);
                    const dataFormatada = item.data_criacao
                      ? new Date(item.data_criacao).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      : 'N/A';
                    const preposto = parsed?.preposto || usuarios.find((u) => u.id === item.usuario_id)?.nome || 'NÃO INFORMADO';
                    const ipOrigem = item.ip_origem || 'N/A';
                    const badgeStyle = getCompanyBadgeStyle(item.empresa);

                    return (
                      <View key={item.id} style={styles.reportsItemCard}>
                        <View style={styles.reportsItemTop}>
                          <Text style={styles.reportsItemUnidade} numberOfLines={1}>
                            {item.unidade || 'SEM UNIDADE'}
                          </Text>
                          <View style={[styles.reportsEmpresaBadge, { backgroundColor: badgeStyle.bg }]}>
                            <Text style={[styles.reportsEmpresaBadgeText, { color: badgeStyle.text }]}>
                              {(item.empresa || 'OUTROS').toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.reportsItemSub} numberOfLines={1}>
                          POR: 🌐 IP: {ipOrigem} ({preposto.toUpperCase()})
                        </Text>

                        <View style={styles.reportsItemTimeRow}>
                          <Text style={styles.reportsItemTimeText}>🕒 {dataFormatada}</Text>
                        </View>

                        {/* Botões de Ação */}
                        <View style={styles.reportsActionPillsRow}>
                          <TouchableOpacity
                            style={[styles.actionPill, styles.actionPillDownload]}
                            onPress={() => handleBaixarRelatorio(item)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.actionPillDownloadText}>📥 DOWNLOAD</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionPill, styles.actionPillVisualizar]}
                            onPress={() => handleVisualizarRelatorio(item)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.actionPillVisualizarText}>👁️ VISUALIZAR</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionPill, styles.actionPillEditar]}
                            onPress={() => handleEditarRelatorio(item)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.actionPillEditarText}>✏️ EDITAR</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionPill, styles.actionPillCompartilhar]}
                            onPress={() => handleCompartilharRelatorio(item)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.actionPillCompartilharText}>📤 COMPARTILHAR</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionPill, styles.actionPillExcluir]}
                            onPress={() => handleExcluirRelatorio(item.id)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.actionPillExcluirText}>🗑️ EXCLUIR</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Paginação */}
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  style={[styles.pageBtn, paginaRelatorios <= 1 && styles.pageBtnDisabled]}
                  disabled={paginaRelatorios <= 1}
                  onPress={() => setPaginaRelatorios((p) => Math.max(1, p - 1))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pageBtnText}>← ANTERIOR</Text>
                </TouchableOpacity>

                <Text style={styles.pageIndicatorText}>
                  PÁGINA {paginaRelatorios} DE {Math.max(1, Math.ceil(totalRelatoriosGeral / porPagina))}
                </Text>

                <TouchableOpacity
                  style={[styles.pageBtn, relatorios.length < porPagina && styles.pageBtnDisabled]}
                  disabled={relatorios.length < porPagina}
                  onPress={() => setPaginaRelatorios((p) => p + 1)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pageBtnText}>PRÓXIMA →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ════════════════ ABA 2: RANKING / TOP GERADORES (IGUAL COORD/INDEX.PHP) ════════════════ */}
        {activeTab === 'ranking' && (
          <View style={styles.tabContent}>
            <View style={styles.rankingCard}>
              <View style={styles.rankingHeader}>
                <View style={styles.rankingHeaderLeft}>
                  <View style={styles.rankingIconBox}>
                    <Text style={{ fontSize: 20, color: '#ffffff' }}>🏆</Text>
                  </View>
                  <View>
                    <Text style={styles.rankingTitle}>TOP GERADORES</Text>
                    <Text style={styles.rankingSubtitle}>Ranking dos que mais geraram relatórios</Text>
                  </View>
                </View>
              </View>

              {/* Tabela do Ranking */}
              <View style={styles.rankingTableHeaderRow}>
                <View style={styles.rankingColPos}>
                  <Text style={styles.rankingTableHeaderText}>POSIÇÃO</Text>
                </View>
                <View style={styles.rankingColUser}>
                  <Text style={styles.rankingTableHeaderText}>USUÁRIO / PREPOSTO</Text>
                </View>
                <View style={styles.rankingColTotal}>
                  <Text style={styles.rankingTableHeaderText}>TOTAL</Text>
                </View>
              </View>

              <View>
                {rankingGeradores.map((item, index) => {
                  const is1 = index === 0;
                  const is2 = index === 1;
                  const is3 = index === 2;

                  return (
                    <View key={item.nome || index} style={styles.rankingTableRow}>
                      <View style={styles.rankingColPos}>
                        {is1 ? (
                          <View style={[styles.rankingPosBadge, styles.rankingPosBadge1]}>
                            <Text style={styles.rankingPosBadgeText1}>1</Text>
                          </View>
                        ) : is2 ? (
                          <View style={[styles.rankingPosBadge, styles.rankingPosBadge2]}>
                            <Text style={styles.rankingPosBadgeText2}>2</Text>
                          </View>
                        ) : is3 ? (
                          <View style={[styles.rankingPosBadge, styles.rankingPosBadge3]}>
                            <Text style={styles.rankingPosBadgeText3}>3</Text>
                          </View>
                        ) : (
                          <Text style={styles.rankingPosNumber}>{index + 1}</Text>
                        )}
                      </View>

                      <View style={styles.rankingColUser}>
                        <Text style={styles.rankingUserName} numberOfLines={1}>
                          {item.nome}
                        </Text>
                      </View>

                      <View style={styles.rankingColTotal}>
                        <View style={styles.rankingTotalBadge}>
                          <Text style={styles.rankingTotalBadgeText}>{item.total}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ════════════════ ABA 3: USUÁRIOS & PERMISSÕES ════════════════ */}
        {activeTab === 'usuarios' && (
          <View style={styles.tabContent}>
            <View style={[styles.sectionCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={styles.sectionHeader}>
                <Text style={{ fontSize: 24 }}>👥</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, !isDarkMode && { color: '#0f172a' }]}>GERENCIAMENTO DE USUÁRIOS</Text>
                  <Text style={styles.sectionSubtitle}>Controle de permissões (Nível 1 Básico vs Nível 2 Coordenação)</Text>
                </View>
              </View>

              {/* Barra de Busca de Usuário */}
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={[styles.searchInput, !isDarkMode && { color: '#0f172a' }]}
                  placeholder="Filtrar por nome, username ou e-mail..."
                  placeholderTextColor="#64748b"
                  value={filtroBuscaUsuario}
                  onChangeText={setFiltroBuscaUsuario}
                />
              </View>

              {/* Tabela de Usuários */}
              <View style={styles.userList}>
                {usuariosFiltrados.map((u) => {
                  const nivelNum = Number(u.nivel_autoridade) || 1;
                  const isCoord = nivelNum === 2;

                  return (
                    <View
                      key={u.id}
                      style={[styles.userCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
                    >
                      <View style={styles.userCardInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.userNameText, !isDarkMode && { color: '#0f172a' }]}>
                            {u.nome || u.username || 'Sem Nome'}
                          </Text>
                          <View
                            style={[
                              styles.roleBadge,
                              isCoord ? styles.roleBadgeCoord : styles.roleBadgeBasic,
                            ]}
                          >
                            <Text
                              style={[
                                styles.roleBadgeText,
                                isCoord ? { color: '#f59e0b' } : { color: '#06b6d4' },
                              ]}
                            >
                              {isCoord ? '🛡️ NÍVEL 2 - COORDENAÇÃO' : '👤 NÍVEL 1 - BÁSICO'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.userMetaText}>
                          Username: <Text style={{ color: '#94a3b8' }}>{u.username}</Text> | E-mail: <Text style={{ color: '#94a3b8' }}>{u.email || 'N/A'}</Text>
                        </Text>
                      </View>

                      <View style={styles.userCardActions}>
                        <TouchableOpacity
                          style={[
                            styles.toggleRoleBtn,
                            isCoord ? styles.btnDemote : styles.btnPromote,
                          ]}
                          onPress={() => handleAlterarNivelUsuario(u.id, nivelNum)}
                        >
                          <Text style={styles.toggleRoleBtnText}>
                            {isCoord ? '⬇️ Rebaixar para Nível 1' : '⬆️ Promover para Nível 2'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ════════════════ ABA 4: COMUNICADOS / POP-UPS ════════════════ */}
        {activeTab === 'popups' && (
          <View style={styles.tabContent}>
            <View style={[styles.sectionCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={[styles.sectionHeader, { justifyContent: 'space-between', alignItems: 'center' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ fontSize: 24 }}>📢</Text>
                  <View>
                    <Text style={[styles.sectionTitle, !isDarkMode && { color: '#0f172a' }]}>COMUNICADOS GLOBAIS</Text>
                    <Text style={styles.sectionSubtitle}>Notificações e avisos exibidos para os usuários no app</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.newNotificationBtn}
                  onPress={() => setIsNovoPopupModalVisible(true)}
                >
                  <Text style={styles.newNotificationBtnText}>+ NOVO COMUNICADO</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.popupsList}>
                {popups.length === 0 ? (
                  <Text style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>
                    Nenhum comunicado ativo ou cadastrado no momento.
                  </Text>
                ) : (
                  popups.map((p) => {
                    const ativa = p.ativa === 1 || p.ativa === true;
                    return (
                      <View key={p.id} style={[styles.popupCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                        <View style={styles.popupCardHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.popupTitleText, !isDarkMode && { color: '#0f172a' }]}>{p.titulo}</Text>
                            <View style={[styles.popupTypeBadge, p.tipo === 'urgente' ? styles.badgeUrgente : styles.badgeAviso]}>
                              <Text style={styles.popupTypeBadgeText}>{p.tipo?.toUpperCase() || 'AVISO'}</Text>
                            </View>
                          </View>

                          <TouchableOpacity
                            style={[styles.statusTogglePill, ativa ? styles.statusActive : styles.statusInactive]}
                            onPress={() => handleTogglePopup(p.id, p.ativa)}
                          >
                            <Text style={styles.statusTogglePillText}>{ativa ? '● ATIVO' : '○ INATIVO'}</Text>
                          </TouchableOpacity>
                        </View>

                        <Text style={[styles.popupMessageText, !isDarkMode && { color: '#475569' }]}>{p.mensagem}</Text>

                        <View style={styles.popupCardFooter}>
                          <Text style={styles.popupDateText}>
                            Criado em: {p.data_criacao ? new Date(p.data_criacao).toLocaleDateString('pt-BR') : 'N/A'}
                          </Text>
                          <TouchableOpacity
                            style={styles.deletePopupBtn}
                            onPress={() => handleExcluirPopup(p.id)}
                          >
                            <Text style={styles.deletePopupBtnText}>Excluir</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </View>
        )}

        {/* ════════════════ ABA 5: SISTEMA & STATUS ════════════════ */}
        {activeTab === 'sistema' && (
          <View style={styles.tabContent}>
            <View style={[styles.sectionCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={styles.sectionHeader}>
                <Text style={{ fontSize: 24 }}>⚙️</Text>
                <View>
                  <Text style={[styles.sectionTitle, !isDarkMode && { color: '#0f172a' }]}>DIAGNÓSTICO E INTEGRIDADE</Text>
                  <Text style={styles.sectionSubtitle}>Status das conexões e serviços da plataforma demonstrativa</Text>
                </View>
              </View>

              <View style={styles.sysStatusGrid}>
                <View style={[styles.sysStatusCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Text style={styles.sysStatusLabel}>BANCO DE DADOS CENTRAL (POSTGRESQL)</Text>
                  <Text style={styles.sysStatusOnline}>● OPERACIONAL E CONECTADO</Text>
                  <Text style={styles.sysStatusInfo}>STATUS: Servidor Nuvem Ativo (Criptografia SSL)</Text>
                </View>

                <View style={[styles.sysStatusCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Text style={styles.sysStatusLabel}>STORAGE DE PDFS (BUCKET)</Text>
                  <Text style={styles.sysStatusOnline}>● RELATORIOS_PDF ONLINE</Text>
                  <Text style={styles.sysStatusInfo}>Armazenamento direto em nuvem segura</Text>
                </View>

                <View style={[styles.sysStatusCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Text style={styles.sysStatusLabel}>SESSÃO DO COORDENADOR</Text>
                  <Text style={[styles.sysStatusVal, !isDarkMode && { color: '#0f172a' }]}>
                    {userSession?.user?.user_metadata?.name || userSession?.user?.email || 'Nível 2'}
                  </Text>
                  <Text style={styles.sysStatusInfo}>Autoridade: Nível 2 / Coordenação</Text>
                </View>

                <View style={[styles.sysStatusCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Text style={styles.sysStatusLabel}>VERSÃO DO APLICATIVO</Text>
                  <Text style={[styles.sysStatusVal, !isDarkMode && { color: '#0f172a' }]}>v2.4.0 (Build Nuvem)</Text>
                  <Text style={styles.sysStatusInfo}>Expo SDK 54 / React Native Web</Text>
                </View>
              </View>
            </View>

            {/* Card de Personalização do Rodapé (Footer) */}
            <View style={[styles.sectionCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }, { marginTop: 20 }]}>
              <View style={styles.sectionHeader}>
                <Text style={{ fontSize: 24 }}>🎨</Text>
                <View>
                  <Text style={[styles.sectionTitle, !isDarkMode && { color: '#0f172a' }]}>PERSONALIZAÇÃO DO RODAPÉ (FOOTER)</Text>
                  <Text style={styles.sectionSubtitle}>Altere os textos, cores, negrito e versão do rodapé oficial do documento e do sistema</Text>
                </View>
              </View>

              {/* Live Preview do Rodapé */}
              <View style={[styles.footerPreviewCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                <Text style={styles.footerPreviewLabel}>PRÉVIA EM TEMPO REAL DO RODAPÉ:</Text>
                <View style={styles.footerPreviewBox}>
                  <Text style={styles.footerPreviewText}>
                    {footerDraft.prefixo}
                    <Text
                      style={[
                        { color: footerDraft.corDestaque1 },
                        footerDraft.negrito1 && { fontWeight: '900' },
                      ]}
                    >
                      {footerDraft.destaque1}
                    </Text>
                    {footerDraft.conector}
                    <Text
                      style={[
                        { color: footerDraft.corDestaque2 },
                        footerDraft.negrito2 && { fontWeight: '900' },
                      ]}
                    >
                      {footerDraft.destaque2}
                    </Text>
                  </Text>
                  <View style={styles.footerPreviewBadge}>
                    <Text style={styles.footerPreviewBadgeIcon}>⬡</Text>
                    <Text style={styles.footerPreviewBadgeText}>{footerDraft.versao}</Text>
                  </View>
                </View>
              </View>

              {/* Formulário de Configuração do Rodapé */}
              <View style={styles.footerFormGrid}>
                {/* Prefixo */}
                <View style={styles.footerFormField}>
                  <Text style={[styles.footerInputLabel, !isDarkMode && { color: '#334155' }]}>TEXTO INICIAL / PREFIXO:</Text>
                  <TextInput
                    style={[styles.footerInput, !isDarkMode && styles.footerInputLight]}
                    value={footerDraft.prefixo}
                    onChangeText={(val) => setFooterDraft((prev) => ({ ...prev, prefixo: val }))}
                    placeholder="Ex: DESENVOLVIDO POR "
                    placeholderTextColor="#64748b"
                  />
                </View>

                {/* Destaque 1 (Empresa Desenvolvedora) */}
                <View style={styles.footerFormField}>
                  <Text style={[styles.footerInputLabel, !isDarkMode && { color: '#334155' }]}>NOME DESTAQUE 1 (EMPRESA 1):</Text>
                  <TextInput
                    style={[styles.footerInput, !isDarkMode && styles.footerInputLight]}
                    value={footerDraft.destaque1}
                    onChangeText={(val) => setFooterDraft((prev) => ({ ...prev, destaque1: val }))}
                    placeholder="Ex: VERO STUDIO"
                    placeholderTextColor="#64748b"
                  />
                  <View style={styles.footerControlRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.footerMiniLabel, !isDarkMode && { color: '#64748b' }]}>Cor (Hex):</Text>
                      <TextInput
                        style={[styles.footerMiniInput, !isDarkMode && styles.footerInputLight]}
                        value={footerDraft.corDestaque1}
                        onChangeText={(val) => setFooterDraft((prev) => ({ ...prev, corDestaque1: val }))}
                        placeholder="#475569"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.btnToggleBold,
                        footerDraft.negrito1 ? styles.btnToggleBoldActive : styles.btnToggleBoldInactive,
                      ]}
                      onPress={() => setFooterDraft((prev) => ({ ...prev, negrito1: !prev.negrito1 }))}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.btnToggleBoldText, footerDraft.negrito1 && styles.btnToggleBoldTextActive]}>
                        {footerDraft.negrito1 ? '✓ Negrito Ativo' : 'Negrito Desativado'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Conector */}
                <View style={styles.footerFormField}>
                  <Text style={[styles.footerInputLabel, !isDarkMode && { color: '#334155' }]}>CONECTOR / MEIO:</Text>
                  <TextInput
                    style={[styles.footerInput, !isDarkMode && styles.footerInputLight]}
                    value={footerDraft.conector}
                    onChangeText={(val) => setFooterDraft((prev) => ({ ...prev, conector: val }))}
                    placeholder="Ex:  © PARA "
                    placeholderTextColor="#64748b"
                  />
                </View>

                {/* Destaque 2 (Cliente / Parceiro) */}
                <View style={styles.footerFormField}>
                  <Text style={[styles.footerInputLabel, !isDarkMode && { color: '#334155' }]}>NOME DESTAQUE 2 (EMPRESA 2):</Text>
                  <TextInput
                    style={[styles.footerInput, !isDarkMode && styles.footerInputLight]}
                    value={footerDraft.destaque2}
                    onChangeText={(val) => setFooterDraft((prev) => ({ ...prev, destaque2: val }))}
                    placeholder="Ex: MMS SUPORTE LOGÍSTICO"
                    placeholderTextColor="#64748b"
                  />
                  <View style={styles.footerControlRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.footerMiniLabel, !isDarkMode && { color: '#64748b' }]}>Cor (Hex):</Text>
                      <TextInput
                        style={[styles.footerMiniInput, !isDarkMode && styles.footerInputLight]}
                        value={footerDraft.corDestaque2}
                        onChangeText={(val) => setFooterDraft((prev) => ({ ...prev, corDestaque2: val }))}
                        placeholder="#2563eb"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.btnToggleBold,
                        footerDraft.negrito2 ? styles.btnToggleBoldActive : styles.btnToggleBoldInactive,
                      ]}
                      onPress={() => setFooterDraft((prev) => ({ ...prev, negrito2: !prev.negrito2 }))}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.btnToggleBoldText, footerDraft.negrito2 && styles.btnToggleBoldTextActive]}>
                        {footerDraft.negrito2 ? '✓ Negrito Ativo' : 'Negrito Desativado'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Versão do App */}
                <View style={styles.footerFormField}>
                  <Text style={[styles.footerInputLabel, !isDarkMode && { color: '#334155' }]}>VERSÃO NO BADGE:</Text>
                  <TextInput
                    style={[styles.footerInput, !isDarkMode && styles.footerInputLight]}
                    value={footerDraft.versao}
                    onChangeText={(val) => setFooterDraft((prev) => ({ ...prev, versao: val }))}
                    placeholder="Ex: V1.2.5"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              {/* Botão de Salvar Alterações */}
              <TouchableOpacity
                style={styles.btnSalvarFooter}
                onPress={handleSalvarFooter}
                disabled={salvandoFooter}
                activeOpacity={0.85}
              >
                {salvandoFooter ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.btnSalvarFooterText}>💾 SALVAR CONFIGURAÇÃO DO FOOTER</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ════════════════ ABA 4: MENSAGENS IN-APP ════════════════ */}
        {activeTab === 'mensagens' && (
          <View style={styles.tabContent}>
            <View style={styles.cardContainer}>
              <View style={[styles.cardHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>💬</Text>
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: '#0f172a' }]}>
                      MENSAGENS & COMUNICADOS DIRETOS
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Envie comunicados e avisos aos usuários do gerador de relatórios
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={{ backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                  onPress={() => setIsNovoPopupModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 }}>
                    + NOVA MENSAGEM
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.versionTableContainer, { marginTop: 14 }]}>
                <View style={styles.versionTableHeaderRow}>
                  <Text style={[styles.versionHeaderColText, { width: 180 }]}>TÍTULO</Text>
                  <Text style={[styles.versionHeaderColText, { flex: 1 }]}>MENSAGEM</Text>
                  <Text style={[styles.versionHeaderColText, { width: 120 }]}>TIPO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>DATA</Text>
                </View>

                {popups.length === 0 ? (
                  <View style={{ padding: 28, alignItems: 'center' }}>
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>Nenhuma mensagem cadastrada.</Text>
                  </View>
                ) : (
                  popups.map((p, idx) => (
                    <View key={p.id || idx} style={[styles.versionTableRow, idx % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
                      <View style={{ width: 180 }}>
                        <Text style={{ fontWeight: '800', color: '#0f172a', fontSize: 12 }}>{p.titulo}</Text>
                      </View>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: '#475569', fontSize: 12 }} numberOfLines={2}>{p.mensagem}</Text>
                      </View>
                      <View style={{ width: 120 }}>
                        <View style={{ backgroundColor: p.tipo === 'urgente' ? '#fee2e2' : '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: p.tipo === 'urgente' ? '#dc2626' : '#0284c7', textTransform: 'uppercase' }}>
                            {p.tipo || 'aviso'}
                          </Text>
                        </View>
                      </View>
                      <View style={{ width: 140 }}>
                        <Text style={{ color: '#64748b', fontSize: 11 }}>
                          {p.data_criacao ? new Date(p.data_criacao).toLocaleDateString('pt-BR') : 'N/A'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          </View>
        )}

        {/* ════════════════ ABA 5: SEGURANÇA & AUDITORIA (LOGINS MAL SUCEDIDOS) ════════════════ */}
        {activeTab === 'seguranca' && (
          <View style={styles.tabContent}>
            {/* 1. TENTATIVAS DE ACESSO FALHO (LOGINS MAL SUCEDIDOS) */}
            <View style={styles.cardContainer}>
              <View style={[styles.cardHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>⚠️</Text>
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: '#dc2626' }]}>
                      ACESSOS FALHOS AO PAINEL (LOGINS MAL SUCEDIDOS)
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Histórico em tempo real de tentativas incorretas de login da coordenação gravadas no banco
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}>
                    <Text style={{ color: '#b91c1c', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                      {acessosFalhos.length} TENTATIVAS FALHAS
                    </Text>
                  </View>

                  {acessosFalhos.length > 0 && (
                    <TouchableOpacity
                      style={{ backgroundColor: '#dc2626', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}
                      onPress={handleLimparAcessosFalhos}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                        LIMPAR
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Tabela de Acessos Falhos */}
              <View style={[styles.versionTableContainer, { marginTop: 14 }]}>
                <View style={styles.versionTableHeaderRow}>
                  <Text style={[styles.versionHeaderColText, { width: 160 }]}>USUÁRIO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 170 }]}>IP DE ORIGEM</Text>
                  <Text style={[styles.versionHeaderColText, { width: 170 }]}>DATA / HORA</Text>
                  <Text style={[styles.versionHeaderColText, { flex: 1 }]}>NAVEGADOR / DISPOSITIVO</Text>
                </View>

                {loadingSeguranca ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#dc2626" />
                    <Text style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Carregando histórico de segurança...</Text>
                  </View>
                ) : acessosFalhos.length === 0 ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <Text style={{ color: '#059669', fontSize: 13, fontWeight: '700' }}>
                      ✅ Nenhuma tentativa de acesso falha registrada.
                    </Text>
                  </View>
                ) : (
                  acessosFalhos.map((af, idx) => {
                    const dataStr = af.data_tentativa
                      ? new Date(af.data_tentativa).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                      : 'N/A';
                    return (
                      <View
                        key={af.id || idx}
                        style={[
                          styles.versionTableRow,
                          idx % 2 === 1 && { backgroundColor: '#fff5f5' },
                        ]}
                      >
                        <View style={{ width: 160 }}>
                          <Text style={{ color: '#dc2626', fontWeight: '800', fontSize: 12 }}>
                            {af.username || 'Desconhecido'}
                          </Text>
                        </View>
                        <View style={{ width: 170 }}>
                          <Text style={{ color: '#475569', fontSize: 12, fontFamily: 'monospace' }}>
                            🌐 {af.ip || '127.0.0.1'}
                          </Text>
                        </View>
                        <View style={{ width: 170 }}>
                          <Text style={{ color: '#64748b', fontSize: 12 }}>
                            🕒 {dataStr}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }} numberOfLines={1}>
                            {af.user_agent || 'App / Browser'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            {/* 2. AUDITORIA DE LOGINS BEM-SUCEDIDOS */}
            <View style={[styles.cardContainer, { marginTop: 16 }]}>
              <View style={[styles.cardHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>🛡️</Text>
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: '#0f172a' }]}>
                      AUDITORIA DE LOGINS BEM-SUCEDIDOS
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Histórico de autenticações autorizadas no sistema
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.versionTableContainer, { marginTop: 14 }]}>
                <View style={styles.versionTableHeaderRow}>
                  <Text style={[styles.versionHeaderColText, { width: 180 }]}>USUÁRIO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 180 }]}>IP DE ACESSO</Text>
                  <Text style={[styles.versionHeaderColText, { flex: 1 }]}>DATA / HORA</Text>
                </View>

                {ultimosLogins.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>Nenhum login registrado.</Text>
                  </View>
                ) : (
                  ultimosLogins.map((lg, idx) => {
                    const dataStr = lg.data_login
                      ? new Date(lg.data_login).toLocaleString('pt-BR')
                      : 'N/A';
                    return (
                      <View
                        key={lg.id || idx}
                        style={[
                          styles.versionTableRow,
                          idx % 2 === 1 && { backgroundColor: '#f8fafc' },
                        ]}
                      >
                        <View style={{ width: 180 }}>
                          <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 12 }}>
                            {lg.username || `ID ${lg.usuario_id}`}
                          </Text>
                        </View>
                        <View style={{ width: 180 }}>
                          <Text style={{ color: '#475569', fontSize: 12, fontFamily: 'monospace' }}>
                            🌐 {lg.ip || '127.0.0.1'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#64748b', fontSize: 12 }}>
                            🕒 {dataStr}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </View>
        )}

        {/* ════════════════ ABA 6: CONTROLE DE VERSÕES ════════════════ */}
        {activeTab === 'version' && (
          <View style={styles.tabContent}>
            {/* Card com Container Branco e Cantos Arredondados */}
            <View style={styles.cardContainer}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: '#0f172a' }]}>
                    🏷️ CONTROLE DE VERSÕES DO SISTEMA
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    Registre e controle as atualizações do sistema manualmente. A versão cadastrada aqui é exibida no rodapé do gerador de relatórios.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.versionRefreshBtn}
                  onPress={carregarVersoes}
                  disabled={loadingVersoes}
                >
                  <Text style={styles.versionRefreshBtnText}>{loadingVersoes ? '⏳' : '🔄 Atualizar'}</Text>
                </TouchableOpacity>
              </View>

              {Boolean(msgSucessoVersao) && (
                <View style={styles.versionSuccessAlert}>
                  <Text style={styles.versionSuccessAlertText}>✓ {msgSucessoVersao}</Text>
                </View>
              )}

              {/* Formulário Novo Registro de Versão */}
              <View style={[styles.versionFormBox, !isDarkMode && styles.versionFormBoxLight]}>
                <View style={styles.versionFormGrid}>
                  <View style={styles.versionFieldSmall}>
                    <Text style={[styles.versionInputLabel, !isDarkMode && { color: '#475569' }]}>
                      VERSÃO (EX: V1.2.5) *
                    </Text>
                    <TextInput
                      style={[styles.versionInput, !isDarkMode && styles.versionInputLight, { fontWeight: '900' }]}
                      value={inputVersaoNumero}
                      onChangeText={setInputVersaoNumero}
                      placeholder="V1.2.5"
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="characters"
                    />
                  </View>

                  <View style={styles.versionFieldLarge}>
                    <Text style={[styles.versionInputLabel, !isDarkMode && { color: '#475569' }]}>
                      DESCRIÇÃO / NOTAS DE ATUALIZAÇÃO
                    </Text>
                    <TextInput
                      style={[styles.versionInput, !isDarkMode && styles.versionInputLight]}
                      value={inputVersaoDescricao}
                      onChangeText={setInputVersaoDescricao}
                      placeholder="Ex: Correções de layout e pequenos ajustes..."
                      placeholderTextColor="#94a3b8"
                    />
                  </View>

                  <View style={styles.versionFieldBtn}>
                    <TouchableOpacity
                      style={styles.btnSalvarVersao}
                      onPress={handleSalvarVersao}
                      disabled={salvandoVersao}
                      activeOpacity={0.85}
                    >
                      {salvandoVersao ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.btnSalvarVersaoText}>SALVAR VERSÃO</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Tabela / Lista de Versões Cadastradas */}
              <View style={styles.versionTableContainer}>
                <View style={[styles.versionTableHeaderRow, !isDarkMode && styles.versionTableHeaderRowLight]}>
                  <Text style={[styles.versionColData, styles.versionHeaderColText]}>DATA</Text>
                  <Text style={[styles.versionColVersao, styles.versionHeaderColText]}>VERSÃO</Text>
                  <Text style={[styles.versionColDesc, styles.versionHeaderColText]}>DESCRIÇÃO</Text>
                </View>

                {loadingVersoes ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#06b6d4" />
                    <Text style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Carregando versões...</Text>
                  </View>
                ) : versoesList.length === 0 ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>Nenhuma versão registrada no banco de dados.</Text>
                  </View>
                ) : (
                  versoesList.map((v, index) => {
                    const dataStr = v.data_criacao
                      ? new Date(v.data_criacao).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      : 'N/A';
                    return (
                      <View
                        key={v.id || index}
                        style={[
                          styles.versionTableRow,
                          !isDarkMode && styles.versionTableRowLight,
                          index % 2 === 1 && (!isDarkMode ? styles.versionRowOddLight : styles.versionRowOddDark),
                        ]}
                      >
                        <View style={styles.versionColData}>
                          <Text style={[styles.versionDataText, !isDarkMode && { color: '#64748b' }]}>
                            {dataStr}
                          </Text>
                        </View>
                        <View style={styles.versionColVersao}>
                          <View style={styles.versionBadge}>
                            <Text style={styles.versionBadgeText}>{v.versao}</Text>
                          </View>
                        </View>
                        <View style={styles.versionColDesc}>
                          <Text style={[styles.versionDescText, !isDarkMode && { color: '#334155' }]}>
                            {v.descricao || '-'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL DE DETALHES DO RELATÓRIO */}
      <Modal
        visible={!!selectedReport}
        transparent
        animationType="none"
        onRequestClose={() => setSelectedReport(null)}
      >
        <View
          // @ts-ignore
          dataSet={{ modalOverlay: 'true' }}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderWidth: 1 }]}>
            <View style={[styles.modalHeader, { borderBottomColor: '#f1f5f9' }]}>
              <View>
                <Text style={[styles.modalTitle, { color: '#0f172a' }]}>
                  RELATÓRIO #{selectedReport?.id}
                </Text>
                <Text style={[styles.modalSubtitle, { color: '#64748b' }]}>
                  {selectedReport?.empresa} • {selectedReport?.unidade}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedReport(null)}
              >
                <Text style={[styles.modalCloseBtnText, { color: '#64748b' }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedReport && (() => {
              const data = parseReportData(selectedReport) || {};
              const embList = data.embarcando || [];
              const desList = data.desembarcando || [];

              return (
                <ScrollView style={styles.detailScrollContent}>
                  {/* Dados Gerais do Atendimento */}
                  <View style={styles.detailSectionLight}>
                    <Text style={styles.detailSectionTitle}>DADOS GERAIS DO ATENDIMENTO</Text>
                    <View style={styles.detailGrid}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>EMPRESA</Text>
                        <Text style={styles.detailValue}>{selectedReport.empresa || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>UNIDADE</Text>
                        <Text style={styles.detailValue}>{selectedReport.unidade || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>LOCAL</Text>
                        <Text style={styles.detailValue}>{selectedReport.local_atendimento || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>PREPOSTO</Text>
                        <Text style={styles.detailValue}>{data.preposto || 'N/A'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Passageiros Embarcando */}
                  <View style={styles.detailSectionLight}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
                      <Text style={[styles.detailSectionTitle, { color: '#047857', fontWeight: '500' }]}>
                        EMBARCANDO ({embList.length})
                      </Text>
                    </View>
                    {embList.length === 0 ? (
                      <Text style={{ color: '#64748b', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>Nenhum passageiro embarcando.</Text>
                    ) : (
                      embList.map((p: any, idx: number) => (
                        <View key={idx} style={styles.passengerRowLight}>
                          <Text style={styles.passengerNameLight}>
                            {idx + 1}. {p.nome}
                          </Text>
                          <Text style={styles.passengerDocLight}>{p.funcao || p.doc || 'N/A'}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Passageiros Desembarcando */}
                  <View style={styles.detailSectionLight}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f43f5e' }} />
                      <Text style={[styles.detailSectionTitle, { color: '#be123c', fontWeight: '500' }]}>
                        DESEMBARCANDO ({desList.length})
                      </Text>
                    </View>
                    {desList.length === 0 ? (
                      <Text style={{ color: '#64748b', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>Nenhum passageiro desembarcando.</Text>
                    ) : (
                      desList.map((p: any, idx: number) => (
                        <View key={idx} style={styles.passengerRowLight}>
                          <Text style={styles.passengerNameLight}>
                            {idx + 1}. {p.nome}
                          </Text>
                          <Text style={styles.passengerDocLight}>{p.funcao || p.doc || 'N/A'}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Ações do Modal */}
                  <View style={styles.modalBottomActions}>
                    <TouchableOpacity
                      style={styles.modalDownloadPdfBtn}
                      onPress={() => handleBaixarRelatorio(selectedReport)}
                    >
                      <Text style={styles.modalDownloadPdfBtnText}>📥 BAIXAR PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalEditarBtn, { backgroundColor: '#4338ca' }]}
                      onPress={() => handleVisualizarRelatorio(selectedReport)}
                    >
                      <Text style={styles.modalEditarBtnText}>👁️ VISUALIZAR</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalEditarBtn}
                      onPress={() => handleEditarRelatorio(selectedReport)}
                    >
                      <Text style={styles.modalEditarBtnText}>✏️ EDITAR</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalWhatsAppBtn}
                      onPress={() => handleCompartilharRelatorio(selectedReport)}
                    >
                      <Text style={styles.modalWhatsAppBtnText}>📤 COMPARTILHAR</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* MODAL NOVO COMUNICADO */}
      <Modal
        visible={isNovoPopupModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setIsNovoPopupModalVisible(false)}
      >
        <View
          // @ts-ignore
          dataSet={{ modalOverlay: 'true' }}
          style={styles.modalOverlay}
        >
          <View style={[styles.novoPopupContent, !isDarkMode && { backgroundColor: '#ffffff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, !isDarkMode && { color: '#0f172a' }]}>NOVO COMUNICADO GLOBAL</Text>
              <TouchableOpacity onPress={() => setIsNovoPopupModalVisible(false)}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: 12, paddingVertical: 12 }}>
              <View>
                <Text style={styles.inputFieldLabel}>TÍTULO DO COMUNICADO</Text>
                <TextInput
                  style={[styles.modalTextInput, !isDarkMode && { color: '#0f172a', borderColor: '#cbd5e1', backgroundColor: '#f8fafc' }]}
                  placeholder="Ex: Manutenção Programada do Sistema"
                  placeholderTextColor="#64748b"
                  value={novoPopupTitulo}
                  onChangeText={setNovoPopupTitulo}
                />
              </View>

              <View>
                <Text style={styles.inputFieldLabel}>TIPO</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['aviso', 'urgente', 'feedback'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.popupTypeChoice,
                        novoPopupTipo === t && styles.popupTypeChoiceActive,
                      ]}
                      onPress={() => setNovoPopupTipo(t)}
                    >
                      <Text
                        style={[
                          styles.popupTypeChoiceText,
                          novoPopupTipo === t && styles.popupTypeChoiceTextActive,
                        ]}
                      >
                        {t.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.inputFieldLabel}>MENSAGEM</Text>
                <TextInput
                  style={[
                    styles.modalTextInput,
                    { height: 100, textAlignVertical: 'top' },
                    !isDarkMode && { color: '#0f172a', borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
                  ]}
                  multiline
                  placeholder="Digite a mensagem completa a ser exibida..."
                  placeholderTextColor="#64748b"
                  value={novoPopupMensagem}
                  onChangeText={setNovoPopupMensagem}
                />
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsNovoPopupModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>CANCELAR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.publishBtn}
                onPress={handleSalvarNovoPopup}
                disabled={salvandoPopup}
              >
                {salvandoPopup ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.publishBtnText}>PUBLICAR AGORA</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DIÁLOGO CUSTOMIZADO */}
      <Modal
        visible={customDialog.visible}
        transparent
        animationType="none"
        onRequestClose={() => setCustomDialog((prev) => ({ ...prev, visible: false }))}
      >
        <View
          // @ts-ignore
          dataSet={{ modalOverlay: 'true' }}
          style={styles.modalOverlay}
        >
          <View style={[styles.dialogContent, !isDarkMode && { backgroundColor: '#ffffff' }]}>
            <Text style={[styles.dialogTitle, !isDarkMode && { color: '#0f172a' }]}>{customDialog.title}</Text>
            <Text style={[styles.dialogMessage, !isDarkMode && { color: '#475569' }]}>{customDialog.message}</Text>

            <View style={styles.dialogActionRow}>
              {customDialog.onConfirm && (
                <TouchableOpacity
                  style={styles.dialogCancelBtn}
                  onPress={() => setCustomDialog((prev) => ({ ...prev, visible: false }))}
                >
                  <Text style={styles.dialogCancelBtnText}>CANCELAR</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.dialogConfirmBtn,
                  customDialog.isDanger && { backgroundColor: '#e11d48' },
                ]}
                onPress={() => {
                  if (customDialog.onConfirm) {
                    customDialog.onConfirm();
                  } else {
                    setCustomDialog((prev) => ({ ...prev, visible: false }));
                  }
                }}
              >
                <Text style={styles.dialogConfirmBtnText}>{customDialog.confirmText || 'OK'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  navbar: {
    height: 64,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    position: (Platform.OS === 'web' ? 'sticky' : 'relative') as any,
    top: 0,
    zIndex: 1000,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coordBadgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: corporateFont,
    letterSpacing: 0.5,
  },
  navSubtitle: {
    fontSize: 10,
    color: '#f59e0b',
    fontWeight: '700',
    letterSpacing: 1,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  backButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },

  /* ─── RESUMO MENSAL / VISÃO GERAL ─── */
  overviewSummaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },

  // KPIs
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  kpiCardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  kpiIcon: {
    fontSize: 14,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    marginVertical: 4,
  },
  kpiFootnote: {
    fontSize: 10,
    color: '#64748b',
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 6,
    gap: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0284c7',
  },
  tabButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },

  tabContent: {
    width: '100%',
  },

  // Filtros
  filterCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    paddingVertical: 8,
  },
  companyFilterScroll: {
    flexDirection: 'row',
  },
  companyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 6,
  },
  companyPillActive: {
    backgroundColor: '#06b6d4',
    borderColor: '#06b6d4',
  },
  companyPillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  companyPillTextActive: {
    color: '#ffffff',
  },
  dateFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  dateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
  },
  dateInput: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    width: 120,
  },
  filterApplyBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  filterApplyBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  filterClearBtn: {
    backgroundColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  filterClearBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Relatórios
  reportsGrid: {
    gap: 12,
  },
  reportCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  reportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportIdBadge: {
    color: '#06b6d4',
    fontSize: 12,
    fontWeight: '900',
  },
  reportDateText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  reportCardBody: {
    gap: 4,
  },
  reportUnidadeText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  reportLocalText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  reportPrepostoText: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  reportCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtnView: {
    backgroundColor: '#0284c7',
  },
  actionBtnViewText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  actionBtnPdf: {
    backgroundColor: '#059669',
  },
  actionBtnPdfText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  actionBtnWhats: {
    backgroundColor: '#10b981',
  },
  actionBtnWhatsText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  actionBtnDelete: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 10,
  },
  actionBtnDeleteText: {
    color: '#ffffff',
    fontSize: 11,
  },

  // Badges
  badgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Seções & Cards
  cardContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontFamily: modernFont,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: modernFont,
  },

  // Ranking
  rankingList: {
    gap: 10,
  },
  rankingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  rankingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankingMedal: {
    fontSize: 20,
    width: 30,
    textAlign: 'center',
  },
  rankingNome: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  rankingEmpresa: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
  },
  rankingItemRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rankingBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rankingTotalText: {
    color: '#06b6d4',
    fontSize: 12,
    fontWeight: '900',
  },
  rankingPercentText: {
    color: '#64748b',
    fontSize: 10,
  },

  // Usuários
  userList: {
    gap: 10,
  },
  userCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  userCardInfo: {
    gap: 4,
  },
  userNameText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  userMetaText: {
    color: '#64748b',
    fontSize: 11,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeCoord: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  roleBadgeBasic: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  userCardActions: {
    flexDirection: 'row',
  },
  toggleRoleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnPromote: {
    backgroundColor: '#059669',
  },
  btnDemote: {
    backgroundColor: '#d97706',
  },
  toggleRoleBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Popups / Comunicados
  newNotificationBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  newNotificationBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  popupsList: {
    gap: 10,
  },
  popupCard: {
    backgroundColor: '#0f172a',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  popupCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  popupTitleText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  popupTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeUrgente: {
    backgroundColor: '#e11d48',
  },
  badgeAviso: {
    backgroundColor: '#0284c7',
  },
  popupTypeBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  statusTogglePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusInactive: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  statusTogglePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10b981',
  },
  popupMessageText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  popupCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  popupDateText: {
    color: '#64748b',
    fontSize: 10,
  },
  deletePopupBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deletePopupBtnText: {
    color: '#e11d48',
    fontSize: 11,
    fontWeight: '700',
  },

  // Sistema & Status
  sysStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sysStatusCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  sysStatusLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
  },
  sysStatusOnline: {
    fontSize: 12,
    fontWeight: '900',
    color: '#10b981',
  },
  sysStatusVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
  sysStatusInfo: {
    fontSize: 11,
    color: '#94a3b8',
  },

  // Modais
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    ...(Platform.OS === 'web'
      ? {
        animationDuration: '0.45s',
        animationName: 'mmsNaturalBlurIn',
        animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        animationFillMode: 'forwards',
        backgroundColor: 'transparent',
      }
      : {
        backgroundColor: 'transparent',
      }),
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: corporateFont,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseBtnText: {
    color: '#94a3b8',
    fontSize: 18,
  },
  detailScrollContent: {
    gap: 16,
  },
  detailSection: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  detailSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#06b6d4',
    letterSpacing: 0.8,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailItem: {
    flex: 1,
    minWidth: 120,
  },
  detailLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  passengerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  passengerName: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  passengerDoc: {
    fontSize: 11,
    color: '#64748b',
  },
  modalBottomActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalDownloadPdfBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDownloadPdfBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  modalWhatsAppBtn: {
    flex: 1,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWhatsAppBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  modalEditarBtn: {
    flex: 1,
    backgroundColor: '#d97706',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEditarBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  detailSectionLight: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  passengerRowLight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  passengerNameLight: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: modernFont,
  },
  passengerDocLight: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    fontFamily: modernFont,
  },

  // Modal Novo Popup
  novoPopupContent: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  modalTextInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#ffffff',
    padding: 10,
    fontSize: 13,
  },
  popupTypeChoice: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  popupTypeChoiceActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  popupTypeChoiceText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '800',
  },
  popupTypeChoiceTextActive: {
    color: '#ffffff',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#475569',
  },
  cancelBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  publishBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#0284c7',
  },
  publishBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Diálogo Customizado
  dialogContent: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 20,
    maxWidth: 420,
    width: '100%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
    fontFamily: corporateFont,
  },
  dialogMessage: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 19,
    marginBottom: 16,
  },
  dialogActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  dialogCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#475569',
  },
  dialogCancelBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  dialogConfirmBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  dialogConfirmBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Acesso Restrito
  restrictedContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },
  restrictedCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 480,
    width: '90%',
    borderWidth: 1,
    borderColor: '#f59e0b',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  restrictedCardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    shadowColor: '#64748b',
    shadowOpacity: 0.15,
  },
  restrictedIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  restrictedTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 10,
    letterSpacing: 1,
    textAlign: 'center',
    fontFamily: modernFont,
  },
  restrictedSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    fontFamily: modernFont,
  },
  restrictedBtnRow: {
    width: '100%',
    alignItems: 'center',
  },
  restrictedLoginBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  restrictedBackBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  restrictedBackBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  restrictedLogoutBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  restrictedLogoutBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  userCoordTag: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  userCoordTagText: {
    color: '#b45309',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: modernFont,
  },

  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#94a3b8',
    fontSize: 12,
  },
  emptyBox: {
    backgroundColor: '#1e293b',
    padding: 36,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },

  /* Estilos de Personalização do Rodapé (Footer) */
  footerPreviewCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 16,
    marginVertical: 14,
  },
  footerPreviewLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 1.5,
    marginBottom: 10,
    fontFamily: modernFont,
  },
  footerPreviewBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  footerPreviewText: {
    flex: 1,
    minWidth: 240,
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  footerPreviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  footerPreviewBadgeIcon: {
    fontSize: 11,
    color: '#94a3b8',
  },
  footerPreviewBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  footerFormGrid: {
    gap: 14,
    marginVertical: 10,
  },
  footerFormField: {
    gap: 6,
  },
  footerInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  footerInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
    fontFamily: modernFont,
  },
  footerInputLight: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    color: '#0f172a',
  },
  footerControlRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  footerMiniLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 4,
    fontFamily: modernFont,
  },
  footerMiniInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    fontFamily: modernFont,
  },
  btnToggleBold: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnToggleBoldActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  btnToggleBoldInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: '#475569',
  },
  btnToggleBoldText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    fontFamily: modernFont,
  },
  btnToggleBoldTextActive: {
    color: '#2563eb',
    fontWeight: '900',
  },
  btnSalvarFooter: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnSalvarFooterText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.8,
    fontFamily: modernFont,
  },

  /* Botão Bloquear no Navbar */
  lockPanelBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  lockPanelBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: modernFont,
  },

  /* Tela de Bloqueio por Senha (100% Tema Claro) */
  coordLockCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  coordLockIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  coordLockTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
    fontFamily: modernFont,
  },
  coordLockSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
    fontFamily: modernFont,
  },
  coordLockErrorBox: {
    width: '100%',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  coordLockErrorText: {
    color: '#be123c',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: modernFont,
  },
  coordLockInputGroup: {
    width: '100%',
    marginBottom: 20,
  },
  coordLockInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1,
    marginBottom: 8,
    fontFamily: modernFont,
  },
  coordLockInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#0f172a',
    fontSize: 14,
    fontFamily: modernFont,
  },
  coordLockInputLight: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    color: '#0f172a',
  },
  coordLockInputDisabled: {
    backgroundColor: '#e2e8f0',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    color: '#64748b',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontWeight: '600',
    fontSize: 14,
    fontFamily: modernFont,
    ...(Platform.OS === 'web' ? { cursor: 'not-allowed' } : {}),
  },
  coordLockInputDisabledLight: {
    backgroundColor: '#e2e8f0',
    borderColor: '#e2e8f0',
    color: '#64748b',
  },
  btnDesbloquearPainel: {
    width: '100%',
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDesbloquearPainelText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  btnVoltarGeradorLock: {
    marginTop: 18,
    paddingVertical: 6,
  },
  btnVoltarGeradorLockText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
    fontFamily: modernFont,
  },

  /* Seletor Dropdown de Empresa (Estilo EMPRESA / GRUPO) */
  companySelectWrapper: {
    width: '100%',
    marginTop: 8,
  },
  companySelectLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 6,
    fontFamily: modernFont,
  },
  coordSelectBoxContainer: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  coordSelectBoxContainerLight: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
  },
  coordSelectBoxText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: modernFont,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  coordSelectBoxChevron: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94a3b8',
  },
  coordDropdownOptionsList: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  coordDropdownOptionsListLight: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  coordDropdownOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  coordDropdownOptionItemLight: {
    borderBottomColor: '#f1f5f9',
  },
  coordDropdownOptionItemActive: {
    backgroundColor: '#eff6ff',
  },
  coordDropdownOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: modernFont,
  },
  coordDropdownOptionTextActive: {
    color: '#2563eb',
    fontWeight: '900',
  },
  coordDropdownOptionCheck: {
    fontSize: 14,
    fontWeight: '900',
    color: '#2563eb',
  },
  versionRefreshBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  versionRefreshBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: modernFont,
  },
  versionSuccessAlert: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  versionSuccessAlertText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: modernFont,
  },
  versionFormBox: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  versionFormBoxLight: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  versionFormGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-end',
  },
  versionFieldSmall: {
    flex: 1,
    minWidth: 140,
  },
  versionFieldLarge: {
    flex: 2,
    minWidth: 220,
  },
  versionFieldBtn: {
    minWidth: 160,
  },
  versionInputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    fontFamily: modernFont,
  },
  versionInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    fontFamily: modernFont,
  },
  versionInputLight: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    color: '#0f172a',
  },
  btnSalvarVersao: {
    backgroundColor: '#2563eb',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  btnSalvarVersaoText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  versionTableContainer: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  versionTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  versionTableHeaderRowLight: {
    backgroundColor: '#f8fafc',
    borderBottomColor: '#e2e8f0',
  },
  versionHeaderColText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  versionTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  versionTableRowLight: {
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  versionRowOddDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
  },
  versionRowOddLight: {
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
  },
  versionColData: {
    width: 140,
  },
  versionDataText: {
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: modernFont,
  },
  versionColVersao: {
    width: 110,
  },
  versionBadge: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: '#3b82f6',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  versionBadgeText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: modernFont,
  },
  versionColDesc: {
    flex: 1,
  },
  versionDescText: {
    fontSize: 12,
    color: '#334155',
    fontFamily: modernFont,
  },

  /* ─── CONTAINER GERAL E LAYOUT (TEMA COORDENAÇÃO PHP) ─── */
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    width: '100%',
    maxWidth: 1600,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 64,
  },

  /* ─── NAVBAR SUPERIOR DE COORDENAÇÃO (TEMA ESCURO IGUAL INDEX.TSX - FIXO / STICKY NO TOPO) ─── */
  coordNavbar: {
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    width: '100%',
    position: (Platform.OS === 'web' ? 'sticky' : 'relative') as any,
    top: 0,
    zIndex: 1000,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  coordNavbarInner: {
    maxWidth: 1600,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 14,
  },
  coordNavLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  coordNavLogoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 3,
  },
  coordNavLogoRay: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  coordNavLogoText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  coordNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    flexWrap: 'nowrap',
    flexShrink: 1,
  },
  coordNavDateTimeGroup: {
    alignItems: 'flex-end',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.14)',
    paddingRight: 16,
  },
  coordNavDateTimeText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: modernFont,
  },
  coordNavIpText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    fontFamily: modernFont,
  },
  coordNavUserGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'nowrap',
  },
  coordNavUserGreeting: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: modernFont,
  },
  coordNavUserName: {
    color: '#ffffff',
    fontWeight: '800',
  },
  coordNavButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coordNavNotificationBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coordNavVoltarBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  coordNavVoltarBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  coordNavSairBtn: {
    backgroundColor: '#e11d48',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  coordNavSairBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },

  /* ─── CARD SUPERIOR VISÃO GERAL (IGUAL COORD/INDEX.PHP) ─── */
  overviewSummaryCardLight: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  overviewSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  overviewSummaryIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  overviewSummaryTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#1e293b',
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  overviewSummarySubtitle: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
    fontFamily: modernFont,
  },
  overviewSummaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  overviewMonthSelectorLight: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overviewMonthText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    fontFamily: modernFont,
  },
  overviewBtnFiltrar: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  overviewBtnFiltrarText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },

  /* ─── 4 CARDS DE KPIS / MÉTRICAS ─── */
  kpiCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  kpiMetricCard: {
    flex: 1,
    minWidth: 220,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  kpiMetricCardTotal: {
    borderTopWidth: 4,
    borderTopColor: '#2563eb',
  },
  kpiMetricCardMes: {
    borderTopWidth: 4,
    borderTopColor: '#06b6d4',
  },
  kpiMetricCardHoje: {
    borderTopWidth: 4,
    borderTopColor: '#f97316',
  },
  kpiMetricCardUsuarios: {
    borderTopWidth: 4,
    borderTopColor: '#8b5cf6',
  },
  kpiMetricTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiMetricLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  kpiMetricValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0f172a',
    marginVertical: 4,
    fontFamily: modernFont,
  },
  kpiMetricFootnote: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    fontFamily: modernFont,
  },

  /* ─── BARRA DE ABAS DE NAVEGAÇÃO ─── */
  tabsBarRow: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    borderRadius: 14,
    padding: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  tabNavButton: {
    flex: 1,
    minWidth: 110,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  tabNavButtonActive: {
    backgroundColor: '#1e293b',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  tabNavButtonInactive: {
    backgroundColor: 'transparent',
  },
  tabNavButtonText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  tabNavButtonTextActive: {
    color: '#ffffff',
  },
  tabNavButtonTextInactive: {
    color: '#64748b',
  },

  /* ─── CARD UNIFICADO DE RELATÓRIOS (FILTROS + LISTAGEM + PAGINAÇÃO) ─── */
  unifiedReportsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  reportsFilterSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  reportsFilterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportsFilterHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#0f172a',
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  reportsFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  reportsFilterFieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
  },
  reportsFilterFieldLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  reportsFilterInput: {
    fontSize: 12,
    color: '#0f172a',
    padding: 0,
    width: 90,
    fontFamily: modernFont,
  },
  reportsFilterInputNoBorder: {
    fontSize: 12,
    color: '#0f172a',
    padding: 0,
    flex: 1,
    fontFamily: modernFont,
  },
  reportsDropdownBtn: {
    justifyContent: 'space-between',
    minWidth: 140,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  reportsDropdownBtnText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '800',
    fontFamily: modernFont,
  },
  reportsDropdownChevron: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    marginLeft: 6,
  },
  btnReportsFiltrar: {
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnReportsFiltrarText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  btnReportsLimpar: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnReportsLimparText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },

  /* ─── TABELA DE RELATÓRIOS (CABECALHO E LINHAS) ─── */
  reportsListHeaderRow: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportsListHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  reportsListContainer: {
    backgroundColor: '#ffffff',
  },
  reportsItemCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  reportsItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  reportsItemUnidade: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2563eb',
    textTransform: 'uppercase',
    fontFamily: modernFont,
    flex: 1,
    marginRight: 8,
  },
  reportsEmpresaBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reportsEmpresaBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  reportsItemSub: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
    fontFamily: modernFont,
  },
  reportsItemTimeRow: {
    marginBottom: 10,
  },
  reportsItemTimeText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    fontFamily: modernFont,
  },
  reportsActionPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionPillDownload: {
    backgroundColor: '#eff6ff',
    borderColor: '#dbeafe',
  },
  actionPillDownloadText: {
    color: '#1d4ed8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  actionPillVisualizar: {
    backgroundColor: '#eef2ff',
    borderColor: '#e0e7ff',
  },
  actionPillVisualizarText: {
    color: '#4338ca',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  actionPillEditar: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
  },
  actionPillEditarText: {
    color: '#b45309',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  actionPillCompartilhar: {
    backgroundColor: '#ecfdf5',
    borderColor: '#d1fae5',
  },
  actionPillCompartilharText: {
    color: '#047857',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  actionPillExcluir: {
    backgroundColor: '#fff1f2',
    borderColor: '#ffe4e6',
  },
  actionPillExcluirText: {
    color: '#be123c',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },

  /* ─── PAGINAÇÃO ─── */
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 12,
  },
  pageBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  pageIndicatorText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },

  /* ─── ABA RANKING (IGUAL COORD/INDEX.PHP) ─── */
  rankingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  rankingHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#fef3c7',
    backgroundColor: '#fffbeb',
  },
  rankingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankingIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  rankingTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#92400e',
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  rankingSubtitle: {
    fontSize: 10,
    color: '#d97706',
    fontWeight: '600',
    marginTop: 1,
    fontFamily: modernFont,
  },
  rankingTableHeaderRow: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankingColPos: {
    width: '15%',
    alignItems: 'center',
  },
  rankingColUser: {
    width: '65%',
  },
  rankingColTotal: {
    width: '20%',
    alignItems: 'center',
  },
  rankingTableHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  rankingTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rankingPosBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingPosBadge1: {
    backgroundColor: '#fef9c3',
  },
  rankingPosBadge2: {
    backgroundColor: '#e2e8f0',
  },
  rankingPosBadge3: {
    backgroundColor: '#ffedd5',
  },
  rankingPosBadgeText1: {
    color: '#a16207',
    fontSize: 10,
    fontWeight: '900',
  },
  rankingPosBadgeText2: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '900',
  },
  rankingPosBadgeText3: {
    color: '#c2410c',
    fontSize: 10,
    fontWeight: '900',
  },
  rankingPosNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    fontFamily: modernFont,
  },
  rankingUserName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    fontFamily: modernFont,
  },
  rankingTotalBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rankingTotalBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2563eb',
    fontFamily: modernFont,
  },

});

