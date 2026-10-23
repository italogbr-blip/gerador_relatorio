import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { formatReportPdfUrl } from '../lib/config';
import {
  baixarPdfRelatorio,
  compartilharPdfRelatorio,
  gerarNomeArquivoPdf,
  gerarPdfBlob,
} from '../lib/pdfManager';
import { gerarHtmlPdfFidelidade, ReportPdfData } from '../lib/pdfHtmlGenerator';

const modernFont = Platform.OS === 'web'
  ? "'Inter', system-ui, -apple-system, sans-serif"
  : undefined;

export default function VerRelatorioScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const reportId = params.id ? String(params.id) : null;
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<any>(null);
  const [pdfData, setPdfData] = useState<ReportPdfData | null>(null);
  const [docHtml, setDocHtml] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const cachedBlobRef = useRef<{ blob: Blob; nomeArquivo: string } | null>(null);

  // Extrai ReportPdfData completo garantindo fidelidade de dados
  const extractPdfData = (rep: any): ReportPdfData => {
    let parsed: any = {};
    if (rep.dados_json) {
      if (typeof rep.dados_json === 'object') {
        parsed = rep.dados_json;
      } else {
        try {
          parsed = JSON.parse(rep.dados_json);
        } catch (_) {}
      }
    }

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

    const rawPreposto = parsed.preposto;
    const hasPrepostoValido =
      rawPreposto &&
      rawPreposto !== 'undefined' &&
      rawPreposto.trim() !== '' &&
      rawPreposto.trim().toUpperCase() !== 'N/A';

    // Se não tiver o nome do preposto, vincula o nome da unidade / relatório ao IP
    const prepostoFinal = hasPrepostoValido
      ? rawPreposto.trim()
      : (rep.unidade ? `${rep.unidade}${rep.ip_origem ? ` (IP: ${rep.ip_origem})` : ''}` : 'MMS');

    return {
      grupo: parsed.grupo || rep.empresa || 'MMS',
      unidade: rep.unidade || parsed.unidade || 'MMS',
      data: parsed.data || (rep.data_criacao ? rep.data_criacao.split('T')[0] : new Date().toISOString().split('T')[0]),
      local: parsed.local || parsed.local_atendimento || rep.local_atendimento || 'Macaé / Aeroporto',
      modal: parsed.modal || 'Helicóptero',
      preposto: prepostoFinal,
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

  useEffect(() => {
    async function carregarRelatorio() {
      if (!reportId) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('relatorios')
          .select('*')
          .eq('id', reportId)
          .single();

        if (error || !data) {
          setLoading(false);
          return;
        }

        setReport(data);
        const dataExtracted = extractPdfData(data);
        setPdfData(dataExtracted);

        const html = gerarHtmlPdfFidelidade(dataExtracted);
        setDocHtml(html);

        // Prepara em background o Blob para que o compartilhamento e download sejam 100% instantâneos
        if (Platform.OS === 'web') {
          const rawUrl = data.pdf_url || data.caminho_pdf;
          const formattedUrl = formatReportPdfUrl(rawUrl);
          gerarPdfBlob(dataExtracted, formattedUrl)
            .then((b) => {
              cachedBlobRef.current = b;
            })
            .catch(() => {});
        }
      } catch (err) {
        console.warn('Erro ao carregar relatório:', err);
      } finally {
        setLoading(false);
      }
    }

    carregarRelatorio();
  }, [reportId]);

  const handleVoltar = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.opener && !window.opener.closed) {
        window.close();
        return;
      }
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = '/painel_coord';
      return;
    }
    router.back();
  };

  const handleBaixar = async () => {
    if (!pdfData) return;
    setIsExporting(true);
    try {
      const rawUrl = report?.pdf_url || report?.caminho_pdf;
      const formattedUrl = formatReportPdfUrl(rawUrl);
      const res = await baixarPdfRelatorio(pdfData, formattedUrl);
      if (res.sucesso && Platform.OS !== 'web') {
        setFeedbackMsg({ tipo: 'sucesso', texto: `Arquivo ${res.nomeArquivo} baixado com sucesso!` });
      }
    } catch (e: any) {
      setFeedbackMsg({ tipo: 'erro', texto: e.message || 'Falha ao baixar o PDF.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCompartilhar = async () => {
    if (!pdfData) return;
    try {
      const rawUrl = report?.pdf_url || report?.caminho_pdf;
      const formattedUrl = formatReportPdfUrl(rawUrl);
      const fallbackUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? (formattedUrl || window.location.href)
        : undefined;

      // Chama a barra/navbar nativa de compartilhamento sem títulos adicionais
      const res = await compartilharPdfRelatorio(
        pdfData,
        fallbackUrl,
        formattedUrl,
        cachedBlobRef.current?.blob
      );

      if (!res.sucesso && res.metodo === 'not_supported') {
        setFeedbackMsg({
          tipo: 'erro',
          texto: 'Função de compartilhar não suportada neste navegador. Use o botão Baixar.',
        });
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setFeedbackMsg({ tipo: 'erro', texto: e?.message || 'Falha ao abrir menu de compartilhamento.' });
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerBox]}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={styles.loadingText}>Carregando relatório #{reportId}...</Text>
      </SafeAreaView>
    );
  }

  if (!report || !pdfData) {
    return (
      <SafeAreaView style={[styles.container, styles.centerBox]}>
        <Text style={{ fontSize: 42, marginBottom: 12 }}>⚠️</Text>
        <Text style={styles.notFoundTitle}>Relatório não encontrado</Text>
        <Text style={styles.notFoundSub}>O relatório #{reportId} não existe ou foi removido do banco de dados.</Text>
        <TouchableOpacity style={styles.btnVoltarNotFound} onPress={handleVoltar} activeOpacity={0.8}>
          <Text style={styles.btnVoltarNotFoundText}>← VOLTAR</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const dataFormatada = report.data_criacao
    ? new Date(report.data_criacao).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : pdfData.data || 'N/A';

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── TOOLBAR SUPERIOR IDÊNTICA AO VER_RELATORIO.PHP ─── */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <TouchableOpacity style={styles.toolbarBackBtn} onPress={handleVoltar} activeOpacity={0.8}>
            <Text style={styles.toolbarBackBtnText}>← VOLTAR</Text>
          </TouchableOpacity>
          <View style={styles.toolbarInfo}>
            <Text style={styles.toolbarTitle} numberOfLines={1}>
              RELATÓRIO #{report.id} - {pdfData.unidade}
            </Text>
            <Text style={styles.toolbarSubtitle} numberOfLines={1}>
              {report.empresa || 'MMS'} • Enviado em: {dataFormatada} • Preposto: {pdfData.preposto}
            </Text>
          </View>
        </View>

        <View style={styles.toolbarRight}>
          <TouchableOpacity
            style={styles.btnBaixar}
            onPress={handleBaixar}
            disabled={isExporting}
            activeOpacity={0.8}
          >
            <Text style={styles.btnBaixarText}>📥 BAIXAR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnCompartilhar}
            onPress={handleCompartilhar}
            activeOpacity={0.8}
          >
            <Text style={styles.btnCompartilharText}>📤 COMPARTILHAR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Alerta de Feedback se houver */}
      {feedbackMsg && (
        <View
          style={[
            styles.feedbackBox,
            feedbackMsg.tipo === 'sucesso' ? styles.feedbackSucesso : styles.feedbackErro,
          ]}
        >
          <Text style={styles.feedbackText}>{feedbackMsg.texto}</Text>
          <TouchableOpacity onPress={() => setFeedbackMsg(null)}>
            <Text style={styles.feedbackCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── CORPO DO DOCUMENTO (FOLHAS A4 EM ALTA FIDELIDADE) ─── */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
        {Platform.OS === 'web' ? (
          <div
            className="mms-relatorio-view-root"
            dangerouslySetInnerHTML={{ __html: docHtml }}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          />
        ) : (
          <View style={styles.nativeCardFallback}>
            <Text style={styles.nativeTitle}>Visualização de Documento</Text>
            <Text style={styles.nativeSub}>
              Utilize os botões acima para Baixar o PDF oficial ou Compartilhar diretamente no seu dispositivo.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  centerBox: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    fontFamily: modernFont,
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 6,
    fontFamily: modernFont,
  },
  notFoundSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 380,
    marginBottom: 20,
    fontFamily: modernFont,
  },
  btnVoltarNotFound: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnVoltarNotFoundText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: modernFont,
  },
  toolbar: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 100,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  toolbarBackBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  toolbarBackBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  toolbarInfo: {
    flex: 1,
  },
  toolbarTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  toolbarSubtitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: modernFont,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnBaixar: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  btnBaixarText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  btnCompartilhar: {
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  btnCompartilharText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  feedbackSucesso: {
    backgroundColor: '#ecfdf5',
    borderBottomWidth: 1,
    borderBottomColor: '#a7f3d0',
  },
  feedbackErro: {
    backgroundColor: '#fff1f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecdd3',
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: modernFont,
  },
  feedbackCloseText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748b',
    padding: 4,
  },
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  nativeCardFallback: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 12,
    maxWidth: 500,
    width: '100%',
    alignItems: 'center',
    marginTop: 40,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nativeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    fontFamily: modernFont,
  },
  nativeSub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: modernFont,
  },
});
