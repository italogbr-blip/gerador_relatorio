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

  // Sessão do Usuário
  const [userSession, setUserSession] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  // Tema Claro / Escuro Persistente
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('app_theme_dark');
      if (saved !== null) {
        return saved === 'true';
      }
    }
    return true;
  });

  const toggleTheme = () => {
    const nextVal = !isDarkMode;
    setIsDarkMode(nextVal);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (nextVal) {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
      } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
      }
      try {
        localStorage.setItem('app_theme_dark', String(nextVal));
      } catch (e) {}
    }
  };

  // Abas do Painel: 'relatorios' | 'ranking' | 'usuarios' | 'popups' | 'sistema'
  const [activeTab, setActiveTab] = useState<'relatorios' | 'ranking' | 'usuarios' | 'popups' | 'sistema'>('relatorios');

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

  // Modal de Detalhes do Relatório
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Modal de Criação de Popup/Notificação
  const [isNovoPopupModalVisible, setIsNovoPopupModalVisible] = useState<boolean>(false);
  const [novoPopupTitulo, setNovoPopupTitulo] = useState<string>('');
  const [novoPopupMensagem, setNovoPopupMensagem] = useState<string>('');
  const [novoPopupTipo, setNovoPopupTipo] = useState<'aviso' | 'urgente' | 'feedback'>('aviso');
  const [salvandoPopup, setSalvandoPopup] = useState<boolean>(false);

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

  // Carregar Sessão do Usuário
  useEffect(() => {
    let sessionFound: any = null;
    if (Platform.OS === 'web') {
      try {
        const saved = localStorage.getItem('app_user_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.user) {
            sessionFound = parsed;
            setUserSession(parsed);
          }
        }
      } catch (e) {}
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const active = session?.user ? session : sessionFound;
      setUserSession(active);
      setAuthChecked(true);
      carregarDadosIniciais();
    });
  }, []);

  // Modo demonstração pública aberta a todos os visitantes
  const isCoordenador = true;

  // Carregamento de Métricas e Dados Iniciais
  const carregarDadosIniciais = async () => {
    setLoading(true);
    try {
      await Promise.all([
        carregarMetricas(),
        carregarRelatorios(),
        carregarUsuarios(),
        carregarPopups(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const carregarMetricas = async () => {
    try {
      // 1. Total Geral
      const { count: countTotal } = await supabase
        .from('relatorios')
        .select('*', { count: 'exact', head: true });
      setTotalRelatoriosGeral(countTotal || 0);

      // 2. Relatórios Hoje
      const hojeStr = new Date().toISOString().split('T')[0];
      const { count: countHoje } = await supabase
        .from('relatorios')
        .select('*', { count: 'exact', head: true })
        .gte('data_criacao', `${hojeStr}T00:00:00`);
      setRelatoriosHojeCount(countHoje || 0);

      // 3. Relatórios no Mês
      const agora = new Date();
      const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
      const { count: countMes } = await supabase
        .from('relatorios')
        .select('*', { count: 'exact', head: true })
        .gte('data_criacao', primeiroDiaMes);
      setRelatoriosMesCount(countMes || 0);
    } catch (e) {
      console.warn('Erro ao carregar métricas:', e);
    }
  };

  const carregarRelatorios = async () => {
    try {
      let query = supabase
        .from('relatorios')
        .select('*', { count: 'exact' });

      if (filtroEmpresa && filtroEmpresa !== 'TODAS') {
        query = query.eq('empresa', filtroEmpresa);
      }

      if (filtroBusca.trim()) {
        const term = `%${filtroBusca.trim()}%`;
        query = query.or(`unidade.ilike.${term},local_atendimento.ilike.${term},dados_json.ilike.${term}`);
      }

      if (filtroDataInicio) {
        query = query.gte('data_criacao', `${filtroDataInicio}T00:00:00`);
      }

      if (filtroDataFim) {
        query = query.lte('data_criacao', `${filtroDataFim}T23:59:59`);
      }

      const from = (paginaRelatorios - 1) * porPagina;
      const to = from + porPagina - 1;

      query = query.order('data_criacao', { ascending: false }).range(from, to);

      const { data, count, error } = await query;
      if (!error && data) {
        setRelatorios(data);
        if (count !== null) setTotalRelatoriosGeral(count);
      }
    } catch (e) {
      console.warn('Erro ao carregar relatórios do painel:', e);
    }
  };

  const carregarUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
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
    if (authChecked && isCoordenador) {
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

  // Compartilhar Resumo do Relatório via WhatsApp
  const shareWhatsApp = (report: any) => {
    if (!report) return;
    const parsed = parseReportData(report);
    const dataFormatada = report.data_criacao
      ? new Date(report.data_criacao).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : new Date().toLocaleDateString('pt-BR');

    const preposto = parsed?.preposto || report.preposto || 'Não informado';
    const empresa = (report.empresa || 'N/A').toUpperCase();
    const unidade = report.unidade || 'N/A';
    const local = report.local_atendimento || 'N/A';

    let embCount = 0;
    let desCount = 0;
    if (parsed?.embarcando && Array.isArray(parsed.embarcando)) {
      embCount = parsed.embarcando.length;
    }
    if (parsed?.desembarcando && Array.isArray(parsed.desembarcando)) {
      desCount = parsed.desembarcando.length;
    }

    const rawPdf = report.pdf_url || report.caminho_pdf;
    const pdfUrl = formatReportPdfUrl(rawPdf) || `${PHP_SERVER_URL}/download_pdf.php?id=${report.id}`;

    let msg = `📋 *RESUMO DO ATENDIMENTO OPERACIONAL*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏢 *Empresa:* ${empresa}\n`;
    msg += `⚓ *Unidade:* ${unidade}\n`;
    msg += `📍 *Local:* ${local}\n`;
    msg += `👤 *Preposto:* ${preposto}\n`;
    msg += `📅 *Data/Hora:* ${dataFormatada}\n`;

    if (embCount > 0 || desCount > 0) {
      msg += `👥 *Passageiros (PAX):* 🟢 ${embCount} Emb. | 🔴 ${desCount} Des.\n`;
    }

    if (parsed?.info_troca) {
      msg += `📝 *Observação:* ${parsed.info_troca}\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (pdfUrl) {
      msg += `📄 *Acessar PDF:* ${pdfUrl}\n`;
    }
    msg += `🌐 *Portal:* https://relatorios.atmai.com.br`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(waUrl, '_blank');
    } else {
      Linking.openURL(waUrl);
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

  // Toggle Status Pop-up
  const handleTogglePopup = async (popupId: number, statusAtual: boolean | number) => {
    const novoStatus = !(statusAtual === true || statusAtual === 1);
    try {
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

  return (
    <SafeAreaView style={[styles.container, !isDarkMode && { backgroundColor: '#f1f5f9' }]}>
      {/* Top Navbar */}
      <View style={[styles.navbar, !isDarkMode && { backgroundColor: '#ffffff', borderBottomColor: '#e2e8f0' }]}>
        <View style={styles.navLeft}>
          <View style={styles.coordBadgeIcon}>
            <Text style={{ fontSize: 16 }}>🛡️</Text>
          </View>
          <View>
            <Text style={[styles.navTitle, !isDarkMode && { color: '#0f172a' }]}>PAINEL DE COORDENAÇÃO</Text>
            <Text style={styles.navSubtitle}>SISTEMA OPERACIONAL (DEMONSTRAÇÃO PÚBLICA)</Text>
          </View>
        </View>

        <View style={styles.navRight}>
          <TouchableOpacity
            style={[styles.themeBtn, !isDarkMode && { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}
            onPress={toggleTheme}
            title="Alternar Tema Claro/Escuro"
          >
            <Text style={{ fontSize: 14 }}>{isDarkMode ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/')}
          >
            <Text style={styles.backButtonText}>← GERADOR</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* KPI Banner / Métricas */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, !isDarkMode && styles.kpiCardLight]}>
            <View style={styles.kpiHeaderRow}>
              <Text style={styles.kpiLabel}>TOTAL GERAL</Text>
              <Text style={styles.kpiIcon}>📊</Text>
            </View>
            <Text style={[styles.kpiValue, !isDarkMode && { color: '#0f172a' }]}>{totalRelatoriosGeral}</Text>
            <Text style={styles.kpiFootnote}>Relatórios emitidos</Text>
          </View>

          <View style={[styles.kpiCard, !isDarkMode && styles.kpiCardLight]}>
            <View style={styles.kpiHeaderRow}>
              <Text style={styles.kpiLabel}>NESTE MÊS</Text>
              <Text style={styles.kpiIcon}>📅</Text>
            </View>
            <Text style={[styles.kpiValue, { color: '#06b6d4' }]}>{relatoriosMesCount}</Text>
            <Text style={styles.kpiFootnote}>Atendimentos no mês atual</Text>
          </View>

          <View style={[styles.kpiCard, !isDarkMode && styles.kpiCardLight]}>
            <View style={styles.kpiHeaderRow}>
              <Text style={styles.kpiLabel}>HOJE</Text>
              <Text style={styles.kpiIcon}>⚡</Text>
            </View>
            <Text style={[styles.kpiValue, { color: '#10b981' }]}>{relatoriosHojeCount}</Text>
            <Text style={styles.kpiFootnote}>Relatórios gerados hoje</Text>
          </View>

          <View style={[styles.kpiCard, !isDarkMode && styles.kpiCardLight]}>
            <View style={styles.kpiHeaderRow}>
              <Text style={styles.kpiLabel}>USUÁRIOS</Text>
              <Text style={styles.kpiIcon}>👥</Text>
            </View>
            <Text style={[styles.kpiValue, { color: '#f59e0b' }]}>{usuarios.length}</Text>
            <Text style={styles.kpiFootnote}>Contas registradas</Text>
          </View>
        </View>

        {/* Abas de Navegação */}
        <View style={[styles.tabsContainer, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'relatorios' && styles.tabButtonActive]}
            onPress={() => setActiveTab('relatorios')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'relatorios' && styles.tabButtonTextActive]}>
              📊 Relatórios Gerais
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'ranking' && styles.tabButtonActive]}
            onPress={() => setActiveTab('ranking')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'ranking' && styles.tabButtonTextActive]}>
              🏆 Top Geradores
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'usuarios' && styles.tabButtonActive]}
            onPress={() => setActiveTab('usuarios')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'usuarios' && styles.tabButtonTextActive]}>
              👥 Usuários & Permissões
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'popups' && styles.tabButtonActive]}
            onPress={() => setActiveTab('popups')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'popups' && styles.tabButtonTextActive]}>
              📢 Comunicados In-App
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'sistema' && styles.tabButtonActive]}
            onPress={() => setActiveTab('sistema')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'sistema' && styles.tabButtonTextActive]}>
              ⚙️ Sistema & Status
            </Text>
          </TouchableOpacity>
        </View>

        {/* ════════════════ ABA 1: RELATÓRIOS GERAIS ════════════════ */}
        {activeTab === 'relatorios' && (
          <View style={styles.tabContent}>
            {/* Filtros */}
            <View style={[styles.filterCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={styles.filterRow}>
                <View style={styles.searchBox}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={[styles.searchInput, !isDarkMode && { color: '#0f172a' }]}
                    placeholder="Buscar unidade, local ou preposto..."
                    placeholderTextColor="#64748b"
                    value={filtroBusca}
                    onChangeText={setFiltroBusca}
                    onSubmitEditing={() => carregarRelatorios()}
                  />
                </View>

                {/* Filtro por Empresa */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.companyFilterScroll}>
                  {EMPRESAS.map((emp) => (
                    <TouchableOpacity
                      key={emp}
                      style={[
                        styles.companyPill,
                        filtroEmpresa === emp && styles.companyPillActive,
                        !isDarkMode && filtroEmpresa !== emp && { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
                      ]}
                      onPress={() => setFiltroEmpresa(emp)}
                    >
                      <Text
                        style={[
                          styles.companyPillText,
                          filtroEmpresa === emp && styles.companyPillTextActive,
                          !isDarkMode && filtroEmpresa !== emp && { color: '#475569' },
                        ]}
                      >
                        {emp}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Filtro de Datas */}
              <View style={styles.dateFilterRow}>
                <View style={styles.dateInputWrapper}>
                  <Text style={styles.dateLabel}>DE:</Text>
                  <TextInput
                    style={[styles.dateInput, !isDarkMode && { backgroundColor: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1' }]}
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor="#94a3b8"
                    value={filtroDataInicio}
                    onChangeText={setFiltroDataInicio}
                  />
                </View>

                <View style={styles.dateInputWrapper}>
                  <Text style={styles.dateLabel}>ATÉ:</Text>
                  <TextInput
                    style={[styles.dateInput, !isDarkMode && { backgroundColor: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1' }]}
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor="#94a3b8"
                    value={filtroDataFim}
                    onChangeText={setFiltroDataFim}
                  />
                </View>

                <TouchableOpacity
                  style={styles.filterApplyBtn}
                  onPress={() => {
                    setPaginaRelatorios(1);
                    carregarRelatorios();
                  }}
                >
                  <Text style={styles.filterApplyBtnText}>FILTRAR</Text>
                </TouchableOpacity>

                {Boolean(filtroBusca || filtroEmpresa !== 'TODAS' || filtroDataInicio || filtroDataFim) ? (
                  <TouchableOpacity
                    style={styles.filterClearBtn}
                    onPress={() => {
                      setFiltroBusca('');
                      setFiltroEmpresa('TODAS');
                      setFiltroDataInicio('');
                      setFiltroDataFim('');
                      setPaginaRelatorios(1);
                      carregarRelatorios();
                    }}
                  >
                    <Text style={styles.filterClearBtnText}>LIMPAR</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Listagem */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#06b6d4" />
                <Text style={styles.loadingText}>Carregando relatórios...</Text>
              </View>
            ) : relatorios.length === 0 ? (
              <View style={[styles.emptyBox, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>📭</Text>
                <Text style={[styles.emptyTitle, !isDarkMode && { color: '#0f172a' }]}>Nenhum relatório encontrado</Text>
                <Text style={styles.emptySubtitle}>Ajuste os filtros ou verifique a conexão com o banco de dados.</Text>
              </View>
            ) : (
              <View style={styles.reportsGrid}>
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
                  const preposto = parsed?.preposto || 'Não informado';

                  return (
                    <View
                      key={item.id}
                      style={[styles.reportCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}
                    >
                      <View style={styles.reportCardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.reportIdBadge}>#{item.id}</Text>
                          {renderEmpresaBadge(item.empresa)}
                        </View>
                        <Text style={styles.reportDateText}>{dataFormatada}</Text>
                      </View>

                      <View style={styles.reportCardBody}>
                        <Text style={[styles.reportUnidadeText, !isDarkMode && { color: '#0f172a' }]} numberOfLines={1}>
                          {item.unidade || 'Sem unidade'}
                        </Text>
                        <Text style={styles.reportLocalText} numberOfLines={1}>
                          📍 {item.local_atendimento || 'Local não definido'}
                        </Text>
                        <Text style={styles.reportPrepostoText} numberOfLines={1}>
                          👤 Preposto: <Text style={{ fontWeight: 'bold' }}>{preposto}</Text>
                        </Text>
                      </View>

                      <View style={styles.reportCardActions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnView]}
                          onPress={() => setSelectedReport(item)}
                        >
                          <Text style={styles.actionBtnViewText}>👁️ Ver Detalhes</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnPdf]}
                          onPress={() => openReportPdf(item)}
                        >
                          <Text style={styles.actionBtnPdfText}>📥 PDF</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnWhats]}
                          onPress={() => shareWhatsApp(item)}
                        >
                          <Text style={styles.actionBtnWhatsText}>💬 Zap</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnDelete]}
                          onPress={() => handleExcluirRelatorio(item.id)}
                        >
                          <Text style={styles.actionBtnDeleteText}>🗑️</Text>
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
              >
                <Text style={styles.pageBtnText}>← ANTERIOR</Text>
              </TouchableOpacity>

              <Text style={styles.pageIndicatorText}>Página {paginaRelatorios}</Text>

              <TouchableOpacity
                style={[styles.pageBtn, relatorios.length < porPagina && styles.pageBtnDisabled]}
                disabled={relatorios.length < porPagina}
                onPress={() => setPaginaRelatorios((p) => p + 1)}
              >
                <Text style={styles.pageBtnText}>PRÓXIMA →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ════════════════ ABA 2: RANKING / TOP GERADORES ════════════════ */}
        {activeTab === 'ranking' && (
          <View style={styles.tabContent}>
            <View style={[styles.sectionCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }]}>
              <View style={styles.sectionHeader}>
                <Text style={{ fontSize: 24 }}>🏆</Text>
                <View>
                  <Text style={[styles.sectionTitle, !isDarkMode && { color: '#0f172a' }]}>RANKING DE PREPOSTOS</Text>
                  <Text style={styles.sectionSubtitle}>Top geradores com maior volume de emissões registradas</Text>
                </View>
              </View>

              <View style={styles.rankingList}>
                {rankingGeradores.map((item, index) => {
                  const medalha = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}º`;
                  const percentual = totalRelatoriosGeral > 0
                    ? Math.round((item.total / totalRelatoriosGeral) * 100)
                    : 0;

                  return (
                    <View key={item.nome} style={[styles.rankingItem, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                      <View style={styles.rankingItemLeft}>
                        <Text style={styles.rankingMedal}>{medalha}</Text>
                        <View>
                          <Text style={[styles.rankingNome, !isDarkMode && { color: '#0f172a' }]}>{item.nome}</Text>
                          <Text style={styles.rankingEmpresa}>{item.empresa}</Text>
                        </View>
                      </View>

                      <View style={styles.rankingItemRight}>
                        <View style={styles.rankingBadge}>
                          <Text style={styles.rankingTotalText}>{item.total} relatórios</Text>
                        </View>
                        <Text style={styles.rankingPercentText}>{percentual}% do total</Text>
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
                  <Text style={styles.sysStatusLabel}>BANCO SUPABASE (POSTGRESQL)</Text>
                  <Text style={styles.sysStatusOnline}>● OPERACIONAL E CONECTADO</Text>
                  <Text style={styles.sysStatusInfo}>URL: https://xtlhrlbdpnnrcivpiomv.supabase.co</Text>
                </View>

                <View style={[styles.sysStatusCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Text style={styles.sysStatusLabel}>STORAGE DE PDFS (BUCKET)</Text>
                  <Text style={styles.sysStatusOnline}>● RELATORIOS_PDF ONLINE</Text>
                  <Text style={styles.sysStatusInfo}>Armazenamento direto na nuvem Supabase Storage</Text>
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
                  <Text style={[styles.sysStatusVal, !isDarkMode && { color: '#0f172a' }]}>v2.4.0 (Build Supabase)</Text>
                  <Text style={styles.sysStatusInfo}>Expo SDK 54 / React Native Web</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL DE DETALHES DO RELATÓRIO */}
      <Modal
        visible={!!selectedReport}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, !isDarkMode && { backgroundColor: '#ffffff' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, !isDarkMode && { color: '#0f172a' }]}>
                  RELATÓRIO #{selectedReport?.id}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {selectedReport?.empresa} • {selectedReport?.unidade}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedReport(null)}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedReport && (() => {
              const data = parseReportData(selectedReport) || {};
              const embList = data.embarcando || [];
              const desList = data.desembarcando || [];

              return (
                <ScrollView style={styles.detailScrollContent}>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>DADOS GERAIS DO ATENDIMENTO</Text>
                    <View style={styles.detailGrid}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>EMPRESA</Text>
                        <Text style={[styles.detailValue, !isDarkMode && { color: '#0f172a' }]}>{selectedReport.empresa}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>UNIDADE</Text>
                        <Text style={[styles.detailValue, !isDarkMode && { color: '#0f172a' }]}>{selectedReport.unidade}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>LOCAL</Text>
                        <Text style={[styles.detailValue, !isDarkMode && { color: '#0f172a' }]}>{selectedReport.local_atendimento}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>PREPOSTO</Text>
                        <Text style={[styles.detailValue, !isDarkMode && { color: '#0f172a' }]}>{data.preposto || 'N/A'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Passageiros */}
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionTitle, { color: '#10b981' }]}>
                      EMBARCANDO ({embList.length})
                    </Text>
                    {embList.length === 0 ? (
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Nenhum passageiro embarcando.</Text>
                    ) : (
                      embList.map((p: any, idx: number) => (
                        <View key={idx} style={styles.passengerRow}>
                          <Text style={[styles.passengerName, !isDarkMode && { color: '#0f172a' }]}>
                            {idx + 1}. {p.nome}
                          </Text>
                          <Text style={styles.passengerDoc}>{p.funcao || p.doc || 'N/A'}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionTitle, { color: '#f43f5e' }]}>
                      DESEMBARCANDO ({desList.length})
                    </Text>
                    {desList.length === 0 ? (
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Nenhum passageiro desembarcando.</Text>
                    ) : (
                      desList.map((p: any, idx: number) => (
                        <View key={idx} style={styles.passengerRow}>
                          <Text style={[styles.passengerName, !isDarkMode && { color: '#0f172a' }]}>
                            {idx + 1}. {p.nome}
                          </Text>
                          <Text style={styles.passengerDoc}>{p.funcao || p.doc || 'N/A'}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Ações do Modal */}
                  <View style={styles.modalBottomActions}>
                    <TouchableOpacity
                      style={styles.modalDownloadPdfBtn}
                      onPress={() => openReportPdf(selectedReport)}
                    >
                      <Text style={styles.modalDownloadPdfBtnText}>📥 BAIXAR PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalWhatsAppBtn}
                      onPress={() => shareWhatsApp(selectedReport)}
                    >
                      <Text style={styles.modalWhatsAppBtnText}>💬 WHATSAPP</Text>
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
        animationType="fade"
        onRequestClose={() => setIsNovoPopupModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
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
        animationType="fade"
        onRequestClose={() => setCustomDialog((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalOverlay}>
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
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
  },
  navbar: {
    height: 64,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
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

  // Paginação
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
  },
  pageBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  pageIndicatorText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },

  // Seções & Cards
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
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
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  restrictedCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    maxWidth: 440,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  restrictedTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: 1,
  },
  restrictedSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  restrictedBackBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  restrictedBackBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
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
});
