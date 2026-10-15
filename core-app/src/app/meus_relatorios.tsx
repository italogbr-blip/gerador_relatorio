import React, { useEffect, useState } from 'react';
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
  Image,
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

export default function MeusRelatoriosScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [userSession, setUserSession] = useState<any>(null);
  const [relatorios, setRelatorios] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalRegistros, setTotalRegistros] = useState<number>(0);

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

  // Filtros
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('TODAS');
  const [filtroBusca, setFiltroBusca] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');
  const [pagina, setPagina] = useState<number>(1);
  const porPagina = 15;

  // Modal de Detalhes / Visualização de Relatório
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Custom Alert / Confirm Modal State
  const [customDialog, setCustomDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  // Carregar Relatórios do Supabase
  const fetchRelatorios = async (sessionParam = userSession) => {
    setLoading(true);
    try {
      let query = supabase
        .from('relatorios')
        .select('*', { count: 'exact' });

      // Se houver usuário autenticado, filtra os dele; se for visitante em demonstração, exibe os disponíveis
      if (sessionParam?.user?.id) {
        query = query.eq('usuario_id', sessionParam.user.id);
      }

      // Se filtro de empresa selecionado (diferente de TODAS)
      if (filtroEmpresa && filtroEmpresa !== 'TODAS') {
        query = query.eq('empresa', filtroEmpresa);
      }

      // Se houver busca por texto (unidade ou local)
      if (filtroBusca.trim()) {
        const term = `%${filtroBusca.trim()}%`;
        query = query.or(`unidade.ilike.${term},local_atendimento.ilike.${term}`);
      }

      // Filtro por Intervalo de Data (Início e Fim)
      if (filtroDataInicio) {
        query = query.gte('data_criacao', `${filtroDataInicio}T00:00:00`);
      }

      if (filtroDataFim) {
        query = query.lte('data_criacao', `${filtroDataFim}T23:59:59`);
      }

      // Paginação
      const from = (pagina - 1) * porPagina;
      const to = from + porPagina - 1;

      query = query.order('data_criacao', { ascending: false }).range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error('Erro ao buscar relatorios:', error.message);
      } else {
        setRelatorios(data || []);
        setTotalRegistros(count || 0);
      }
    } catch (err: any) {
      console.error('Exceção ao buscar relatorios:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Carregar Sessão do Usuário ao montar
  useEffect(() => {
    let currentSession: any = null;
    if (Platform.OS === 'web') {
      try {
        const saved = localStorage.getItem('app_user_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.user) {
            currentSession = parsed;
            setUserSession(parsed);
          }
        }
      } catch (e) {}
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const active = session?.user ? session : currentSession;
      if (active) setUserSession(active);
      fetchRelatorios(active);
    });
  }, []);

  useEffect(() => {
    fetchRelatorios(userSession);
  }, [filtroEmpresa, pagina, filtroDataInicio, filtroDataFim]);

  const handleApplyFilter = () => {
    setPagina(1);
    fetchRelatorios(userSession);
  };

  const handleClearFilter = () => {
    setFiltroEmpresa('TODAS');
    setFiltroBusca('');
    setFiltroDataInicio('');
    setFiltroDataFim('');
    setPagina(1);
  };

  // Excluir Relatório
  const handleExcluir = (id: number) => {
    setCustomDialog({
      visible: true,
      title: 'EXCLUIR RELATÓRIO',
      message: 'Tem certeza que deseja excluir este relatório? Esta ação não pode ser desfeita.',
      onConfirm: async () => {
        setCustomDialog((prev) => ({ ...prev, visible: false }));
        setLoading(true);
        const { error } = await supabase.from('relatorios').delete().eq('id', id);
        if (error) {
          alert('Erro ao excluir relatório: ' + error.message);
        } else {
          fetchRelatorios(userSession);
        }
      },
    });
  };

  // Abrir / Baixar PDF vinculado ao relatório
  const openReportPdf = (report: any) => {
    if (!report) return;
    const rawUrl = report.pdf_url || report.caminho_pdf;
    let url = formatReportPdfUrl(rawUrl);

    if (url && Platform.OS === 'web') {
      window.open(url, '_blank');
      return;
    }

    // Fallback para download no servidor PHP caso não haja URL salva no banco
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
    } else if (parsed?.pax_embarcando && typeof parsed.pax_embarcando === 'string') {
      embCount = parsed.pax_embarcando.split('\n').filter((l: string) => l.trim().length > 0).length;
    }
    if (parsed?.desembarcando && Array.isArray(parsed.desembarcando)) {
      desCount = parsed.desembarcando.length;
    } else if (parsed?.pax_desembarcando && typeof parsed.pax_desembarcando === 'string') {
      desCount = parsed.pax_desembarcando.split('\n').filter((l: string) => l.trim().length > 0).length;
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

    if (parsed?.horarios?.embarque_previsto || parsed?.horarios?.embarque_real) {
      msg += `⏰ *Embarque:* Prev. ${parsed.horarios.embarque_previsto || 'N/A'} | Real ${parsed.horarios.embarque_real || 'N/A'}\n`;
    }

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
    msg += `🌐 *Sistema Online:* https://relatorios.atmai.com.br`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(waUrl, '_blank');
    } else {
      Linking.openURL(waUrl);
    }
  };

  // Parser seguro de dados JSON registrados
  const parseReportData = (report: any) => {
    if (!report || !report.dados_json) return null;
    if (typeof report.dados_json === 'object') return report.dados_json;
    try {
      return JSON.parse(report.dados_json);
    } catch (e) {
      return null;
    }
  };

  // Badge de Empresa com Cores Curadas
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

  const totalPaginas = Math.ceil(totalRegistros / porPagina) || 1;
  const username = userSession?.user?.user_metadata?.name || userSession?.user?.email?.split('@')[0] || 'Usuário';

  return (
    <SafeAreaView style={[styles.container, !isDarkMode && { backgroundColor: '#f1f5f9' }]}>
      {/* Top Navbar */}
      <View style={[styles.navbar, !isDarkMode && { backgroundColor: '#ffffff', borderBottomColor: '#e2e8f0' }]}>
        <View style={styles.navLeft}>
          <Text style={[styles.navTitle, !isDarkMode && { color: '#0f172a' }]}>MEUS RELATÓRIOS</Text>
        </View>
        <View style={styles.navRight}>
          {/* Switch de Tema */}
          <TouchableOpacity
            style={styles.btnThemeToggle}
            onPress={toggleTheme}
            activeOpacity={0.8}
          >
            <Text style={styles.btnThemeToggleText}>{isDarkMode ? '🌙' : '☀️'}</Text>
          </TouchableOpacity>

          <Text style={[styles.navUserGreeting, !isDarkMode && { color: '#475569' }]}>
            Olá, <Text style={{ fontWeight: 'bold' }}>{username}</Text>
          </Text>
          <TouchableOpacity
            style={styles.btnVoltar}
            onPress={() => router.push('/')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnVoltarText}>← VOLTAR AO GERADOR</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.mainCard, !isDarkMode && { backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderWidth: 1 }]}>
          {/* Header Title */}
          <View style={styles.headerBox}>
            <Text style={[styles.pageTitle, !isDarkMode && { color: '#0f172a' }]}>HISTÓRICO DE RELATÓRIOS.</Text>
            <Text style={styles.pageSubTitle}>
              Consulte todos os relatórios gerados e salvos.
            </Text>
          </View>

          {/* Filtros */}
          <View style={[styles.filterCard, !isDarkMode && { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}>
            <View style={styles.filterGrid}>
              {/* Filtro Empresa */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>EMPRESA</Text>
                <View style={styles.selectWrapper}>
                  {EMPRESAS.map((emp) => (
                    <TouchableOpacity
                      key={emp}
                      style={[
                        styles.empresaChip,
                        filtroEmpresa === emp && styles.empresaChipActive,
                      ]}
                      onPress={() => setFiltroEmpresa(emp)}
                    >
                      <Text
                        style={[
                          styles.empresaChipText,
                          filtroEmpresa === emp && styles.empresaChipTextActive,
                        ]}
                      >
                        {emp}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Filtro por Intervalo de Data */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>PERÍODO (INTERVALO DE DATAS)</Text>
                <View style={styles.dateFilterContainer}>
                  <View style={styles.dateFieldWrapper}>
                    <Text style={styles.dateFieldTag}>DE:</Text>
                    <TextInput
                      style={styles.dateInputBox}
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor="#94a3b8"
                      value={filtroDataInicio}
                      onChangeText={setFiltroDataInicio}
                    />
                  </View>
                  <View style={styles.dateFieldWrapper}>
                    <Text style={styles.dateFieldTag}>ATÉ:</Text>
                    <TextInput
                      style={styles.dateInputBox}
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor="#94a3b8"
                      value={filtroDataFim}
                      onChangeText={setFiltroDataFim}
                    />
                  </View>
                </View>
              </View>

              {/* Busca por Texto */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>BUSCAR UNIDADE OU LOCAL</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Digite o nome da unidade ou cidade..."
                    placeholderTextColor="#94a3b8"
                    value={filtroBusca}
                    onChangeText={setFiltroBusca}
                    onSubmitEditing={handleApplyFilter}
                  />
                  <TouchableOpacity
                    style={styles.btnFiltrar}
                    onPress={handleApplyFilter}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnFiltrarText}>🔍 FILTRAR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnLimpar}
                    onPress={handleClearFilter}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnLimparText}>LIMPAR</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Totalizador */}
            <View style={styles.counterRow}>
              <Text style={styles.counterText}>
                Mostrando <Text style={{ fontWeight: '900', color: '#1e293b' }}>{relatorios.length}</Text> de{' '}
                <Text style={{ fontWeight: '900', color: '#1e293b' }}>{totalRegistros}</Text> relatórios salvos
              </Text>
            </View>
          </View>

          {/* Conteúdo: Tabela (Desktop) ou Cards (Mobile) */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>Carregando relatórios...</Text>
            </View>
          ) : relatorios.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>Nenhum relatório encontrado</Text>
              <Text style={styles.emptySub}>
                {userSession
                  ? 'Você ainda não salvou relatórios ou altere os filtros de busca acima.'
                  : 'Faça login para salvar e visualizar o histórico dos seus relatórios.'}
              </Text>
            </View>
          ) : isMobile ? (
            /* Cards Mobile */
            <View style={styles.cardsGridMobile}>
              {relatorios.map((r) => (
                <View key={r.id} style={styles.reportCardMobile}>
                  <View style={styles.cardMobileHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardMobileTitle}>{r.unidade || 'Sem Unidade'}</Text>
                      <Text style={styles.cardMobileDate}>
                        📅 {new Date(r.data_criacao).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(r.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    {renderEmpresaBadge(r.empresa)}
                  </View>

                  <View style={styles.cardMobileBody}>
                    <Text style={styles.cardMobileLocal}>
                      📍 <Text style={{ fontWeight: 'bold' }}>Local:</Text> {r.local_atendimento || 'N/A'}
                    </Text>
                    <View style={styles.cardMobileTagsRow}>
                      {r.teve_anexo ? (
                        <View style={[styles.anexoBadge, { backgroundColor: '#ecfdf5' }]}>
                          <Text style={[styles.anexoBadgeText, { color: '#047857' }]}>📷 COM FOTOS</Text>
                        </View>
                      ) : (
                        <View style={[styles.anexoBadge, { backgroundColor: '#f1f5f9' }]}>
                          <Text style={[styles.anexoBadgeText, { color: '#64748b' }]}>SEM FOTOS</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardMobileFooter}>
                    <TouchableOpacity
                      style={styles.btnActionVer}
                      onPress={() => setSelectedReport(r)}
                    >
                      <Text style={styles.btnActionVerText}>👁️ VER</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnActionPdf}
                      onPress={() => openReportPdf(r)}
                    >
                      <Text style={styles.btnActionPdfText}>📄 PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnActionWhats}
                      onPress={() => shareWhatsApp(r)}
                    >
                      <Text style={styles.btnActionWhatsText}>💬 ZAP</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnActionExcluir}
                      onPress={() => handleExcluir(r.id)}
                    >
                      <Text style={styles.btnActionExcluirText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            /* Tabela Desktop */
            <View style={styles.tableContainer}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thCell, { flex: 1.5 }]}>DATA / HORA</Text>
                <Text style={[styles.thCell, { flex: 2 }]}>UNIDADE</Text>
                <Text style={[styles.thCell, { flex: 2 }]}>LOCAL DE ATENDIMENTO</Text>
                <Text style={[styles.thCell, { flex: 1.5, textAlign: 'center' }]}>EMPRESA</Text>
                <Text style={[styles.thCell, { flex: 0.8, textAlign: 'center' }]}>FOTOS</Text>
                <Text style={[styles.thCell, { flex: 2.6, textAlign: 'center' }]}>AÇÃO</Text>
              </View>

              {relatorios.map((r, idx) => (
                <View
                  key={r.id}
                  style={[
                    styles.tableBodyRow,
                    idx % 2 === 1 && { backgroundColor: '#f8fafc' },
                  ]}
                >
                  <Text style={[styles.tdCell, { flex: 1.5, fontSize: 12 }]}>
                    {new Date(r.data_criacao).toLocaleDateString('pt-BR')} {new Date(r.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={[styles.tdCell, { flex: 2, fontWeight: 'bold', color: '#1d4ed8' }]} numberOfLines={1}>
                    {r.unidade || 'N/A'}
                  </Text>
                  <Text style={[styles.tdCell, { flex: 2, color: '#475569' }]} numberOfLines={1}>
                    {r.local_atendimento || 'N/A'}
                  </Text>
                  <View style={[{ flex: 1.5, alignItems: 'center', justifyContent: 'center' }]}>
                    {renderEmpresaBadge(r.empresa)}
                  </View>
                  <View style={[{ flex: 0.8, alignItems: 'center', justifyContent: 'center' }]}>
                    {r.teve_anexo ? (
                      <View style={[styles.anexoBadge, { backgroundColor: '#ecfdf5' }]}>
                        <Text style={[styles.anexoBadgeText, { color: '#047857' }]}>SIM</Text>
                      </View>
                    ) : (
                      <View style={[styles.anexoBadge, { backgroundColor: '#f1f5f9' }]}>
                        <Text style={[styles.anexoBadgeText, { color: '#64748b' }]}>NÃO</Text>
                      </View>
                    )}
                  </View>

                  <View style={[{ flex: 2.6, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' }]}>
                    <TouchableOpacity
                      style={styles.btnActionVer}
                      onPress={() => setSelectedReport(r)}
                    >
                      <Text style={styles.btnActionVerText}>👁️ VER</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnActionPdf}
                      onPress={() => openReportPdf(r)}
                    >
                      <Text style={styles.btnActionPdfText}>📄 PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnActionWhats}
                      onPress={() => shareWhatsApp(r)}
                    >
                      <Text style={styles.btnActionWhatsText}>💬 ZAP</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnActionExcluir}
                      onPress={() => handleExcluir(r.id)}
                    >
                      <Text style={styles.btnActionExcluirText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && (
            <View style={styles.paginationContainer}>
              <TouchableOpacity
                style={[styles.btnPageNav, pagina === 1 && styles.btnPageNavDisabled]}
                disabled={pagina === 1}
                onPress={() => setPagina((p) => Math.max(1, p - 1))}
              >
                <Text style={styles.btnPageNavText}>← ANTERIOR</Text>
              </TouchableOpacity>

              <Text style={styles.paginationText}>
                Página <Text style={{ fontWeight: 'bold' }}>{pagina}</Text> de{' '}
                <Text style={{ fontWeight: 'bold' }}>{totalPaginas}</Text>
              </Text>

              <TouchableOpacity
                style={[styles.btnPageNav, pagina === totalPaginas && styles.btnPageNavDisabled]}
                disabled={pagina === totalPaginas}
                onPress={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              >
                <Text style={styles.btnPageNavText}>PRÓXIMA →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal de Detalhes do Relatório Formatado */}
      <Modal visible={!!selectedReport} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.detailCard}>
            <TouchableOpacity
              style={styles.detailCloseBtn}
              onPress={() => setSelectedReport(null)}
            >
              <Text style={styles.detailCloseText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.detailTitle}>DETALHES DO RELATÓRIO #{selectedReport?.id}</Text>

            {selectedReport && (() => {
              const dataObj = parseReportData(selectedReport);
              const horarios = dataObj?.horarios || {};
              const saidasHotel = horarios?.saida_hotel || [];
              const fotos = dataObj?.fotos || [];

              return (
                <ScrollView
                  style={styles.detailScroll}
                  contentContainerStyle={styles.detailScrollContent}
                  showsVerticalScrollIndicator={true}
                >
                  {/* Botões Ações no Modal (PDF e WhatsApp) */}
                  <View style={styles.modalActionButtonsRow}>
                    <TouchableOpacity
                      style={styles.btnPdfDownloadModal}
                      onPress={() => openReportPdf(selectedReport)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnPdfDownloadModalText}>📄 BAIXAR PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnWhatsModal}
                      onPress={() => shareWhatsApp(selectedReport)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnWhatsModalText}>💬 WHATSAPP</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Grupo 1: Informações Principais */}
                  <View style={styles.detailSectionBox}>
                    <Text style={styles.detailSectionTitle}>📋 INFORMAÇÕES DA OPERAÇÃO</Text>

                    <View style={styles.detailGridRow}>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>EMPRESA / GRUPO:</Text>
                        <Text style={styles.detailVal}>{dataObj?.grupo || selectedReport.empresa}</Text>
                      </View>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>UNIDADE:</Text>
                        <Text style={styles.detailVal}>{dataObj?.unidade || selectedReport.unidade}</Text>
                      </View>
                    </View>

                    <View style={styles.detailGridRow}>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>LOCAL DE ATENDIMENTO:</Text>
                        <Text style={styles.detailVal}>{dataObj?.local || selectedReport.local_atendimento || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>MODAL:</Text>
                        <Text style={styles.detailVal}>{dataObj?.modal || 'Helicóptero'}</Text>
                      </View>
                    </View>

                    <View style={styles.detailGridRow}>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>PREPOSTO RESPONSÁVEL:</Text>
                        <Text style={styles.detailVal}>{dataObj?.preposto || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>DATA DE CRIAÇÃO:</Text>
                        <Text style={styles.detailVal}>
                          {new Date(selectedReport.data_criacao).toLocaleString('pt-BR')}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Grupo 2: Horários */}
                  <View style={styles.detailSectionBox}>
                    <Text style={styles.detailSectionTitle}>⏰ HORÁRIOS REGISTRADOS</Text>

                    {saidasHotel.length > 0 ? (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={styles.detailSubLabel}>SAÍDAS DO HOTEL:</Text>
                        {saidasHotel.map((sh: any, sIdx: number) => (
                          <View key={sIdx} style={styles.saidaRowBox}>
                            <Text style={styles.saidaRowText}>
                              Previsto: <Text style={{ fontWeight: 'bold' }}>{sh.h1 ? `${sh.h1}:${sh.m1 || '00'}` : 'N/A'}</Text> | Real: <Text style={{ fontWeight: 'bold' }}>{sh.h2 ? `${sh.h2}:${sh.m2 || '00'}` : 'N/A'}</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.detailGridRow}>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>EMBARQUE PREVISTO:</Text>
                        <Text style={styles.detailVal}>{horarios.embarque_previsto || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>EMBARQUE REAL:</Text>
                        <Text style={styles.detailVal}>{horarios.embarque_real || 'N/A'}</Text>
                      </View>
                    </View>

                    <View style={styles.detailGridRow}>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>ATENDIMENTO INÍCIO:</Text>
                        <Text style={styles.detailVal}>{horarios.atendimento_inicio || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>ATENDIMENTO FIM:</Text>
                        <Text style={styles.detailVal}>{horarios.atendimento_fim || 'N/A'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Grupo 3: Informações e Observações */}
                  {Boolean(dataObj?.info_troca || dataObj?.observacao_nome_arquivo) ? (
                    <View style={styles.detailSectionBox}>
                      <Text style={styles.detailSectionTitle}>📝 PASSAGEM DE INFORMAÇÕES & OBSERVAÇÕES</Text>
                      {dataObj?.info_troca ? (
                        <View style={{ marginBottom: 8 }}>
                          <Text style={styles.detailSubLabel}>INFORMAÇÕES ADICIONAIS:</Text>
                          <Text style={styles.detailTextBlock}>{dataObj.info_troca}</Text>
                        </View>
                      ) : null}
                      {dataObj?.observacao_nome_arquivo ? (
                        <View>
                          <Text style={styles.detailSubLabel}>OBSERVAÇÃO ARQUIVO:</Text>
                          <Text style={styles.detailTextBlock}>{dataObj.observacao_nome_arquivo}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Grupo 4: PAX Embarcando / Desembarcando */}
                  <View style={styles.detailSectionBox}>
                    <Text style={styles.detailSectionTitle}>👥 RELAÇÃO DE PASSAGEIROS (PAX)</Text>

                    <View style={styles.paxDetailGrid}>
                      <View style={styles.paxDetailCardEmbarque}>
                        <Text style={styles.paxDetailTitleEmbarque}>🟢 EMBARCANDO</Text>
                        <Text style={styles.paxDetailContent}>
                          {dataObj?.pax_embarcando || 'Nenhum passageiro informado'}
                        </Text>
                      </View>

                      <View style={styles.paxDetailCardDesembarque}>
                        <Text style={styles.paxDetailTitleDesembarque}>🔴 DESEMBARCANDO</Text>
                        <Text style={styles.paxDetailContent}>
                          {dataObj?.pax_desembarcando || 'Nenhum passageiro informado'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Grupo 5: Fotos Anexadas */}
                  {fotos.length > 0 ? (
                    <View style={styles.detailSectionBox}>
                      <Text style={styles.detailSectionTitle}>📷 ANEXOS FOTOGRÁFICOS ({fotos.length})</Text>
                      <View style={styles.fotosDetailGrid}>
                        {fotos.map((f: any, fIdx: number) => (
                          <View key={fIdx} style={styles.fotoDetailCard}>
                            {f.base64 || f.uri ? (
                              <Image source={{ uri: f.base64 || f.uri }} style={styles.fotoDetailImg} resizeMode="cover" />
                            ) : null}
                            <Text style={styles.fotoDetailTitle}>{f.titulo || `ANEXO ${fIdx + 1}`}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Custom Confirm Dialog */}
      <Modal visible={customDialog.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{customDialog.title}</Text>
            <Text style={styles.confirmMsg}>{customDialog.message}</Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.btnCancelDialog}
                onPress={() => setCustomDialog((prev) => ({ ...prev, visible: false }))}
              >
                <Text style={styles.btnCancelDialogText}>CANCELAR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnConfirmDialog}
                onPress={customDialog.onConfirm}
              >
                <Text style={styles.btnConfirmDialogText}>EXCLUIR</Text>
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
  navbar: {
    height: 60,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navTitle: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1.5,
    fontFamily: modernFont,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  btnThemeToggle: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  btnThemeToggleText: {
    fontSize: 16,
  },
  navUserGreeting: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: modernFont,
  },
  btnVoltar: {
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnVoltarText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  scrollContent: {
    padding: 16,
    alignItems: 'center',
  },
  mainCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 1080,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  headerBox: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1e293b',
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  pageSubTitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    fontFamily: modernFont,
  },
  filterCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  filterGrid: {
    gap: 16,
  },
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  selectWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  empresaChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  empresaChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  empresaChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    fontFamily: modernFont,
  },
  empresaChipTextActive: {
    color: '#ffffff',
  },
  dateFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dateFieldWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateFieldTag: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  dateInputBox: {
    fontSize: 13,
    color: '#1e293b',
    fontFamily: modernFont,
    minWidth: 100,
    padding: 0,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  searchInput: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#1e293b',
    fontFamily: modernFont,
  },
  btnFiltrar: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFiltrarText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  btnLimpar: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLimparText: {
    color: '#475569',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  counterRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  counterText: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: modernFont,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    fontFamily: modernFont,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1e293b',
    fontFamily: modernFont,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
    fontFamily: modernFont,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  thCell: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tdCell: {
    fontSize: 13,
    color: '#1e293b',
    fontFamily: modernFont,
  },
  badgeContainer: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  anexoBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  anexoBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  btnActionVer: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  btnActionVerText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2563eb',
    fontFamily: modernFont,
  },
  btnActionPdf: {
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  btnActionPdfText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#4946e5',
    fontFamily: modernFont,
  },
  btnActionWhats: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  btnActionWhatsText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
    fontFamily: modernFont,
  },
  btnActionExcluir: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  btnActionExcluirText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#e11d48',
    fontFamily: modernFont,
  },
  cardsGridMobile: {
    gap: 12,
  },
  reportCardMobile: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  cardMobileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardMobileTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1d4ed8',
    fontFamily: modernFont,
  },
  cardMobileDate: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontFamily: modernFont,
  },
  cardMobileBody: {
    gap: 6,
  },
  cardMobileLocal: {
    fontSize: 12,
    color: '#334155',
    fontFamily: modernFont,
  },
  cardMobileTagsRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  cardMobileFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 24,
  },
  btnPageNav: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnPageNavDisabled: {
    opacity: 0.5,
  },
  btnPageNavText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
    fontFamily: modernFont,
  },
  paginationText: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: modernFont,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 680,
    maxHeight: '85%',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  detailCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  detailCloseText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1e293b',
    marginBottom: 16,
    letterSpacing: 1,
    fontFamily: modernFont,
    textAlign: 'center',
  },
  detailScroll: {
    flex: 1,
    marginTop: 4,
  },
  detailScrollContent: {
    paddingRight: 16, // Espaçamento elegante entre os boxes de conteúdo e a barra de rolagem
    paddingBottom: 16,
  },
  modalActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  btnPdfDownloadModal: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  btnPdfDownloadModalText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  btnWhatsModal: {
    flex: 1,
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  btnWhatsModalText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  detailSectionBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
    letterSpacing: 1,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 4,
    fontFamily: modernFont,
  },
  detailGridRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 12,
    flexWrap: 'wrap',
  },
  detailCol: {
    flex: 1,
    minWidth: 180,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  detailVal: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '700',
    marginTop: 2,
    fontFamily: modernFont,
  },
  detailSubLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    marginBottom: 4,
    fontFamily: modernFont,
  },
  saidaRowBox: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 4,
  },
  saidaRowText: {
    fontSize: 12,
    color: '#334155',
    fontFamily: modernFont,
  },
  detailTextBlock: {
    fontSize: 12,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    lineHeight: 18,
    fontFamily: modernFont,
  },
  paxDetailGrid: {
    gap: 10,
  },
  paxDetailCardEmbarque: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
    padding: 10,
  },
  paxDetailTitleEmbarque: {
    fontSize: 11,
    fontWeight: '900',
    color: '#047857',
    marginBottom: 6,
    fontFamily: modernFont,
  },
  paxDetailCardDesembarque: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 8,
    padding: 10,
  },
  paxDetailTitleDesembarque: {
    fontSize: 11,
    fontWeight: '900',
    color: '#be123c',
    marginBottom: 6,
    fontFamily: modernFont,
  },
  paxDetailContent: {
    fontSize: 12,
    color: '#1e293b',
    lineHeight: 18,
    fontFamily: modernFont,
  },
  fotosDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fotoDetailCard: {
    width: 120,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    paddingBottom: 6,
  },
  fotoDetailImg: {
    width: 120,
    height: 90,
  },
  fotoDetailTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#475569',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 4,
    fontFamily: modernFont,
  },
  confirmCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#e11d48',
    letterSpacing: 1,
    marginBottom: 8,
    fontFamily: modernFont,
  },
  confirmMsg: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: modernFont,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btnCancelDialog: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCancelDialogText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
    fontFamily: modernFont,
  },
  btnConfirmDialog: {
    flex: 1,
    backgroundColor: '#e11d48',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnConfirmDialogText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: modernFont,
  },
});
