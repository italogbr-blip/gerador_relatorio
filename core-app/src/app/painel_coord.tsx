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
import {
  verifyCoordinatorAccess,
  logoutUserSession,
  saveSessionLocal,
  getSavedSessionSync,
  AppUserSession,
  unlockCoordinatorPanel,
  escapeOrValue,
  getExigirAprovacaoCadastro,
  setExigirAprovacaoCadastro,
  aprovarUsuario,
  recusarUsuario,
  carregarHistoricoAprovacoes,
} from '../lib/auth';
import {
  fetchFooterConfig,
  saveFooterConfig,
  FooterConfig,
  defaultFooterConfig,
  fetchAllAppVersions,
  insertAppVersion,
  deleteAppVersion,
  cleanDatabaseFooterConfigVersion,
  AppVersionRecord,
} from '../lib/footerConfig';
import {
  registerDeviceAccess,
  collectDeviceTelemetry,
  getLocalDeviceAccessLogs,
  DeviceTelemetryInfo,
} from '../lib/deviceTelemetry';

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
  const [acessosGerador, setAcessosGerador] = useState<any[]>([]);
  const [ultimosLogins, setUltimosLogins] = useState<any[]>([]);
  const [ipsBloqueados, setIpsBloqueados] = useState<any[]>([]);
  const [inputIpManual, setInputIpManual] = useState<string>('');
  const [salvandoBloqueioIp, setSalvandoBloqueioIp] = useState<boolean>(false);

  const blockedIpsSet = useMemo(() => {
    return new Set(ipsBloqueados.map((item) => String(item.ip || '').trim()));
  }, [ipsBloqueados]);
  const [loadingSeguranca, setLoadingSeguranca] = useState<boolean>(false);
  const [alertaSegurancaExpandido, setAlertaSegurancaExpandido] = useState<boolean>(true);
  const [ultimoCheckSeguranca, setUltimoCheckSeguranca] = useState<string>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem('mms_coord_seguranca_vista') || '';
    }
    return '';
  });

  const acessosFalhosNaoVistosCount = useMemo(() => {
    if (!acessosFalhos || acessosFalhos.length === 0) return 0;
    if (!ultimoCheckSeguranca) return acessosFalhos.length;
    const checkTime = new Date(ultimoCheckSeguranca).getTime();
    const novos = acessosFalhos.filter((af) => {
      const afTime = new Date(af.data_tentativa).getTime();
      return isNaN(checkTime) || afTime > checkTime;
    });
    return novos.length;
  }, [acessosFalhos, ultimoCheckSeguranca]);

  const handleIrParaSeguranca = () => {
    setActiveTab('seguranca');
    setAlertaSegurancaExpandido(false);
    const agora = new Date().toISOString();
    setUltimoCheckSeguranca(agora);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('mms_coord_seguranca_vista', agora);
      } catch (e) {}
    }
    carregarSeguranca();
  };

  // Estados de Dados & Métricas com Cache Instantâneo
  const [relatorios, setRelatorios] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [popups, setPopups] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Estados de Autorização / Aprovação de Novos Cadastros
  const [exigirAprovacaoCadastro, setExigirAprovacaoCadastroState] = useState<boolean>(false);
  const [salvandoExigirAprovacao, setSalvandoExigirAprovacao] = useState<boolean>(false);
  const [historicoAprovacoes, setHistoricoAprovacoes] = useState<any[]>([]);
  const [loadingHistoricoAprovacoes, setLoadingHistoricoAprovacoes] = useState<boolean>(false);

  const usuariosPendentes = useMemo(() => {
    return usuarios.filter((u) => u.status_aprovacao === 'pendente');
  }, [usuarios]);

  // Inicialização inteligente com cache local (0ms no carregamento inicial)
  const [loadingMetricas, setLoadingMetricas] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem('mms_coord_kpi_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          const mesAtualKey = new Date().toISOString().substring(0, 7);
          if (parsed && parsed.mesKey === mesAtualKey && typeof parsed.mes === 'number') {
            return false;
          }
        }
      } catch (e) {}
    }
    return true;
  });

  const [totalRelatoriosGeral, setTotalRelatoriosGeral] = useState<number>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem('mms_coord_kpi_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (typeof parsed?.total === 'number') return parsed.total;
        }
      } catch (e) {}
    }
    return 0;
  });

  const [relatoriosHojeCount, setRelatoriosHojeCount] = useState<number>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem('mms_coord_kpi_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          const hojeStr = new Date().toISOString().substring(0, 10);
          if (parsed?.hojeKey === hojeStr && typeof parsed?.hoje === 'number') return parsed.hoje;
        }
      } catch (e) {}
    }
    return 0;
  });

  const [relatoriosMesCount, setRelatoriosMesCount] = useState<number>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem('mms_coord_kpi_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          const mesAtualKey = new Date().toISOString().substring(0, 7);
          if (parsed?.mesKey === mesAtualKey && typeof parsed?.mes === 'number') return parsed.mes;
        }
      } catch (e) {}
    }
    return 0;
  });

  // Filtros de Relatórios
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('TODAS');
  const [filtroBusca, setFiltroBusca] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');
  const [paginaRelatorios, setPaginaRelatorios] = useState<number>(1);
  const porPagina = 15;

  // Sub-abas e Paginação de Rankings
  const [subTabRanking, setSubTabRanking] = useState<'prepostos' | 'empresas'>('prepostos');
  const [paginaRankingPrepostos, setPaginaRankingPrepostos] = useState<number>(1);
  const [paginaRankingEmpresas, setPaginaRankingEmpresas] = useState<number>(1);
  const porPaginaRanking = 10;

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

  // Filtro de Mês e Ano Interativo da Visão Geral
  const [mesFiltro, setMesFiltro] = useState<number>(() => new Date().getMonth());
  const [anoFiltro, setAnoFiltro] = useState<number>(() => new Date().getFullYear());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState<boolean>(false);
  const [filtrandoMesAno, setFiltrandoMesAno] = useState<boolean>(false);

  const MESES_NOMES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];

  const MESES_ABREV = [
    'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
    'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'
  ];

  const nomeMesAtual = useMemo(() => {
    return `${MESES_NOMES[mesFiltro]} de ${anoFiltro}`;
  }, [mesFiltro, anoFiltro]);

  const mesAnoCurto = useMemo(() => {
    const m = String(mesFiltro + 1).padStart(2, '0');
    return `em ${m}/${anoFiltro}`;
  }, [mesFiltro, anoFiltro]);

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
    cleanDatabaseFooterConfigVersion();
  }, []);

  const handleSalvarFooter = async () => {
    setSalvandoFooter(true);
    const success = await saveFooterConfig(footerDraft);
    await cleanDatabaseFooterConfigVersion();
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
        return syncSession.user.user_metadata?.name || syncSession.user.user_metadata?.username || syncSession.user.email?.split('@')[0] || 'Ítalo Gabriel';
      }
    } catch (e) {}
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('mms_last_coord_user');
      if (saved) return saved;
    }
    return 'Ítalo Gabriel';
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

        // Grava login bem-sucedido na auditoria de segurança (localStorage + Supabase + Telemetria Completa)
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

        // Telemetria detalhada de hardware / telefone
        registerDeviceAccess('painel_coord', {
          tipo: 'login_sucesso',
          usuario: loginObj.username,
          userId: loginObj.usuario_id,
          ip: userIp || '127.0.0.1',
        }).catch(() => {});

        carregarDadosIniciais();
      } else {
        // Grava tentativa falha em coord_acessos_falhos (com redundância local imediata e telemetria de aparelho)
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

        registerDeviceAccess('painel_coord', {
          tipo: 'login_falho',
          usuario: usuarioDigitado || 'desconhecido',
          ip: userIp || '127.0.0.1',
        }).catch(() => {});

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
        carregarConfiguracaoAprovacao(),
        carregarHistoricoAprovacoesState(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const carregarConfiguracaoAprovacao = async () => {
    try {
      const exigindo = await getExigirAprovacaoCadastro();
      setExigirAprovacaoCadastroState(exigindo);
    } catch (_) {}
  };

  const carregarHistoricoAprovacoesState = async () => {
    setLoadingHistoricoAprovacoes(true);
    try {
      const hist = await carregarHistoricoAprovacoes();
      setHistoricoAprovacoes(hist);
    } finally {
      setLoadingHistoricoAprovacoes(false);
    }
  };

  const carregarSeguranca = async () => {
    setLoadingSeguranca(true);
    try {
      let falhosDb: any[] = [];
      let loginsDb: any[] = [];
      let bloqueadosDb: any[] = [];

      try {
        const [resFalhos, resLogins, resBloqueados] = await Promise.all([
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
          supabase
            .from('ips_bloqueados')
            .select('*')
            .order('data_bloqueio', { ascending: false }),
        ]);

        if (!resFalhos.error && resFalhos.data) {
          falhosDb = resFalhos.data;
        }
        if (!resLogins.error && resLogins.data) {
          loginsDb = resLogins.data;
        }
        if (!resBloqueados.error && resBloqueados.data) {
          bloqueadosDb = resBloqueados.data;
        }
      } catch (errDb) {
        console.warn('Erro ao consultar segurança do banco:', errDb);
      }

      setIpsBloqueados(bloqueadosDb);

      // 3. Mapeamento Inteligente: Busca prepostos em relatórios gerados para identificar o usuário mesmo deslogado
      const mapaPrepostosPorIp = new Map<string, string>();
      try {
        const { data: relsPrepostos } = await supabase
          .from('relatorios')
          .select('ip_origem, dados_json')
          .order('id', { ascending: false })
          .limit(300);

        if (relsPrepostos) {
          relsPrepostos.forEach((r: any) => {
            if (r.ip_origem) {
              const parsed = parseReportData(r);
              const prep = getPrepostoFromReport(r, parsed);
              if (prep && !mapaPrepostosPorIp.has(r.ip_origem)) {
                mapaPrepostosPorIp.set(r.ip_origem, prep);
              }
            }
          });
        }
      } catch (errRelPrep) {}

      // Lê histórico salvo em localStorage para garantir exibição imediata
      let falhosLocais: any[] = [];
      let loginsLocais: any[] = [];
      let telemetriaLocal: any[] = [];
      if (typeof localStorage !== 'undefined') {
        try {
          const rawF = localStorage.getItem('mms_coord_acessos_falhos');
          if (rawF) falhosLocais = JSON.parse(rawF);
          const rawL = localStorage.getItem('mms_registro_logins');
          if (rawL) loginsLocais = JSON.parse(rawL);
        } catch (e) {}
      }

      try {
        telemetriaLocal = getLocalDeviceAccessLogs();
      } catch (e) {}

      // Listas finais para renderização
      const listFalhos: any[] = [];
      const listAcessosGerador: any[] = [];

      // Processa e extrai a telemetria gravada no campo user_agent
      const extrairTelemetriaItem = (item: any) => {
        let meta: any = null;
        if (typeof item.user_agent === 'string' && item.user_agent.trim().startsWith('{')) {
          try {
            meta = JSON.parse(item.user_agent);
          } catch (e) {}
        }

        const dataRegistro = item.data_tentativa || item.data_login || item.timestamp || new Date().toISOString();
        const prepostoRelatorio = item.ip ? mapaPrepostosPorIp.get(item.ip) : null;
        
        let nomeUsuario = meta?.usuario || item.username;
        let isPrepostoDetectado = false;
        if (!nomeUsuario || nomeUsuario === 'Visitante Gerador' || nomeUsuario === 'VISITANTE_INDEX' || nomeUsuario === 'Desconhecido') {
          if (prepostoRelatorio) {
            nomeUsuario = prepostoRelatorio;
            isPrepostoDetectado = true;
          } else {
            nomeUsuario = 'Visitante Gerador';
          }
        }

        const enriched = {
          ...item,
          username: nomeUsuario,
          isPrepostoDetectado,
          deviceId: (meta?.deviceId || item.deviceId || 'DEV-' + (item.ip || '0').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()).replace(/^MMS-/i, ''),
          model: meta?.model || item.model || 'Aparelho Web',
          os: meta?.os || item.os || 'Sistema',
          browser: meta?.browser || item.browser || 'Navegador Web',
          screen: meta?.screen || item.screen || '',
          tipo: meta?.tipo || item.tipo || (item.username?.includes('VISITANTE') ? 'acesso_gerador' : 'login_falho'),
          data_tentativa: dataRegistro,
          data_login: dataRegistro,
        };

        if (enriched.tipo === 'acesso_gerador' || item.username === 'VISITANTE_INDEX' || String(item.username).startsWith('ACESSO_')) {
          listAcessosGerador.push(enriched);
        } else {
          listFalhos.push(enriched);
        }
      };

      falhosLocais.forEach(extrairTelemetriaItem);
      falhosDb.forEach(extrairTelemetriaItem);

      // Adiciona itens de telemetria locais que foram registrados neste aparelho
      telemetriaLocal.forEach((t) => {
        const prepostoRelatorio = t.ip ? mapaPrepostosPorIp.get(t.ip) : null;
        let nomeUsuario = t.usuario;
        let isPrepostoDetectado = false;
        if (!nomeUsuario || nomeUsuario === 'Visitante Gerador' || nomeUsuario.includes('Visitante')) {
          if (prepostoRelatorio) {
            nomeUsuario = prepostoRelatorio;
            isPrepostoDetectado = true;
          }
        }

        const enriched = {
          id: t.id,
          username: nomeUsuario || 'Visitante Gerador',
          isPrepostoDetectado,
          ip: t.ip || '127.0.0.1',
          data_tentativa: t.timestamp,
          data_login: t.timestamp,
          deviceId: (t.deviceId ? String(t.deviceId) : 'DEV-LOCAL').replace(/^MMS-/i, ''),
          model: t.deviceModel,
          os: t.os,
          browser: t.browser,
          screen: t.screenResolution,
          tipo: t.tipo || (t.origem === 'gerador_relatorio' ? 'acesso_gerador' : 'login_sucesso'),
        };

        if (enriched.tipo === 'acesso_gerador') {
          listAcessosGerador.push(enriched);
        } else if (enriched.tipo === 'login_falho') {
          listFalhos.push(enriched);
        }
      });

      // Mescla e desduplica acessos falhos por username, data e IP
      const mapFalhos = new Map<string, any>();
      listFalhos.forEach((f) => {
        const key = `${f.username}_${f.data_tentativa}_${f.ip}`;
        mapFalhos.set(key, f);
      });
      const mergedFalhos = Array.from(mapFalhos.values()).sort(
        (a, b) => new Date(b.data_tentativa).getTime() - new Date(a.data_tentativa).getTime()
      );
      setAcessosFalhos(mergedFalhos);

      // Mescla e desduplica acessos ao gerador de relatórios (Index)
      const mapAcessos = new Map<string, any>();
      listAcessosGerador.forEach((a) => {
        const key = `${a.deviceId}_${a.data_tentativa}_${a.ip}`;
        mapAcessos.set(key, a);
      });
      const mergedAcessos = Array.from(mapAcessos.values()).sort(
        (a, b) => new Date(b.data_tentativa).getTime() - new Date(a.data_tentativa).getTime()
      );
      setAcessosGerador(mergedAcessos);

      // Mescla e enriquece logins bem-sucedidos com o ID do Aparelho
      const mapLogins = new Map<string, any>();
      loginsLocais.forEach((l) => {
        const key = `${l.usuario_id || l.username}_${l.data_login}_${l.ip}`;
        mapLogins.set(key, l);
      });
      loginsDb.forEach((l) => {
        const key = `${l.usuario_id}_${l.data_login}_${l.ip}`;
        mapLogins.set(key, l);
      });

      const mergedLogins = Array.from(mapLogins.values()).map((lg) => {
        const matchingTele = telemetriaLocal.find((t) => t.ip === lg.ip || t.usuario === lg.username);
        return {
          ...lg,
          deviceId: (matchingTele?.deviceId || lg.deviceId || 'DEV-AUTH-' + String(lg.usuario_id || 'USR').padStart(4, '0') + '-' + (lg.ip || '').slice(-4).replace(/\./g, '')).replace(/^MMS-/i, ''),
          model: matchingTele?.deviceModel || lg.model || 'Aparelho Autorizado',
          os: matchingTele?.os || lg.os || 'Ambiente Seguro',
          browser: matchingTele?.browser || lg.browser || 'Browser',
        };
      }).sort(
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

  const handleToggleBloquearIp = (ipAlvo: string, estaBloqueado: boolean) => {
    const ipLimpo = (ipAlvo || '').trim();
    if (!ipLimpo || ipLimpo === '127.0.0.1' || ipLimpo.toLowerCase() === 'localhost') {
      showCustomAlert('IP Inválido', 'Não é possível bloquear o endereço de IP local.');
      return;
    }

    if (estaBloqueado) {
      showCustomAlert(
        'Desbloquear IP',
        `Deseja realmente DESBLOQUEAR o IP "${ipLimpo}"?\n\nO usuário deste IP voltará a ter acesso normal ao Gerador de Relatórios.`,
        async () => {
          try {
            const { error } = await supabase
              .from('ips_bloqueados')
              .delete()
              .eq('ip', ipLimpo);
            if (error) {
              showCustomAlert('Erro ao Desbloquear', error.message || 'Falha ao remover o bloqueio.');
            } else {
              showCustomAlert('IP Desbloqueado', `O IP ${ipLimpo} foi desbloqueado com sucesso.`);
              carregarSeguranca();
            }
          } catch (err: any) {
            showCustomAlert('Erro', err.message || 'Erro inesperado.');
          }
        },
        false
      );
    } else {
      showCustomAlert(
        'Bloquear IP',
        `Deseja realmente BLOQUEAR o IP "${ipLimpo}"?\n\nQualquer dispositivo conectado através deste IP será impedido de acessar o Gerador de Relatórios.`,
        async () => {
          try {
            const { error } = await supabase
              .from('ips_bloqueados')
              .insert([{
                ip: ipLimpo,
                bloqueado_por: userSession?.user?.user_metadata?.username || userSession?.user?.email || 'Coordenação',
                data_bloqueio: new Date().toISOString(),
              }]);
            if (error) {
              showCustomAlert('Erro ao Bloquear', error.message || 'Falha ao salvar o bloqueio.');
            } else {
              showCustomAlert('IP Bloqueado', `O IP ${ipLimpo} foi bloqueado com sucesso!`);
              carregarSeguranca();
            }
          } catch (err: any) {
            showCustomAlert('Erro', err.message || 'Erro inesperado.');
          }
        },
        true
      );
    }
  };

  const handleBloquearIpManual = async () => {
    const ipLimpo = inputIpManual.trim();
    if (!ipLimpo) {
      showCustomAlert('Atenção', 'Digite um endereço IP válido.');
      return;
    }
    if (ipLimpo === '127.0.0.1' || ipLimpo.toLowerCase() === 'localhost') {
      showCustomAlert('IP Inválido', 'Não é possível bloquear o IP local.');
      return;
    }
    if (blockedIpsSet.has(ipLimpo)) {
      showCustomAlert('Atenção', `O IP ${ipLimpo} já se encontra na lista de bloqueio.`);
      return;
    }

    setSalvandoBloqueioIp(true);
    try {
      const { error } = await supabase
        .from('ips_bloqueados')
        .insert([{
          ip: ipLimpo,
          bloqueado_por: userSession?.user?.user_metadata?.username || userSession?.user?.email || 'Coordenação',
          data_bloqueio: new Date().toISOString(),
        }]);
      if (error) {
        showCustomAlert('Erro ao Bloquear', error.message || 'Falha ao salvar o bloqueio.');
      } else {
        showCustomAlert('IP Bloqueado', `O IP ${ipLimpo} foi bloqueado com sucesso!`);
        setInputIpManual('');
        carregarSeguranca();
      }
    } catch (err: any) {
      showCustomAlert('Erro', err.message || 'Erro inesperado.');
    } finally {
      setSalvandoBloqueioIp(false);
    }
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

  const handleExcluirVersao = async (item: AppVersionRecord) => {
    if (!item) return;
    try {
      const confirmExclusao = Platform.OS === 'web'
        ? window.confirm(`Deseja realmente remover a versão "${item.versao}" do banco de dados?`)
        : true;
      if (!confirmExclusao) return;

      const ok = await deleteAppVersion(item.id || item.versao);
      if (ok) {
        showCustomAlert('VERSÃO REMOVIDA', `A versão "${item.versao}" foi excluída com sucesso do banco de dados.`);
        await carregarVersoes();
      } else {
        showCustomAlert('ERRO', 'Não foi possível remover a versão da base de dados.');
      }
    } catch (e: any) {
      showCustomAlert('ERRO', e?.message || 'Falha ao remover versão.');
    }
  };

  const carregarMetricas = async () => {
    try {
      const hojeStr = new Date().toISOString().split('T')[0];
      const agora = new Date();
      const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
      const mesKey = agora.toISOString().substring(0, 7);

      // Executa as 3 contagens simultaneamente em paralelo na nuvem
      const [resTotal, resHoje, resMes] = await Promise.all([
        supabase.from('relatorios').select('*', { count: 'exact', head: true }),
        supabase.from('relatorios').select('*', { count: 'exact', head: true }).gte('data_criacao', `${hojeStr}T00:00:00`),
        supabase.from('relatorios').select('*', { count: 'exact', head: true }).gte('data_criacao', primeiroDiaMes),
      ]);

      let tot = totalRelatoriosGeral;
      let hj = relatoriosHojeCount;
      let mes = relatoriosMesCount;

      if (resTotal.count !== null && resTotal.count !== undefined) {
        tot = resTotal.count;
        setTotalRelatoriosGeral(resTotal.count);
      }
      if (resHoje.count !== null && resHoje.count !== undefined) {
        hj = resHoje.count;
        setRelatoriosHojeCount(resHoje.count);
      }
      if (resMes.count !== null && resMes.count !== undefined) {
        mes = resMes.count;
        setRelatoriosMesCount(resMes.count);
      }

      // Salva no cache local para carregamento instantâneo em 0ms nos próximos acessos
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_coord_kpi_cache', JSON.stringify({
            total: tot,
            hoje: hj,
            mes: mes,
            hojeKey: hojeStr,
            mesKey: mesKey,
            updatedAt: Date.now(),
          }));
        } catch (e) {}
      }
    } catch (e) {
      console.warn('Erro ao carregar métricas:', e);
    } finally {
      setLoadingMetricas(false);
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

  // Filtragem Concreta de Todos os Dados por Mês e Ano Selecionados
  const handleFiltrarPorMesAno = async (mesAlvo?: number, anoAlvo?: number) => {
    const m = typeof mesAlvo === 'number' ? mesAlvo : mesFiltro;
    const a = typeof anoAlvo === 'number' ? anoAlvo : anoFiltro;

    setFiltrandoMesAno(true);
    setLoadingMetricas(true);
    setLoading(true);

    try {
      // 1. Gera intervalo de datas ISO exato do mês
      const primeiroDia = `${a}-${String(m + 1).padStart(2, '0')}-01T00:00:00`;
      const ultimoDiaNum = new Date(a, m + 1, 0).getDate();
      const ultimoDia = `${a}-${String(m + 1).padStart(2, '0')}-${String(ultimoDiaNum).padStart(2, '0')}T23:59:59`;

      // Sincroniza os inputs da tabela para exibir as datas do período filtrado
      setFiltroDataInicio(`${String(1).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${a}`);
      setFiltroDataFim(`${String(ultimoDiaNum).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${a}`);
      setPaginaRelatorios(1);

      // 2. Busca contagem de relatórios daquele mês/ano específico para atualizar os KPIs
      const { count: countMes } = await supabase
        .from('relatorios')
        .select('*', { count: 'exact', head: true })
        .gte('data_criacao', primeiroDia)
        .lte('data_criacao', ultimoDia);

      if (typeof countMes === 'number') {
        setRelatoriosMesCount(countMes);
      }

      // 3. Busca a listagem de relatórios desse período para atualizar a tabela e os rankings
      let query = supabase
        .from('relatorios')
        .select('*', { count: 'exact' })
        .gte('data_criacao', primeiroDia)
        .lte('data_criacao', ultimoDia);

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

      const { data: relsMes } = await query
        .order('data_criacao', { ascending: false })
        .range(0, porPagina - 1);

      if (relsMes) {
        setRelatorios(relsMes);
      }

      setIsMonthPickerOpen(false);
    } catch (err) {
      console.warn('Erro ao filtrar por mês e ano:', err);
    } finally {
      setFiltrandoMesAno(false);
      setLoadingMetricas(false);
      setLoading(false);
    }
  };

  const handleRedefinirMesAtual = () => {
    const hoje = new Date();
    setMesFiltro(hoje.getMonth());
    setAnoFiltro(hoje.getFullYear());
    handleFiltrarPorMesAno(hoje.getMonth(), hoje.getFullYear());
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
        .select('id, nome, username, email, nivel_autoridade, data_cadastro, last_activity, status_aprovacao, aprovado_por, data_aprovacao')
        .order('id', { ascending: false });

      if (!error && data) {
        setUsuarios(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar usuários:', e);
    }
  };

  const handleToggleExigirAprovacao = async () => {
    const novoValor = !exigirAprovacaoCadastro;
    setSalvandoExigirAprovacao(true);
    const ok = await setExigirAprovacaoCadastro(novoValor);
    if (ok) {
      setExigirAprovacaoCadastroState(novoValor);
      showCustomAlert(
        'Configuração Atualizada',
        novoValor
          ? 'Aprovação de cadastros ATIVADA! A partir de agora, novos usuários precisarão de sua liberação para acessar o sistema.'
          : 'Aprovação de cadastros DESATIVADA! Novos usuários terão acesso liberado imediatamente após se cadastrarem.'
      );
    } else {
      showCustomAlert('Erro', 'Não foi possível salvar a configuração no banco.');
    }
    setSalvandoExigirAprovacao(false);
  };

  const handleAprovarUsuario = (user: any) => {
    showCustomAlert(
      'APROVAR CADASTRO',
      `Deseja autorizar o acesso do usuário "${user.nome || user.username}" ao Gerador de Relatórios?`,
      async () => {
        const executor = userSession?.user?.user_metadata?.username || 'Coordenação';
        const res = await aprovarUsuario(user.id, executor);
        if (res.success) {
          showCustomAlert('Cadastro Aprovado', `O acesso de ${user.nome || user.username} foi liberado com sucesso!`);
          carregarUsuarios();
          carregarHistoricoAprovacoesState();
        } else {
          showCustomAlert('Erro ao Aprovar', res.error || 'Falha ao liberar cadastro.');
        }
      }
    );
  };

  const handleRecusarUsuario = (user: any) => {
    showCustomAlert(
      'RECUSAR CADASTRO',
      `Deseja realmente RECUSAR o cadastro de "${user.nome || user.username}"? O usuário será impedido de fazer login no sistema.`,
      async () => {
        const executor = userSession?.user?.user_metadata?.username || 'Coordenação';
        const res = await recusarUsuario(user.id, executor);
        if (res.success) {
          showCustomAlert('Cadastro Recusado', `O cadastro de ${user.nome || user.username} foi recusado e registrado.`);
          carregarUsuarios();
          carregarHistoricoAprovacoesState();
        } else {
          showCustomAlert('Erro ao Recusar', res.error || 'Falha ao registrar recusa.');
        }
      },
      true
    );
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
    if (!report) return null;
    const data = report.dados_json ?? report.dados_relatorio ?? report.dados;
    if (!data) return null;
    if (typeof data === 'object') return data;
    try {
      let parsed = JSON.parse(data);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (_) {}
      }
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch (e) {
      return null;
    }
  };

  // Extrai nome real do preposto (nunca nome de unidade)
  const getPrepostoFromReport = (report: any, parsedObj?: any): string | null => {
    if (!report) return null;
    const p = parsedObj !== undefined ? parsedObj : parseReportData(report);
    const raw =
      p?.preposto ||
      p?.nome_preposto ||
      p?.preposto_nome ||
      p?.responsavel ||
      (report as any)?.preposto ||
      (report as any)?.nome_preposto;

    if (
      raw &&
      typeof raw === 'string' &&
      raw.trim() !== '' &&
      raw.trim() !== 'undefined' &&
      raw.trim().toUpperCase() !== 'N/A' &&
      raw.trim().toUpperCase() !== 'NULL'
    ) {
      return raw.trim();
    }

    if (report?.usuario_id && Array.isArray(usuarios) && usuarios.length > 0) {
      const u = usuarios.find(
        (user) => String(user.id).trim() === String(report.usuario_id).trim()
      );
      if (u) {
        const uNome = u.nome || u.username;
        if (uNome && typeof uNome === 'string' && uNome.trim() !== '') {
          return uNome.trim();
        }
      }
    }

    return null;
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
      preposto: getPrepostoFromReport(report, parsed) || 'Coordenação',
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
  const handleVisualizarRelatorio = (report: any) => {
    if (!report) return;
    const reportId = report.id;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(`/ver_relatorio?id=${reportId}`, '_blank');
    } else {
      router.push({ pathname: '/ver_relatorio', params: { id: String(reportId) } } as any);
    }
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

  // Cálculo de Ranking: Prepostos (Todos os prepostos e usuários geradores)
  const rankingPrepostos = useMemo(() => {
    const mapa: { [key: string]: { nome: string; total: number; ultimaEmpresa: string } } = {};

    relatorios.forEach((r) => {
      const parsed = parseReportData(r);
      const preposto = getPrepostoFromReport(r, parsed);

      let chaveGerador = '';
      if (preposto) {
        chaveGerador = preposto;
      } else {
        const ipOrigem = r.ip_origem || 'N/A';
        chaveGerador = ipOrigem !== 'N/A' ? `🌐 IP: ${ipOrigem}` : 'Preposto não identificado';
      }

      const emp = r.empresa || 'OUTROS';

      if (!mapa[chaveGerador]) {
        mapa[chaveGerador] = { nome: chaveGerador, total: 0, ultimaEmpresa: emp };
      }
      mapa[chaveGerador].total += 1;
      if (emp && emp !== 'OUTROS') {
        mapa[chaveGerador].ultimaEmpresa = emp;
      }
    });

    return Object.values(mapa).sort((a, b) => b.total - a.total);
  }, [relatorios, usuarios]);

  // Alias para compatibilidade
  const rankingGeradores = rankingPrepostos;

  // Cálculo de Ranking: Empresas (Volume por empresa/cliente)
  const rankingEmpresas = useMemo(() => {
    const mapa: { [key: string]: { empresa: string; total: number } } = {};

    relatorios.forEach((r) => {
      let emp = (r.empresa || '').trim().toUpperCase();
      if (!emp || emp === 'N/A' || emp === 'UNDEFINED' || emp === 'NULL') {
        emp = 'OUTROS';
      }
      if (!mapa[emp]) {
        mapa[emp] = { empresa: emp, total: 0 };
      }
      mapa[emp].total += 1;
    });

    return Object.values(mapa).sort((a, b) => b.total - a.total);
  }, [relatorios]);

  // Paginação dos Prepostos (10 por página)
  const totalPaginasPrepostos = useMemo(() => {
    return Math.max(1, Math.ceil(rankingPrepostos.length / porPaginaRanking));
  }, [rankingPrepostos.length]);

  const prepostosPaginados = useMemo(() => {
    const inicio = (paginaRankingPrepostos - 1) * porPaginaRanking;
    return rankingPrepostos.slice(inicio, inicio + porPaginaRanking);
  }, [rankingPrepostos, paginaRankingPrepostos]);

  // Paginação das Empresas (10 por página)
  const totalPaginasEmpresas = useMemo(() => {
    return Math.max(1, Math.ceil(rankingEmpresas.length / porPaginaRanking));
  }, [rankingEmpresas.length]);

  const empresasPaginadas = useMemo(() => {
    const inicio = (paginaRankingEmpresas - 1) * porPaginaRanking;
    return rankingEmpresas.slice(inicio, inicio + porPaginaRanking);
  }, [rankingEmpresas, paginaRankingEmpresas]);

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
                style={[styles.coordLockInput, styles.coordLockInputLight, { opacity: 0.75, backgroundColor: '#f1f5f9', color: '#64748b' }]}
                value={inputUsuarioPainel}
                editable={false}
                selectTextOnFocus={false}
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
                  onPress={handleIrParaSeguranca}
                  activeOpacity={0.8}
                  accessibilityLabel="Notificações de Acesso"
                >
                  <Text style={{ fontSize: 16 }}>🔔</Text>
                  {acessosFalhosNaoVistosCount > 0 && (
                    <View style={styles.coordNavNotifBadge}>
                      <Text style={styles.coordNavNotifBadgeText}>
                        {acessosFalhosNaoVistosCount > 9 ? '9+' : acessosFalhosNaoVistosCount}
                      </Text>
                    </View>
                  )}
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
        {/* Banner de Alerta Expandido de Tentativa de Acesso Não Autorizado */}
        {acessosFalhosNaoVistosCount > 0 && alertaSegurancaExpandido && (
          <TouchableOpacity
            style={styles.coordSecurityAlertBanner}
            onPress={handleIrParaSeguranca}
            activeOpacity={0.92}
          >
            <View style={styles.coordSecurityAlertBannerContent}>
              <View style={styles.coordSecurityAlertIconWrap}>
                <Text style={{ fontSize: 22 }}>🚨</Text>
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <Text style={styles.coordSecurityAlertTitle}>
                    ALERTA DE SEGURANÇA: TENTATIVAS DE ACESSO DETECTADAS
                  </Text>
                  <View style={styles.coordSecurityAlertPill}>
                    <Text style={styles.coordSecurityAlertPillText}>
                      {acessosFalhosNaoVistosCount} {acessosFalhosNaoVistosCount === 1 ? 'NÃO VISTA' : 'NÃO VISTAS'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.coordSecurityAlertSub}>
                  Foram registradas tentativas de login não autorizadas com credenciais incorretas no painel de coordenação. Clique para inspecionar os registros de segurança.
                </Text>
              </View>
              <View style={styles.coordSecurityAlertActionBox}>
                <Text style={styles.coordSecurityAlertActionText}>VER DETALHES ›</Text>
              </View>
              <TouchableOpacity
                style={styles.coordSecurityAlertCloseBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  setAlertaSegurancaExpandido(false);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.coordSecurityAlertCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}

        {/* Banner de Notificação de Novos Cadastros Pendentes */}
        {usuariosPendentes.length > 0 && (
          <TouchableOpacity
            style={[styles.coordSecurityAlertBanner, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}
            onPress={() => setActiveTab('usuarios')}
            activeOpacity={0.92}
          >
            <View style={styles.coordSecurityAlertBannerContent}>
              <View style={[styles.coordSecurityAlertIconWrap, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}>
                <Text style={{ fontSize: 22 }}>👥</Text>
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <Text style={[styles.coordSecurityAlertTitle, { color: '#92400e' }]}>
                    NOVO CADASTRO PENDENTE DE APROVAÇÃO
                  </Text>
                  <View style={[styles.coordSecurityAlertPill, { backgroundColor: '#dc2626' }]}>
                    <Text style={styles.coordSecurityAlertPillText}>
                      {usuariosPendentes.length} {usuariosPendentes.length === 1 ? 'PENDENTE' : 'PENDENTES'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.coordSecurityAlertSub, { color: '#78350f' }]}>
                  Existem novos usuários cadastrados aguardando sua autorização para poderem fazer login. Clique aqui para gerenciar os cadastros.
                </Text>
              </View>
              <View style={[styles.coordSecurityAlertActionBox, { backgroundColor: '#d97706' }]}>
                <Text style={styles.coordSecurityAlertActionText}>REVISAR ›</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

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
            <TouchableOpacity
              style={styles.overviewMonthSelectorLight}
              onPress={() => setIsMonthPickerOpen(true)}
              activeOpacity={0.75}
              accessibilityLabel="Selecionar Mês e Ano"
            >
              <Text style={{ fontSize: 18, marginRight: 8 }}>🗓️</Text>
              <Text style={styles.overviewMonthText}>{nomeMesAtual}</Text>
              <Text style={styles.overviewMonthChevron}>▾</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.overviewBtnFiltrar}
              onPress={() => handleFiltrarPorMesAno(mesFiltro, anoFiltro)}
              disabled={filtrandoMesAno}
              activeOpacity={0.8}
              accessibilityLabel="Filtrar dados deste mês"
            >
              {filtrandoMesAno ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.overviewBtnFiltrarText}>FILTRAR ›</Text>
              )}
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
            <View style={styles.kpiMetricValueContainer}>
              {loadingMetricas ? (
                <View style={styles.kpiMetricLoadingBox}>
                  <ActivityIndicator size="small" color="#ea580c" />
                </View>
              ) : (
                <Text style={[styles.kpiMetricValue, { color: '#000000', marginVertical: 0 }]}>
                  {relatoriosHojeCount}
                </Text>
              )}
            </View>
            <Text style={styles.kpiMetricFootnote}>Relatórios gerados hoje</Text>
          </View>

          {/* Card 2: Neste Mês / Mês Filtrado */}
          <View style={[styles.kpiMetricCard, styles.kpiMetricCardMes]} className="coord-interactive-card">
            <View style={styles.kpiMetricTopRow}>
              <Text style={[styles.kpiMetricLabel, { color: '#0284c7' }]}>{mesAnoCurto.toUpperCase()}</Text>
              <Text style={{ fontSize: 14 }}>📅</Text>
            </View>
            <View style={styles.kpiMetricValueContainer}>
              {loadingMetricas ? (
                <View style={styles.kpiMetricLoadingBox}>
                  <ActivityIndicator size="small" color="#0284c7" />
                </View>
              ) : (
                <Text style={[styles.kpiMetricValue, { color: '#000000', marginVertical: 0 }]}>
                  {relatoriosMesCount}
                </Text>
              )}
            </View>
            <Text style={styles.kpiMetricFootnote}>Atendimentos em {nomeMesAtual}</Text>
          </View>

          {/* Card 3: Total Geral */}
          <View style={[styles.kpiMetricCard, styles.kpiMetricCardTotal]} className="coord-interactive-card">
            <View style={styles.kpiMetricTopRow}>
              <Text style={[styles.kpiMetricLabel, { color: '#2563eb' }]}>TOTAL GERAL</Text>
              <Text style={{ fontSize: 14 }}>📊</Text>
            </View>
            <View style={styles.kpiMetricValueContainer}>
              {loadingMetricas ? (
                <View style={styles.kpiMetricLoadingBox}>
                  <ActivityIndicator size="small" color="#2563eb" />
                </View>
              ) : (
                <Text style={[styles.kpiMetricValue, { color: '#000000', marginVertical: 0 }]}>
                  {totalRelatoriosGeral}
                </Text>
              )}
            </View>
            <Text style={styles.kpiMetricFootnote}>Relatórios emitidos</Text>
          </View>

          {/* Card 4: Usuários */}
          <View style={[styles.kpiMetricCard, styles.kpiMetricCardUsuarios]} className="coord-interactive-card">
            <View style={styles.kpiMetricTopRow}>
              <Text style={[styles.kpiMetricLabel, { color: '#7c3aed' }]}>USUÁRIOS</Text>
              <Text style={{ fontSize: 14 }}>👥</Text>
            </View>
            <View style={styles.kpiMetricValueContainer}>
              {loading && usuarios.length === 0 ? (
                <View style={styles.kpiMetricLoadingBox}>
                  <ActivityIndicator size="small" color="#7c3aed" />
                </View>
              ) : (
                <Text style={[styles.kpiMetricValue, { color: '#000000', marginVertical: 0 }]}>
                  {usuarios.length > 0 ? usuarios.length : 10}
                </Text>
              )}
            </View>
            <Text style={styles.kpiMetricFootnote}>Contas registradas</Text>
          </View>
        </View>

        {/* Abas de Navegação (Scroll horizontal suave e responsivo em qualquer tela) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ width: '100%', marginBottom: 16 }}
          contentContainerStyle={{ flexGrow: 1, width: '100%', minWidth: '100%' }}
          className="coord-tabs-scroll"
        >
          <View style={[styles.tabsBarRow, { width: '100%', minWidth: '100%' }]} className="coord-tabs-bar">
            <TouchableOpacity
              style={[styles.tabNavButton, { minWidth: width >= 1024 ? 0 : 115 }, activeTab === 'relatorios' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('relatorios')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>📊</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'relatorios' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                RELATÓRIOS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, { minWidth: width >= 1024 ? 0 : 115 }, activeTab === 'ranking' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('ranking')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>🏆</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'ranking' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                RANKINGS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, { minWidth: width >= 1024 ? 0 : 115 }, activeTab === 'popups' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('popups')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>📢</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'popups' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                POP-UPS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, { minWidth: width >= 1024 ? 0 : 115 }, activeTab === 'mensagens' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('mensagens')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>💬</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'mensagens' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                MENSAGENS
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, { minWidth: width >= 1024 ? 0 : 115 }, activeTab === 'usuarios' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('usuarios')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>👥</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'usuarios' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                USUÁRIOS
              </Text>
              {usuariosPendentes.length > 0 && (
                <View style={[styles.tabNavBadge, { backgroundColor: '#dc2626' }]}>
                  <Text style={styles.tabNavBadgeText}>
                    {usuariosPendentes.length > 9 ? '9+' : usuariosPendentes.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, { minWidth: width >= 1024 ? 0 : 115 }, activeTab === 'seguranca' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={handleIrParaSeguranca}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>🛡️</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'seguranca' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                SEGURANÇA
              </Text>
              {acessosFalhosNaoVistosCount > 0 && (
                <View style={styles.tabNavBadge}>
                  <Text style={styles.tabNavBadgeText}>
                    {acessosFalhosNaoVistosCount > 9 ? '9+' : acessosFalhosNaoVistosCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, { minWidth: width >= 1024 ? 0 : 115 }, activeTab === 'sistema' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
              onPress={() => setActiveTab('sistema')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 13, marginRight: 6 }}>⚙️</Text>
              <Text style={[styles.tabNavButtonText, activeTab === 'sistema' ? styles.tabNavButtonTextActive : styles.tabNavButtonTextInactive]}>
                SISTEMA
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabNavButton, { minWidth: width >= 1024 ? 0 : 115 }, activeTab === 'version' ? styles.tabNavButtonActive : styles.tabNavButtonInactive]}
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
                    const preposto = getPrepostoFromReport(item, parsed);
                    const ipOrigem = item.ip_origem || 'N/A';
                    const badgeStyle = getCompanyBadgeStyle(item.empresa);
                    const autorTexto = preposto
                      ? (ipOrigem !== 'N/A'
                          ? `POR: 🌐 IP: ${ipOrigem} (${preposto.toUpperCase()})`
                          : `POR: (${preposto.toUpperCase()})`)
                      : (ipOrigem !== 'N/A'
                          ? `POR: 🌐 IP: ${ipOrigem}`
                          : `POR: PREPOSTO NÃO INFORMADO`);

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
                          {autorTexto}
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

        {/* ════════════════ ABA 2: RANKINGS (PREPOSTOS & EMPRESAS) ════════════════ */}
        {activeTab === 'ranking' && (
          <View style={styles.tabContent}>
            <View style={styles.rankingCard}>
              {/* Header do Card de Rankings com Seletor de Sub-abas */}
              <View style={styles.rankingHeader}>
                <View style={styles.rankingHeaderTopRow}>
                  <View style={styles.rankingHeaderLeft}>
                    <View style={styles.rankingIconBox}>
                      <Text style={{ fontSize: 20, color: '#ffffff' }}>🏆</Text>
                    </View>
                    <View>
                      <Text style={styles.rankingTitle}>RANKINGS GERAIS</Text>
                      <Text style={styles.rankingSubtitle}>
                        {subTabRanking === 'prepostos'
                          ? 'Classificação de prepostos por volume de relatórios emitidos'
                          : 'Distribuição de relatórios gerados por empresa atendida'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Sub-abas: 1º Ranking Prepostos | 2º Ranking Empresas */}
                <View style={styles.rankingSubTabsRow}>
                  <TouchableOpacity
                    style={[
                      styles.rankingSubTabBtn,
                      subTabRanking === 'prepostos' && styles.rankingSubTabBtnActive,
                    ]}
                    onPress={() => setSubTabRanking('prepostos')}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 14 }}>👷‍♂️</Text>
                    <Text
                      style={[
                        styles.rankingSubTabBtnText,
                        subTabRanking === 'prepostos' && styles.rankingSubTabBtnTextActive,
                      ]}
                    >
                      RANKING PREPOSTOS
                    </Text>
                    <View
                      style={[
                        styles.rankingSubTabPill,
                        subTabRanking === 'prepostos'
                          ? styles.rankingSubTabPillActive
                          : styles.rankingSubTabPillInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.rankingSubTabPillText,
                          subTabRanking === 'prepostos'
                            ? styles.rankingSubTabPillTextActive
                            : styles.rankingSubTabPillTextInactive,
                        ]}
                      >
                        {rankingPrepostos.length}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rankingSubTabBtn,
                      subTabRanking === 'empresas' && styles.rankingSubTabBtnActive,
                    ]}
                    onPress={() => setSubTabRanking('empresas')}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 14 }}>🏢</Text>
                    <Text
                      style={[
                        styles.rankingSubTabBtnText,
                        subTabRanking === 'empresas' && styles.rankingSubTabBtnTextActive,
                      ]}
                    >
                      RANKING EMPRESAS
                    </Text>
                    <View
                      style={[
                        styles.rankingSubTabPill,
                        subTabRanking === 'empresas'
                          ? styles.rankingSubTabPillActive
                          : styles.rankingSubTabPillInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.rankingSubTabPillText,
                          subTabRanking === 'empresas'
                            ? styles.rankingSubTabPillTextActive
                            : styles.rankingSubTabPillTextInactive,
                        ]}
                      >
                        {rankingEmpresas.length}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ────────── SUB-ABA 1: RANKING PREPOSTOS ────────── */}
              {subTabRanking === 'prepostos' && (
                <View>
                  {/* Cabeçalho da Tabela de Prepostos */}
                  <View style={styles.rankingTableHeaderRow}>
                    <View style={styles.rankingColPos}>
                      <Text style={styles.rankingTableHeaderText}>POSIÇÃO</Text>
                    </View>
                    <View style={styles.rankingColUser}>
                      <Text style={styles.rankingTableHeaderText}>PREPOSTO / USUÁRIO</Text>
                    </View>
                    {!isMobile && (
                      <View style={styles.rankingColEmpresa}>
                        <Text style={styles.rankingTableHeaderText}>ÚLTIMA EMPRESA</Text>
                      </View>
                    )}
                    <View style={styles.rankingColTotal}>
                      <Text style={styles.rankingTableHeaderText}>TOTAL</Text>
                    </View>
                  </View>

                  {/* Listagem Paginada de Prepostos */}
                  {prepostosPaginados.length === 0 ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', fontSize: 13, fontFamily: modernFont }}>
                        Nenhum preposto ou relatório registrado ainda.
                      </Text>
                    </View>
                  ) : (
                    prepostosPaginados.map((item, index) => {
                      const posReal = (paginaRankingPrepostos - 1) * porPaginaRanking + index;
                      const is1 = posReal === 0;
                      const is2 = posReal === 1;
                      const is3 = posReal === 2;

                      return (
                        <View key={item.nome || index} style={styles.rankingTableRow}>
                          {/* Coluna Posição */}
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
                              <Text style={styles.rankingPosNumber}>{posReal + 1}</Text>
                            )}
                          </View>

                          {/* Coluna Preposto */}
                          <View style={styles.rankingColUser}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={styles.rankingAvatarCircle}>
                                <Text style={styles.rankingAvatarText}>
                                  {item.nome.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || 'P'}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.rankingUserName} numberOfLines={1}>
                                  {item.nome}
                                </Text>
                                {isMobile && item.ultimaEmpresa && (
                                  <Text style={styles.rankingUserSubText} numberOfLines={1}>
                                    🏢 {item.ultimaEmpresa}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>

                          {/* Coluna Última Empresa (Desktop) */}
                          {!isMobile && (
                            <View style={styles.rankingColEmpresa}>
                              <View style={styles.rankingEmpresaTag}>
                                <Text style={styles.rankingEmpresaTagText} numberOfLines={1}>
                                  {item.ultimaEmpresa || 'NÃO ESPECIFICADA'}
                                </Text>
                              </View>
                            </View>
                          )}

                          {/* Coluna Total */}
                          <View style={styles.rankingColTotal}>
                            <View style={styles.rankingTotalBadge}>
                              <Text style={styles.rankingTotalBadgeText}>{item.total}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}

                  {/* Paginação de Prepostos (quando ultrapassar 10 usuários) */}
                  {rankingPrepostos.length > porPaginaRanking && (
                    <View style={styles.paginationRow}>
                      <TouchableOpacity
                        style={[styles.pageBtn, paginaRankingPrepostos <= 1 && styles.pageBtnDisabled]}
                        disabled={paginaRankingPrepostos <= 1}
                        onPress={() => setPaginaRankingPrepostos((p) => Math.max(1, p - 1))}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pageBtnText}>← ANTERIOR</Text>
                      </TouchableOpacity>

                      <Text style={styles.pageIndicatorText}>
                        PÁGINA {paginaRankingPrepostos} DE {totalPaginasPrepostos} • {rankingPrepostos.length} PREPOSTOS
                      </Text>

                      <TouchableOpacity
                        style={[styles.pageBtn, paginaRankingPrepostos >= totalPaginasPrepostos && styles.pageBtnDisabled]}
                        disabled={paginaRankingPrepostos >= totalPaginasPrepostos}
                        onPress={() => setPaginaRankingPrepostos((p) => Math.min(totalPaginasPrepostos, p + 1))}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pageBtnText}>PRÓXIMA →</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* ────────── SUB-ABA 2: RANKING EMPRESAS ────────── */}
              {subTabRanking === 'empresas' && (
                <View>
                  {/* Cabeçalho da Tabela de Empresas */}
                  <View style={styles.rankingTableHeaderRow}>
                    <View style={styles.rankingColPos}>
                      <Text style={styles.rankingTableHeaderText}>POSIÇÃO</Text>
                    </View>
                    <View style={styles.rankingColUser}>
                      <Text style={styles.rankingTableHeaderText}>EMPRESA / CLIENTE</Text>
                    </View>
                    {!isMobile && (
                      <View style={styles.rankingColEmpresa}>
                        <Text style={styles.rankingTableHeaderText}>PARTICIPAÇÃO</Text>
                      </View>
                    )}
                    <View style={styles.rankingColTotal}>
                      <Text style={styles.rankingTableHeaderText}>TOTAL</Text>
                    </View>
                  </View>

                  {/* Listagem Paginada de Empresas */}
                  {empresasPaginadas.length === 0 ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', fontSize: 13, fontFamily: modernFont }}>
                        Nenhuma empresa registrada nos relatórios.
                      </Text>
                    </View>
                  ) : (
                    empresasPaginadas.map((item, index) => {
                      const posReal = (paginaRankingEmpresas - 1) * porPaginaRanking + index;
                      const is1 = posReal === 0;
                      const is2 = posReal === 1;
                      const is3 = posReal === 2;
                      const percent = totalRelatoriosGeral > 0
                        ? ((item.total / totalRelatoriosGeral) * 100).toFixed(1)
                        : '0';

                      return (
                        <View key={item.empresa || index} style={styles.rankingTableRow}>
                          {/* Coluna Posição */}
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
                              <Text style={styles.rankingPosNumber}>{posReal + 1}</Text>
                            )}
                          </View>

                          {/* Coluna Empresa */}
                          <View style={styles.rankingColUser}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={styles.rankingCompanyIconBox}>
                                <Text style={{ fontSize: 16 }}>🏢</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.rankingUserName} numberOfLines={1}>
                                  {item.empresa}
                                </Text>
                                {isMobile && (
                                  <Text style={styles.rankingUserSubText}>
                                    {percent}% do volume total
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>

                          {/* Coluna Participação (Desktop) */}
                          {!isMobile && (
                            <View style={styles.rankingColEmpresa}>
                              <View style={{ width: '100%', paddingRight: 20 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b' }}>VOLUME</Text>
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#0284c7' }}>{percent}%</Text>
                                </View>
                                <View style={styles.rankingProgressBarBg}>
                                  <View style={[styles.rankingProgressBarFill, { width: `${Math.min(100, Math.max(5, Number(percent)))}%` }]} />
                                </View>
                              </View>
                            </View>
                          )}

                          {/* Coluna Total */}
                          <View style={styles.rankingColTotal}>
                            <View style={[styles.rankingTotalBadge, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                              <Text style={[styles.rankingTotalBadgeText, { color: '#16a34a' }]}>{item.total}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}

                  {/* Paginação de Empresas (quando ultrapassar 10 empresas) */}
                  {rankingEmpresas.length > porPaginaRanking && (
                    <View style={styles.paginationRow}>
                      <TouchableOpacity
                        style={[styles.pageBtn, paginaRankingEmpresas <= 1 && styles.pageBtnDisabled]}
                        disabled={paginaRankingEmpresas <= 1}
                        onPress={() => setPaginaRankingEmpresas((p) => Math.max(1, p - 1))}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pageBtnText}>← ANTERIOR</Text>
                      </TouchableOpacity>

                      <Text style={styles.pageIndicatorText}>
                        PÁGINA {paginaRankingEmpresas} DE {totalPaginasEmpresas} • {rankingEmpresas.length} EMPRESAS
                      </Text>

                      <TouchableOpacity
                        style={[styles.pageBtn, paginaRankingEmpresas >= totalPaginasEmpresas && styles.pageBtnDisabled]}
                        disabled={paginaRankingEmpresas >= totalPaginasEmpresas}
                        onPress={() => setPaginaRankingEmpresas((p) => Math.min(totalPaginasEmpresas, p + 1))}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pageBtnText}>PRÓXIMA →</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ════════════════ ABA 3: USUÁRIOS, APROVAÇÃO DE CADASTROS & AUDITORIA ════════════════ */}
        {activeTab === 'usuarios' && (
          <View style={styles.tabContent}>
            {/* 1. POLÍTICA DE APROVAÇÃO DE NOVOS CADASTROS */}
            <View style={[styles.sectionCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={[styles.sectionHeader, { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: exigirAprovacaoCadastro ? '#ecfdf5' : '#fef3c7', borderWidth: 1, borderColor: exigirAprovacaoCadastro ? '#a7f3d0' : '#fde68a', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24 }}>{exigirAprovacaoCadastro ? '🔒' : '⚡'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, !isDarkMode && { color: '#0f172a' }]}>
                      POLÍTICA DE CADASTRO DE USUÁRIOS
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                      {exigirAprovacaoCadastro
                        ? 'Aprovação manual ATIVADA: novos cadastros precisam da sua autorização para acessar o sistema'
                        : 'Acesso DIRETO: novos cadastros são liberados imediatamente sem necessidade de autorização'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={{
                    backgroundColor: exigirAprovacaoCadastro ? '#059669' : '#d97706',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onPress={handleToggleExigirAprovacao}
                  disabled={salvandoExigirAprovacao}
                  activeOpacity={0.85}
                >
                  {salvandoExigirAprovacao ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 14 }}>{exigirAprovacaoCadastro ? '✅' : '⚙️'}</Text>
                      <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 }}>
                        {exigirAprovacaoCadastro ? 'EXIGIR APROVAÇÃO: ATIVADO' : 'EXIGIR APROVAÇÃO: DESATIVADO'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* 2. CADASTROS PENDENTES DE APROVAÇÃO (DESTAQUE PRIORITÁRIO) */}
            <View style={[styles.sectionCard, { marginTop: 18 }, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={[styles.sectionHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>🚨</Text>
                  </View>
                  <View>
                    <Text style={[styles.sectionTitle, { color: '#dc2626' }]}>
                      CADASTROS AGUARDANDO APROVAÇÃO
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                      Usuários que se cadastraram no formulário e aguardam liberação do acesso pela coordenação
                    </Text>
                  </View>
                </View>

                <View style={{ backgroundColor: usuariosPendentes.length > 0 ? '#fee2e2' : '#f0fdf4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: usuariosPendentes.length > 0 ? '#fca5a5' : '#bbf7d0' }}>
                  <Text style={{ color: usuariosPendentes.length > 0 ? '#b91c1c' : '#15803d', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                    {usuariosPendentes.length} {usuariosPendentes.length === 1 ? 'CADASTRO PENDENTE' : 'CADASTROS PENDENTES'}
                  </Text>
                </View>
              </View>

              {usuariosPendentes.length === 0 ? (
                <View style={{ padding: 28, alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, marginBottom: 8 }}>✅</Text>
                  <Text style={{ color: '#059669', fontSize: 13, fontWeight: '800' }}>
                    Nenhum cadastro aguardando aprovação no momento.
                  </Text>
                  <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                    Quando novos usuários se cadastrarem enquanto a política estiver ativa, eles aparecerão listados aqui para aprovação.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10, marginTop: 14 }}>
                  {usuariosPendentes.map((u) => {
                    const dataStr = u.data_cadastro ? new Date(u.data_cadastro).toLocaleString('pt-BR') : 'Hoje';
                    return (
                      <View
                        key={u.id}
                        style={{
                          backgroundColor: '#fffbeb',
                          borderWidth: 1.5,
                          borderColor: '#fde68a',
                          borderRadius: 12,
                          padding: 16,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 240 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 14 }}>
                              {u.nome || u.username}
                            </Text>
                            <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#fcd34d' }}>
                              <Text style={{ color: '#b45309', fontSize: 10, fontWeight: '900' }}>
                                ⏳ PENDENTE
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: '#64748b', fontSize: 12 }}>
                            Username: <Text style={{ color: '#0f172a', fontWeight: '700' }}>@{u.username}</Text> • E-mail: <Text style={{ color: '#0f172a', fontWeight: '700' }}>{u.email}</Text>
                          </Text>
                          <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                            Cadastrado em: {dataStr}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity
                            style={{
                              backgroundColor: '#059669',
                              paddingHorizontal: 16,
                              paddingVertical: 9,
                              borderRadius: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                            }}
                            onPress={() => handleAprovarUsuario(u)}
                            activeOpacity={0.85}
                          >
                            <Text style={{ fontSize: 14 }}>✅</Text>
                            <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 }}>
                              LIBERAR ACESSO
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={{
                              backgroundColor: '#fee2e2',
                              paddingHorizontal: 14,
                              paddingVertical: 9,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#fca5a5',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                            }}
                            onPress={() => handleRecusarUsuario(u)}
                            activeOpacity={0.85}
                          >
                            <Text style={{ fontSize: 14 }}>❌</Text>
                            <Text style={{ color: '#b91c1c', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 }}>
                              RECUSAR
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 3. GERENCIAMENTO DE TODOS OS USUÁRIOS */}
            <View style={[styles.sectionCard, { marginTop: 18 }, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={styles.sectionHeader}>
                <Text style={{ fontSize: 24 }}>👥</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, !isDarkMode && { color: '#0f172a' }]}>TODOS OS USUÁRIOS</Text>
                  <Text style={styles.sectionSubtitle}>Controle de permissões (Nível 1 Básico vs Nível 2 Coordenação) e status de conta</Text>
                </View>
              </View>

              {/* Barra de Busca de Usuário */}
              <View style={[
                styles.searchBox,
                isDarkMode ? { backgroundColor: '#0f172a', borderColor: '#334155' } : { backgroundColor: '#ffffff', borderColor: '#cbd5e1' }
              ]}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={[
                    styles.searchInput,
                    isDarkMode ? { color: '#ffffff' } : { color: '#0f172a' }
                  ]}
                  placeholder="Filtrar por nome, username ou e-mail..."
                  placeholderTextColor={isDarkMode ? '#64748b' : '#94a3b8'}
                  value={filtroBuscaUsuario}
                  onChangeText={setFiltroBuscaUsuario}
                />
                {filtroBuscaUsuario ? (
                  <TouchableOpacity
                    onPress={() => setFiltroBuscaUsuario('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 13, color: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 'bold' }}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Tabela de Usuários */}
              <View style={styles.userList}>
                {usuariosFiltrados.map((u) => {
                  const nivelNum = Number(u.nivel_autoridade) || 1;
                  const isCoord = nivelNum === 2;
                  const statusAprovacao = u.status_aprovacao || 'aprovado';
                  const isAprovado = statusAprovacao === 'aprovado';
                  const isPendente = statusAprovacao === 'pendente';
                  const isRecusado = statusAprovacao === 'recusado';

                  return (
                    <View
                      key={u.id}
                      style={[styles.userCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
                    >
                      <View style={styles.userCardInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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

                          <View
                            style={{
                              backgroundColor: isAprovado ? '#ecfdf5' : isPendente ? '#fef3c7' : '#fee2e2',
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 4,
                              borderWidth: 1,
                              borderColor: isAprovado ? '#a7f3d0' : isPendente ? '#fcd34d' : '#fca5a5',
                            }}
                          >
                            <Text
                              style={{
                                color: isAprovado ? '#059669' : isPendente ? '#b45309' : '#b91c1c',
                                fontSize: 10,
                                fontWeight: '900',
                              }}
                            >
                              {isAprovado ? '● ACESSO LIBERADO' : isPendente ? '⏳ AGUARDANDO APROVAÇÃO' : '❌ RECUSADO'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.userMetaText}>
                          Username: <Text style={{ color: '#94a3b8' }}>{u.username}</Text> | E-mail: <Text style={{ color: '#94a3b8' }}>{u.email || 'N/A'}</Text>
                        </Text>
                      </View>

                      <View style={[styles.userCardActions, { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }]}>
                        {isPendente ? (
                          <>
                            <TouchableOpacity
                              style={{ backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 }}
                              onPress={() => handleAprovarUsuario(u)}
                            >
                              <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>✅ Aprovar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5' }}
                              onPress={() => handleRecusarUsuario(u)}
                            >
                              <Text style={{ color: '#b91c1c', fontSize: 11, fontWeight: '800' }}>❌ Recusar</Text>
                            </TouchableOpacity>
                          </>
                        ) : isRecusado ? (
                          <TouchableOpacity
                            style={{ backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 }}
                            onPress={() => handleAprovarUsuario(u)}
                          >
                            <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>🔓 Reativar Acesso</Text>
                          </TouchableOpacity>
                        ) : !isCoord ? (
                          <TouchableOpacity
                            style={{ backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5' }}
                            onPress={() => handleRecusarUsuario(u)}
                          >
                            <Text style={{ color: '#b91c1c', fontSize: 10, fontWeight: '800' }}>Suspender</Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                          style={[
                            styles.toggleRoleBtn,
                            isCoord ? styles.btnDemote : styles.btnPromote,
                          ]}
                          onPress={() => handleAlterarNivelUsuario(u.id, nivelNum)}
                        >
                          <Text style={styles.toggleRoleBtnText}>
                            {isCoord ? '⬇️ Nível 1' : '⬆️ Nível 2'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 4. HISTÓRICO DE AUDITORIA — TODAS AS LIBERAÇÕES E RECUSAS */}
            <View style={[styles.sectionCard, { marginTop: 18 }, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={[styles.sectionHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>📋</Text>
                  </View>
                  <View>
                    <Text style={[styles.sectionTitle, { color: '#0369a1' }]}>
                      HISTÓRICO DE LIBERAÇÕES E RECUSAS (AUDITORIA)
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                      Registro permanente de cada ação de aprovação ou recusa realizada pela coordenação
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' }}
                  onPress={carregarHistoricoAprovacoesState}
                  disabled={loadingHistoricoAprovacoes}
                >
                  <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800' }}>
                    {loadingHistoricoAprovacoes ? '⏳ Carregando...' : '🔄 Atualizar'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.versionTableContainer, { marginTop: 14 }]}>
                <View style={styles.versionTableHeaderRow}>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>DATA / HORA</Text>
                  <Text style={[styles.versionHeaderColText, { width: 180 }]}>USUÁRIO / PREPOSTO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 120, textAlign: 'center' }]}>AÇÃO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>EXECUTADO POR</Text>
                  <Text style={[styles.versionHeaderColText, { flex: 1 }]}>MOTIVO / DETALHES</Text>
                </View>

                {loadingHistoricoAprovacoes ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#0284c7" />
                    <Text style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Carregando histórico de auditoria...</Text>
                  </View>
                ) : historicoAprovacoes.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                      Nenhum registro de aprovação ou recusa gravado até o momento.
                    </Text>
                  </View>
                ) : (
                  historicoAprovacoes.map((item, idx) => {
                    const dataStr = item.data_registro
                      ? new Date(item.data_registro).toLocaleString('pt-BR')
                      : 'N/A';
                    const isAprov = item.acao === 'aprovado';

                    return (
                      <View
                        key={item.id || idx}
                        style={[
                          styles.versionTableRow,
                          idx % 2 === 1 && { backgroundColor: '#f8fafc' },
                        ]}
                      >
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>
                            🕒 {dataStr}
                          </Text>
                        </View>
                        <View style={{ width: 180 }}>
                          <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 12 }} numberOfLines={1}>
                            {item.nome || item.username}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 10 }}>
                            @{item.username}
                          </Text>
                        </View>
                        <View style={{ width: 120, alignItems: 'center', justifyContent: 'center' }}>
                          <View
                            style={{
                              backgroundColor: isAprov ? '#ecfdf5' : '#fee2e2',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 4,
                              borderWidth: 1,
                              borderColor: isAprov ? '#a7f3d0' : '#fca5a5',
                            }}
                          >
                            <Text
                              style={{
                                color: isAprov ? '#059669' : '#b91c1c',
                                fontSize: 10,
                                fontWeight: '900',
                              }}
                            >
                              {isAprov ? '✅ APROVADO' : '❌ RECUSADO'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#334155', fontWeight: '700', fontSize: 11 }} numberOfLines={1}>
                            👤 {item.executado_por || 'Coordenação'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#475569', fontSize: 11 }} numberOfLines={1}>
                            {item.motivo || '-'}
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
                    <Text style={styles.footerPreviewBadgeText}>{versoesList[0]?.versao || 'V1.2.4'}</Text>
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

        {/* ════════════════ ABA 5: SEGURANÇA, AUDITORIA & TELEMETRIA DE DISPOSITIVOS ════════════════ */}
        {activeTab === 'seguranca' && (
          <View style={styles.tabContent}>
            {/* 1. DISPOSITIVOS LOGADOS & AUDITORIA DE SESSÕES */}
            <View style={styles.cardContainer}>
              <View style={[styles.cardHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>📱</Text>
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: '#0f172a' }]}>
                      DISPOSITIVOS LOGADOS & AUDITORIA DE SESSÕES
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Identificação de aparelhos (ID/Telefone), IP de rede, sistema operacional e sessões ativas
                    </Text>
                  </View>
                </View>

                <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#86efac' }}>
                  <Text style={{ color: '#15803d', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                    {ultimosLogins.length} SESSÕES REGISTRADAS
                  </Text>
                </View>
              </View>

              <View style={[styles.versionTableContainer, { marginTop: 14 }]}>
                <View style={styles.versionTableHeaderRow}>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>USUÁRIO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 170 }]}>ID TELEFONE / DISPOSITIVO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>IP DE ORIGEM</Text>
                  <Text style={[styles.versionHeaderColText, { width: 160 }]}>APARELHO / MODELO</Text>
                  <Text style={[styles.versionHeaderColText, { flex: 1 }]}>SISTEMA & NAVEGADOR</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>DATA / HORA</Text>
                  <Text style={[styles.versionHeaderColText, { width: 130, textAlign: 'center' }]}>BLOQUEIO IP</Text>
                </View>

                {loadingSeguranca ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Carregando auditoria de dispositivos...</Text>
                  </View>
                ) : ultimosLogins.length === 0 ? (
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
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 12 }}>
                            {lg.username || `ID ${lg.usuario_id}`}
                          </Text>
                          <Text style={{ color: '#16a34a', fontSize: 10, fontWeight: '700' }}>● SESSÃO AUTORIZADA</Text>
                        </View>
                        <View style={{ width: 170 }}>
                          <View style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', alignSelf: 'flex-start' }}>
                            <Text style={{ color: '#334155', fontSize: 10, fontFamily: 'monospace', fontWeight: '800' }}>
                              🆔 {String(lg.deviceId || 'DEV-AUTH').replace(/^MMS-/i, '')}
                            </Text>
                          </View>
                        </View>
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#0369a1', fontSize: 11, fontFamily: 'monospace', fontWeight: '700' }}>
                            🌐 {lg.ip || '127.0.0.1'}
                          </Text>
                        </View>
                        <View style={{ width: 160 }}>
                          <Text style={{ color: '#0f172a', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                            📱 {lg.model || 'Aparelho Registrado'}
                          </Text>
                        </View>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: '#475569', fontSize: 11 }} numberOfLines={1}>
                            💻 {lg.os || 'OS'} • {lg.browser || 'Browser'}
                          </Text>
                        </View>
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>
                            🕒 {dataStr}
                          </Text>
                        </View>
                        <View style={{ width: 130, alignItems: 'center', justifyContent: 'center' }}>
                          {lg.ip && lg.ip !== '127.0.0.1' ? (
                            <TouchableOpacity
                              onPress={() => handleToggleBloquearIp(lg.ip, blockedIpsSet.has(lg.ip))}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingHorizontal: 8,
                                paddingVertical: 5,
                                borderRadius: 6,
                                backgroundColor: blockedIpsSet.has(lg.ip) ? '#fee2e2' : '#f8fafc',
                                borderWidth: 1,
                                borderColor: blockedIpsSet.has(lg.ip) ? '#fca5a5' : '#cbd5e1',
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={{ fontSize: 12 }}>{blockedIpsSet.has(lg.ip) ? '🚫' : '🔒'}</Text>
                              <Text style={{
                                fontSize: 10,
                                fontWeight: '900',
                                color: blockedIpsSet.has(lg.ip) ? '#b91c1c' : '#475569',
                              }}>
                                {blockedIpsSet.has(lg.ip) ? 'BLOQUEADO' : 'BLOQUEAR'}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={{ fontSize: 10, color: '#94a3b8' }}>-</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            {/* 2. ACESSOS AO GERADOR DE RELATÓRIOS (PÁGINA INICIAL / INDEX) */}
            <View style={[styles.cardContainer, { marginTop: 18 }]}>
              <View style={[styles.cardHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>📡</Text>
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: '#0284c7' }]}>
                      ACESSOS AO GERADOR DE RELATÓRIOS (PÁGINA INICIAL)
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Monitoramento e telemetria de cada aparelho conectado ao gerador (IP, modelo, ID e tela)
                    </Text>
                  </View>
                </View>

                <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#bae6fd' }}>
                  <Text style={{ color: '#0369a1', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                    {acessosGerador.length} ACESSOS CAPTURADOS
                  </Text>
                </View>
              </View>

              {/* Card Destaque: Telemetria do Último Dispositivo / Conexão Capturada */}
              {acessosGerador.length > 0 && (() => {
                const ultimo = acessosGerador[0];
                return (
                  <View style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: '#cbd5e1',
                    padding: 14,
                    marginTop: 14,
                    marginBottom: 4,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 16 }}>⚡</Text>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#0f172a', letterSpacing: 0.5 }}>
                          ÚLTIMO DISPOSITIVO DETECTADO NO GERADOR
                        </Text>
                      </View>
                      <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#bfdbfe' }}>
                        <Text style={{ color: '#1d4ed8', fontSize: 10, fontWeight: '800' }}>
                          🕒 {ultimo.data_tentativa ? new Date(ultimo.data_tentativa).toLocaleString('pt-BR') : 'Agora'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 170, backgroundColor: ultimo.isPrepostoDetectado ? '#f0fdf4' : '#ffffff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: ultimo.isPrepostoDetectado ? '#86efac' : '#e2e8f0' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: ultimo.isPrepostoDetectado ? '#15803d' : '#64748b', marginBottom: 2 }}>
                          {ultimo.isPrepostoDetectado ? 'PREPOSTO IDENTIFICADO:' : 'USUÁRIO / ORIGEM:'}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: ultimo.isPrepostoDetectado ? '#166534' : '#0f172a' }} numberOfLines={1}>
                          👤 {ultimo.username || 'Visitante Index'}
                        </Text>
                      </View>

                      <View style={{ flex: 1, minWidth: 170, backgroundColor: '#ffffff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 2 }}>
                          ID DO TELEFONE / DISPOSITIVO:
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563eb', fontFamily: 'monospace' }} numberOfLines={1}>
                          🔑 {String(ultimo.deviceId || 'DEV-...').replace(/^MMS-/i, '')}
                        </Text>
                      </View>

                      <View style={{ flex: 1, minWidth: 150, backgroundColor: '#ffffff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 2 }}>
                          IP DETECTADO (NUVEM):
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#0284c7', fontFamily: 'monospace' }} numberOfLines={1}>
                          🌐 {ultimo.ip || '127.0.0.1'}
                        </Text>
                        {ultimo.ip && ultimo.ip !== '127.0.0.1' && (
                          <TouchableOpacity
                            onPress={() => handleToggleBloquearIp(ultimo.ip, blockedIpsSet.has(ultimo.ip))}
                            style={{
                              marginTop: 6,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              alignSelf: 'flex-start',
                              backgroundColor: blockedIpsSet.has(ultimo.ip) ? '#fee2e2' : '#f1f5f9',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 4,
                              borderWidth: 1,
                              borderColor: blockedIpsSet.has(ultimo.ip) ? '#fca5a5' : '#cbd5e1',
                            }}
                          >
                            <Text style={{ fontSize: 11 }}>{blockedIpsSet.has(ultimo.ip) ? '🚫' : '🔒'}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '900', color: blockedIpsSet.has(ultimo.ip) ? '#b91c1c' : '#475569' }}>
                              {blockedIpsSet.has(ultimo.ip) ? 'IP BLOQUEADO' : 'BLOQUEAR IP'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={{ flex: 1, minWidth: 170, backgroundColor: '#ffffff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 2 }}>
                          APARELHO / MODELO:
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }} numberOfLines={1}>
                          📲 {ultimo.model || 'Aparelho Web'}
                        </Text>
                      </View>

                      <View style={{ flex: 1, minWidth: 190, backgroundColor: '#ffffff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 2 }}>
                          SISTEMA & NAVEGADOR:
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }} numberOfLines={1}>
                          ⚙️ {ultimo.os || 'OS'} • {ultimo.browser || 'Web'} {ultimo.screen ? `(${ultimo.screen})` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}

              <View style={[styles.versionTableContainer, { marginTop: 14 }]}>
                <View style={styles.versionTableHeaderRow}>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>ORIGEM / USUÁRIO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 170 }]}>ID DO TELEFONE / DISPOSITIVO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>IP DE ORIGEM</Text>
                  <Text style={[styles.versionHeaderColText, { width: 160 }]}>APARELHO DETECTADO</Text>
                  <Text style={[styles.versionHeaderColText, { flex: 1 }]}>SISTEMA & RESOLUÇÃO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>DATA / HORA</Text>
                  <Text style={[styles.versionHeaderColText, { width: 130, textAlign: 'center' }]}>BLOQUEIO IP</Text>
                </View>

                {loadingSeguranca ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#0284c7" />
                    <Text style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Carregando telemetria do gerador...</Text>
                  </View>
                ) : acessosGerador.length === 0 ? (
                  <View style={{ padding: 28, alignItems: 'center' }}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                      Nenhum registro de acesso à página inicial gravado até o momento.
                    </Text>
                  </View>
                ) : (
                  acessosGerador.map((ag, idx) => {
                    const dataStr = ag.data_tentativa || ag.data_login || ag.timestamp
                      ? new Date(ag.data_tentativa || ag.data_login || ag.timestamp).toLocaleString('pt-BR')
                      : 'N/A';
                    return (
                      <View
                        key={ag.id || idx}
                        style={[
                          styles.versionTableRow,
                          idx % 2 === 1 && { backgroundColor: '#f0f9ff' },
                        ]}
                      >
                        <View style={{ width: 140 }}>
                          <Text style={{ color: ag.isPrepostoDetectado ? '#047857' : '#0f172a', fontWeight: '800', fontSize: 12 }} numberOfLines={1}>
                            {ag.username || 'Visitante Index'}
                          </Text>
                          {ag.isPrepostoDetectado ? (
                            <View style={{ backgroundColor: '#ecfdf5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 2, borderWidth: 1, borderColor: '#a7f3d0' }}>
                              <Text style={{ color: '#065f46', fontSize: 9, fontWeight: '800' }}>📋 PREPOSTO (DO RELATÓRIO)</Text>
                            </View>
                          ) : (
                            <Text style={{ color: '#0284c7', fontSize: 10, fontWeight: '700', marginTop: 2 }}>⚡ PÁGINA INICIAL</Text>
                          )}
                        </View>
                        <View style={{ width: 170 }}>
                          <View style={{ backgroundColor: '#f8fafc', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', alignSelf: 'flex-start' }}>
                            <Text style={{ color: '#0f172a', fontSize: 10, fontFamily: 'monospace', fontWeight: '800' }}>
                              🆔 {String(ag.deviceId || 'DEV-001').replace(/^MMS-/i, '')}
                            </Text>
                          </View>
                        </View>
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#0284c7', fontSize: 11, fontFamily: 'monospace', fontWeight: '700' }}>
                            🌐 {ag.ip || '127.0.0.1'}
                          </Text>
                        </View>
                        <View style={{ width: 160 }}>
                          <Text style={{ color: '#0f172a', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                            📱 {ag.model || 'Aparelho Web'}
                          </Text>
                        </View>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: '#475569', fontSize: 11 }} numberOfLines={1}>
                            🖥️ {ag.os || 'OS'} • {ag.browser || 'Web'} {ag.screen ? `(${ag.screen})` : ''}
                          </Text>
                        </View>
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>
                            🕒 {dataStr}
                          </Text>
                        </View>
                        <View style={{ width: 130, alignItems: 'center', justifyContent: 'center' }}>
                          {ag.ip && ag.ip !== '127.0.0.1' ? (
                            <TouchableOpacity
                              onPress={() => handleToggleBloquearIp(ag.ip, blockedIpsSet.has(ag.ip))}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingHorizontal: 8,
                                paddingVertical: 5,
                                borderRadius: 6,
                                backgroundColor: blockedIpsSet.has(ag.ip) ? '#fee2e2' : '#f8fafc',
                                borderWidth: 1,
                                borderColor: blockedIpsSet.has(ag.ip) ? '#fca5a5' : '#cbd5e1',
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={{ fontSize: 12 }}>{blockedIpsSet.has(ag.ip) ? '🚫' : '🔒'}</Text>
                              <Text style={{
                                fontSize: 10,
                                fontWeight: '900',
                                color: blockedIpsSet.has(ag.ip) ? '#b91c1c' : '#475569',
                              }}>
                                {blockedIpsSet.has(ag.ip) ? 'BLOQUEADO' : 'BLOQUEAR'}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={{ fontSize: 10, color: '#94a3b8' }}>-</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            {/* 3. TENTATIVAS DE ACESSO FALHO (LOGINS MAL SUCEDIDOS) */}
            <View style={[styles.cardContainer, { marginTop: 18 }]}>
              <View style={[styles.cardHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>⚠️</Text>
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: '#dc2626' }]}>
                      ACESSOS FALHOS AO PAINEL (TENTATIVAS BLOQUEADAS)
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Tentativas incorretas de acesso à coordenação com identificação completa do aparelho e IP
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}>
                    <Text style={{ color: '#b91c1c', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                      {acessosFalhos.length} BLOQUEIOS REGISTRADOS
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
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>LOGIN DIGITADO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 170 }]}>ID DO DISPOSITIVO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>IP DE ORIGEM</Text>
                  <Text style={[styles.versionHeaderColText, { width: 160 }]}>APARELHO / MODELO</Text>
                  <Text style={[styles.versionHeaderColText, { flex: 1 }]}>SISTEMA / DETALHES</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140 }]}>DATA / HORA</Text>
                  <Text style={[styles.versionHeaderColText, { width: 130, textAlign: 'center' }]}>BLOQUEIO IP</Text>
                </View>

                {loadingSeguranca ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#dc2626" />
                    <Text style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Carregando histórico de bloqueios...</Text>
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
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#dc2626', fontWeight: '800', fontSize: 12 }}>
                            {af.username || 'Desconhecido'}
                          </Text>
                          <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: '700' }}>❌ SENHA INVÁLIDA</Text>
                        </View>
                        <View style={{ width: 170 }}>
                          <View style={{ backgroundColor: '#fff1f2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#fecdd3', alignSelf: 'flex-start' }}>
                            <Text style={{ color: '#be123c', fontSize: 10, fontFamily: 'monospace', fontWeight: '800' }}>
                              🆔 {String(af.deviceId || 'DEV-FALHA').replace(/^MMS-/i, '')}
                            </Text>
                          </View>
                        </View>
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#475569', fontSize: 11, fontFamily: 'monospace', fontWeight: '700' }}>
                            🌐 {af.ip || '127.0.0.1'}
                          </Text>
                        </View>
                        <View style={{ width: 160 }}>
                          <Text style={{ color: '#0f172a', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                            📱 {af.model || 'Aparelho Detectado'}
                          </Text>
                        </View>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }} numberOfLines={1}>
                            {af.os ? `💻 ${af.os} • ${af.browser}` : (af.user_agent || 'App / Browser')}
                          </Text>
                        </View>
                        <View style={{ width: 140 }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>
                            🕒 {dataStr}
                          </Text>
                        </View>
                        <View style={{ width: 130, alignItems: 'center', justifyContent: 'center' }}>
                          {af.ip && af.ip !== '127.0.0.1' ? (
                            <TouchableOpacity
                              onPress={() => handleToggleBloquearIp(af.ip, blockedIpsSet.has(af.ip))}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingHorizontal: 8,
                                paddingVertical: 5,
                                borderRadius: 6,
                                backgroundColor: blockedIpsSet.has(af.ip) ? '#fee2e2' : '#f8fafc',
                                borderWidth: 1,
                                borderColor: blockedIpsSet.has(af.ip) ? '#fca5a5' : '#cbd5e1',
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={{ fontSize: 12 }}>{blockedIpsSet.has(af.ip) ? '🚫' : '🔒'}</Text>
                              <Text style={{
                                fontSize: 10,
                                fontWeight: '900',
                                color: blockedIpsSet.has(af.ip) ? '#b91c1c' : '#475569',
                              }}>
                                {blockedIpsSet.has(af.ip) ? 'BLOQUEADO' : 'BLOQUEAR'}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={{ fontSize: 10, color: '#94a3b8' }}>-</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            {/* 4. FIREWALL DO GERADOR — IPS BLOQUEADOS */}
            <View style={[styles.cardContainer, { marginTop: 18 }]}>
              <View style={[styles.cardHeader, { borderBottomColor: '#f1f5f9', paddingBottom: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>🚫</Text>
                  </View>
                  <View>
                    <Text style={[styles.cardTitle, { color: '#dc2626' }]}>
                      FIREWALL DO GERADOR — IPS BLOQUEADOS
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Endereços IP permanentemente impedidos de carregar a página inicial e emitir relatórios
                    </Text>
                  </View>
                </View>

                <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}>
                  <Text style={{ color: '#b91c1c', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                    {ipsBloqueados.length} IPS BLOQUEADOS
                  </Text>
                </View>
              </View>

              {/* Formulário Manual para Bloqueio de IP */}
              <View style={{ backgroundColor: '#f8fafc', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155', marginBottom: 8 }}>
                  BLOQUEAR UM NOVO ENDEREÇO IP MANUALMENTE
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TextInput
                    style={{
                      flex: 1,
                      minWidth: 200,
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      fontSize: 13,
                      fontFamily: 'monospace',
                      color: '#0f172a',
                    }}
                    value={inputIpManual}
                    onChangeText={setInputIpManual}
                    placeholder="Ex: 187.12.34.56"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#dc2626',
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onPress={handleBloquearIpManual}
                    disabled={salvandoBloqueioIp}
                    activeOpacity={0.85}
                  >
                    {salvandoBloqueioIp ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Text style={{ fontSize: 13 }}>🚫</Text>
                        <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                          BLOQUEAR IP
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tabela de IPs Bloqueados */}
              <View style={[styles.versionTableContainer, { marginTop: 14 }]}>
                <View style={styles.versionTableHeaderRow}>
                  <Text style={[styles.versionHeaderColText, { width: 180 }]}>ENDEREÇO IP BLOQUEADO</Text>
                  <Text style={[styles.versionHeaderColText, { width: 180 }]}>DATA DO BLOQUEIO</Text>
                  <Text style={[styles.versionHeaderColText, { flex: 1 }]}>BLOQUEADO POR</Text>
                  <Text style={[styles.versionHeaderColText, { width: 140, textAlign: 'center' }]}>AÇÃO</Text>
                </View>

                {loadingSeguranca ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#dc2626" />
                    <Text style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Carregando lista de IPs bloqueados...</Text>
                  </View>
                ) : ipsBloqueados.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: '#059669', fontSize: 12, fontWeight: '700' }}>
                      ✅ Nenhum IP bloqueado no momento. Todos os dispositivos possuem acesso ao gerador.
                    </Text>
                  </View>
                ) : (
                  ipsBloqueados.map((item, idx) => {
                    const dataStr = item.data_bloqueio
                      ? new Date(item.data_bloqueio).toLocaleString('pt-BR')
                      : 'N/A';
                    return (
                      <View
                        key={item.ip || idx}
                        style={[
                          styles.versionTableRow,
                          idx % 2 === 1 && { backgroundColor: '#fff5f5' },
                        ]}
                      >
                        <View style={{ width: 180 }}>
                          <Text style={{ color: '#dc2626', fontFamily: 'monospace', fontWeight: '800', fontSize: 12 }}>
                            🚫 {item.ip}
                          </Text>
                        </View>
                        <View style={{ width: 180 }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>
                            🕒 {dataStr}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 11 }}>
                            👤 {item.bloqueado_por || 'Coordenação'}
                          </Text>
                        </View>
                        <View style={{ width: 140, alignItems: 'center', justifyContent: 'center' }}>
                          <TouchableOpacity
                            onPress={() => handleToggleBloquearIp(item.ip, true)}
                            style={{
                              backgroundColor: '#fee2e2',
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: '#fca5a5',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 12 }}>🔓</Text>
                            <Text style={{ color: '#b91c1c', fontSize: 10, fontWeight: '800' }}>
                              DESBLOQUEAR
                            </Text>
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
                  <Text style={[styles.versionColAcoes, styles.versionHeaderColText]}>AÇÃO</Text>
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
                        <View style={styles.versionColAcoes}>
                          <TouchableOpacity
                            style={styles.btnExcluirVersao}
                            onPress={() => handleExcluirVersao(v)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.btnExcluirVersaoText}>🗑️ Excluir</Text>
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

      {/* MODAL SELETOR DE MÊS E ANO INTERATIVO */}
      <Modal
        visible={isMonthPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMonthPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.monthPickerOverlay}
          activeOpacity={1}
          onPress={() => setIsMonthPickerOpen(false)}
        >
          <TouchableOpacity
            style={styles.monthPickerCard}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation?.()}
          >
            {/* Header */}
            <View style={styles.monthPickerHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 22 }}>🗓️</Text>
                <View>
                  <Text style={styles.monthPickerTitle}>SELECIONAR MÊS E ANO</Text>
                  <Text style={styles.monthPickerSubtitle}>Filtre relatórios, métricas e rankings por período</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.monthPickerCloseBtn}
                onPress={() => setIsMonthPickerOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.monthPickerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Controle de Navegação do Ano */}
            <View style={styles.monthPickerYearRow}>
              <TouchableOpacity
                style={styles.monthPickerYearNavBtn}
                onPress={() => setAnoFiltro((a) => a - 1)}
                activeOpacity={0.7}
              >
                <Text style={styles.monthPickerYearNavText}>◀</Text>
              </TouchableOpacity>

              <View style={styles.monthPickerYearDisplay}>
                <Text style={styles.monthPickerYearText}>{anoFiltro}</Text>
              </View>

              <TouchableOpacity
                style={styles.monthPickerYearNavBtn}
                onPress={() => setAnoFiltro((a) => a + 1)}
                activeOpacity={0.7}
              >
                <Text style={styles.monthPickerYearNavText}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Grid dos 12 Meses */}
            <View style={styles.monthPickerGrid}>
              {MESES_ABREV.map((abrev, idx) => {
                const isSelected = mesFiltro === idx;
                return (
                  <TouchableOpacity
                    key={abrev}
                    style={[
                      styles.monthPickerMonthBtn,
                      isSelected && styles.monthPickerMonthBtnActive,
                    ]}
                    onPress={() => {
                      setMesFiltro(idx);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.monthPickerMonthBtnText,
                        isSelected && styles.monthPickerMonthBtnTextActive,
                      ]}
                    >
                      {abrev}
                    </Text>
                    <Text
                      style={[
                        styles.monthPickerMonthSubText,
                        isSelected && { color: 'rgba(255,255,255,0.85)' },
                      ]}
                    >
                      {MESES_NOMES[idx].slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Ações do Rodapé */}
            <View style={styles.monthPickerFooter}>
              <TouchableOpacity
                style={styles.monthPickerBtnHoje}
                onPress={handleRedefinirMesAtual}
                activeOpacity={0.8}
              >
                <Text style={styles.monthPickerBtnHojeText}>↺ MÊS ATUAL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.monthPickerBtnConfirmar}
                onPress={() => handleFiltrarPorMesAno(mesFiltro, anoFiltro)}
                activeOpacity={0.85}
              >
                <Text style={styles.monthPickerBtnConfirmarText}>APLICAR FILTRO ›</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
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
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 40,
  },
  searchIcon: {
    marginRight: 8,
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    color: '#0f172a',
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
  versionColAcoes: {
    width: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnExcluirVersao: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnExcluirVersaoText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700',
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
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  overviewMonthSelectorLight: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  overviewMonthText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    fontFamily: modernFont,
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  overviewMonthChevron: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '900',
    marginLeft: 8,
  },
  overviewBtnFiltrar: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  overviewBtnFiltrarText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },

  /* ─── MODAL SELETOR DE MÊS E ANO ─── */
  monthPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    ...(Platform.OS === 'web'
      ? {
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      } as any
      : {}),
  },
  monthPickerCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  monthPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 16,
  },
  monthPickerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    fontFamily: modernFont,
    letterSpacing: 0.5,
  },
  monthPickerSubtitle: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
    fontFamily: modernFont,
  },
  monthPickerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerCloseText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '800',
  },
  monthPickerYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  monthPickerYearNavBtn: {
    width: 40,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerYearNavText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#2563eb',
  },
  monthPickerYearDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerYearText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    fontFamily: modernFont,
    letterSpacing: 1,
  },
  monthPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  monthPickerMonthBtn: {
    width: '23%',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerMonthBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  monthPickerMonthBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    fontFamily: modernFont,
  },
  monthPickerMonthBtnTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  monthPickerMonthSubText: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
    fontFamily: modernFont,
  },
  monthPickerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  monthPickerBtnHoje: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthPickerBtnHojeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  monthPickerBtnConfirmar: {
    flex: 1.5,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerBtnConfirmarText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.8,
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
  kpiMetricValueContainer: {
    minHeight: 44,
    justifyContent: 'center',
    marginVertical: 4,
  },
  kpiMetricLoadingBox: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
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
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 6,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    minWidth: '100%',
    boxSizing: 'border-box' as any,
    marginBottom: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  tabNavButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
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
  rankingHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  rankingSubTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    padding: 4,
    borderRadius: 12,
  },
  rankingSubTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  rankingSubTabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#b45309',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  rankingSubTabBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400e',
    letterSpacing: 0.6,
    fontFamily: modernFont,
  },
  rankingSubTabBtnTextActive: {
    color: '#78350f',
  },
  rankingSubTabPill: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
  },
  rankingSubTabPillActive: {
    backgroundColor: '#fef3c7',
  },
  rankingSubTabPillInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  rankingSubTabPillText: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: modernFont,
  },
  rankingSubTabPillTextActive: {
    color: '#92400e',
  },
  rankingSubTabPillTextInactive: {
    color: '#b45309',
  },
  rankingColPos: {
    width: 60,
    alignItems: 'center',
  },
  rankingColUser: {
    flex: 1,
    paddingHorizontal: 8,
  },
  rankingColEmpresa: {
    width: 170,
    paddingHorizontal: 8,
  },
  rankingColTotal: {
    width: 80,
    alignItems: 'center',
  },
  rankingAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingAvatarText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#2563eb',
    fontFamily: modernFont,
  },
  rankingUserSubText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
    fontFamily: modernFont,
  },
  rankingEmpresaTag: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  rankingEmpresaTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.4,
    fontFamily: modernFont,
  },
  rankingCompanyIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingProgressBarBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  rankingProgressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#0284c7',
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
  coordNavNotifBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  coordNavNotifBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    fontFamily: modernFont,
    textAlign: 'center',
    lineHeight: 12,
  },
  tabNavBadge: {
    marginLeft: 6,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabNavBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    fontFamily: modernFont,
  },
  coordSecurityAlertBanner: {
    backgroundColor: '#fff1f2',
    borderWidth: 1.5,
    borderColor: '#fda4af',
    borderRadius: 14,
    marginBottom: 16,
    padding: 14,
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  coordSecurityAlertBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coordSecurityAlertIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ffe4e6',
    borderWidth: 1,
    borderColor: '#fecdd3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coordSecurityAlertTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#be123c',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  coordSecurityAlertPill: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  coordSecurityAlertPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    fontFamily: modernFont,
    letterSpacing: 0.5,
  },
  coordSecurityAlertSub: {
    fontSize: 12,
    color: '#881337',
    fontWeight: '500',
    lineHeight: 17,
    fontFamily: modernFont,
  },
  coordSecurityAlertActionBox: {
    backgroundColor: '#be123c',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  coordSecurityAlertActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    fontFamily: modernFont,
  },
  coordSecurityAlertCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(190, 18, 60, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  coordSecurityAlertCloseBtnText: {
    color: '#be123c',
    fontSize: 13,
    fontWeight: '900',
  },

});

