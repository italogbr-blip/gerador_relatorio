import React, { useEffect, useState, useRef, useMemo } from 'react';
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
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { obterRelatorioApi } from '../lib/api';
import { formatReportPdfUrl } from '../lib/config';
import {
  baixarPdfRelatorio,
  compartilharPdfRelatorio,
  gerarNomeArquivoPdf,
  gerarPdfBlob,
} from '../lib/pdfManager';
import { ReportPdfData } from '../lib/pdfHtmlGenerator';

const modernFont = Platform.OS === 'web'
  ? "'Inter', system-ui, -apple-system, sans-serif"
  : undefined;

// Formata horas no padrão do documento oficial: "HH h MM min"
const fmtHoraA4 = (h?: string, m?: string) => {
  if (h === 'N/A') return 'N/A';
  const blank = '\u00A0\u00A0\u00A0';
  return `${h || blank} h ${m || blank} min`;
};

// Formata data ISO (YYYY-MM-DD) para PT-BR (DD/MM/YYYY)
const formatarData = (val?: string) => {
  if (!val) return 'N/A';
  const parts = val.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : val;
};

export default function VerRelatorioScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const reportId = params.id ? String(params.id) : null;
  const { width: windowWidth } = useWindowDimensions();

  // Escala Responsiva do Documento A4 (Exatamente idêntica ao index.tsx)
  const a4BaseWidth = 794;
  const a4BaseHeight = 1123;
  const previewScale = windowWidth < (a4BaseWidth + 24)
    ? Math.min(1, Math.max(0.32, (windowWidth - 20) / a4BaseWidth))
    : 1;

  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<any>(null);
  const [pdfData, setPdfData] = useState<any>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const cachedBlobRef = useRef<{ blob: Blob; nomeArquivo: string } | null>(null);

  // Extrai ReportPdfData completo garantindo fidelidade absoluta com index.tsx
  const extractPdfData = (rep: any): any => {
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

    const rawPreposto = parsed.preposto || (rep as any)?.preposto;
    const hasPrepostoValido =
      rawPreposto &&
      rawPreposto !== 'undefined' &&
      rawPreposto.trim() !== '' &&
      rawPreposto.trim().toUpperCase() !== 'N/A' &&
      rawPreposto.trim().toUpperCase() !== 'NULL';

    const prepostoFinal = hasPrepostoValido
      ? rawPreposto.trim()
      : (rep.ip_origem && rep.ip_origem !== 'N/A' ? `Visitante (IP: ${rep.ip_origem})` : 'MMS');

    const rawHorarios = parsed.horarios || {};
    let listaSaidas = parsed.listaSaidas || rawHorarios.saida_hotel || [];
    if (!Array.isArray(listaSaidas) || listaSaidas.length === 0) {
      if (parsed.h1 || parsed.h2) {
        listaSaidas = [{
          id: '1',
          label1: parsed.label1 || 'Previsto',
          label2: parsed.label2 || 'Real',
          h1: parsed.h1 || '',
          m1: parsed.m1 || '',
          h2: parsed.h2 || '',
          m2: parsed.m2 || '',
        }];
      }
    }

    let h3 = parsed.h3 || '';
    let m3 = parsed.m3 || '';
    if (!h3 && parsed.embarque_previsto && parsed.embarque_previsto.includes(':')) {
      [h3, m3] = parsed.embarque_previsto.split(':');
    } else if (!h3 && rawHorarios.embarque_previsto && rawHorarios.embarque_previsto.includes(':')) {
      [h3, m3] = rawHorarios.embarque_previsto.split(':');
    }

    let h4 = parsed.h4 || '';
    let m4 = parsed.m4 || '';
    if (!h4 && parsed.embarque_real && parsed.embarque_real.includes(':')) {
      [h4, m4] = parsed.embarque_real.split(':');
    } else if (!h4 && rawHorarios.embarque_real && rawHorarios.embarque_real.includes(':')) {
      [h4, m4] = rawHorarios.embarque_real.split(':');
    }

    let h5 = parsed.h5 || '';
    let m5 = parsed.m5 || '';
    if (!h5 && parsed.atendimento_inicio && parsed.atendimento_inicio.includes(':')) {
      [h5, m5] = parsed.atendimento_inicio.split(':');
    } else if (!h5 && rawHorarios.atendimento_inicio && rawHorarios.atendimento_inicio.includes(':')) {
      [h5, m5] = rawHorarios.atendimento_inicio.split(':');
    }

    let h6 = parsed.h6 || '';
    let m6 = parsed.m6 || '';
    if (!h6 && parsed.atendimento_fim && parsed.atendimento_fim.includes(':')) {
      [h6, m6] = parsed.atendimento_fim.split(':');
    } else if (!h6 && rawHorarios.atendimento_fim && rawHorarios.atendimento_fim.includes(':')) {
      [h6, m6] = rawHorarios.atendimento_fim.split(':');
    }

    const semSaida = Boolean(parsed.semSaida || (listaSaidas.length === 0 && !parsed.h1 && !parsed.h2));
    const semEmbarquePrev = Boolean(parsed.semEmbarquePrev || h3 === 'N/A' || parsed.embarque_previsto === 'N/A' || rawHorarios.embarque_previsto === 'N/A');
    const semEmbarque = Boolean(parsed.semEmbarque || h4 === 'N/A' || parsed.embarque_real === 'N/A' || rawHorarios.embarque_real === 'N/A');

    return {
      grupo: parsed.grupo || rep.empresa || 'MMS',
      unidade: rep.unidade || parsed.unidade || 'MMS',
      data: parsed.data || (rep.data_criacao ? rep.data_criacao.split('T')[0] : new Date().toISOString().split('T')[0]),
      local: parsed.local || parsed.local_atendimento || rep.local_atendimento || 'Macaé / Aeroporto',
      modal: parsed.modal || 'Helicóptero',
      preposto: prepostoFinal,
      observacao: parsed.observacao || parsed.observacao_nome_arquivo || '',
      observacao_nome_arquivo: parsed.observacao_nome_arquivo || parsed.observacao || '',
      listaSaidas,
      semSaida,
      semEmbarquePrev,
      semEmbarque,
      h3,
      m3,
      h4,
      m4,
      h5,
      m5,
      h6,
      m6,
      horarios: {
        saida_hotel: listaSaidas,
        embarque_previsto: semEmbarquePrev ? 'N/A' : (h3 && m3 ? `${h3}:${m3}` : (rawHorarios.embarque_previsto || 'N/A')),
        embarque_real: semEmbarque ? 'N/A' : (h4 && m4 ? `${h4}:${m4}` : (rawHorarios.embarque_real || 'N/A')),
        atendimento_inicio: h5 && m5 ? `${h5}:${m5}` : (rawHorarios.atendimento_inicio || '00:00'),
        atendimento_fim: h6 && m6 ? `${h6}:${m6}` : (rawHorarios.atendimento_fim || '00:00'),
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
        // 0. Tenta carregar pela API MySQL da hospedagem
        try {
          const apiRes = await obterRelatorioApi(Number(reportId));
          if (apiRes.sucesso && apiRes.relatorio) {
            const data = apiRes.relatorio;
            setReport(data);
            const dataExtracted = extractPdfData(data);
            setPdfData(dataExtracted);

            if (Platform.OS === 'web') {
              const rawUrl = data.pdf_url || data.caminho_pdf;
              const formattedUrl = formatReportPdfUrl(rawUrl);
              gerarPdfBlob(dataExtracted, formattedUrl)
                .then((b) => {
                  cachedBlobRef.current = b;
                })
                .catch(() => {});
            }
            setLoading(false);
            return;
          }
        } catch (_) {}

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

  // Renderizador de texto formatado (negrito, itálico, tachado, sublinhado e bullets) idêntico ao index.tsx
  const renderFormattedText = (text?: string, alignment: 'left' | 'justify' = 'left') => {
    if (!text || text.trim() === '' || text === '<br>' || text === '<div><br></div>') {
      return <Text style={styles.a4Value}>N/A</Text>;
    }

    let cleanText = text
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&nbsp/gi, ' ')
      .replace(/&bull;/gi, '▪ ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/<div><br><\/div>/gi, '\n')
      .replace(/<div>/gi, '\n')
      .replace(/<\/div>/gi, '')
      .replace(/<p>/gi, '')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b>(.*?)<\/b>/gi, '*$1*')
      .replace(/<strong>(.*?)<\/strong>/gi, '*$1*')
      .replace(/<i>(.*?)<\/i>/gi, '_$1_')
      .replace(/<em>(.*?)<\/em>/gi, '_$1_')
      .replace(/<u>(.*?)<\/u>/gi, '[$1]')
      .replace(/<strike>(.*?)<\/strike>/gi, '~$1~')
      .replace(/<s>(.*?)<\/s>/gi, '~$1~')
      .replace(/<del>(.*?)<\/del>/gi, '~$1~')
      .replace(/<[^>]+>/g, '');

    const lines = cleanText.split('\n');
    return (
      <View style={{ width: '100%' }}>
        {lines.map((line, lIdx) => {
          if (line.trim() === '' && lines.length > 1) {
            return <View key={lIdx} style={{ height: 6 }} />;
          }

          const parseLineContent = (content: string): React.ReactNode[] => {
            const regex = /(\*[^*]+\*|_[^_]+_|\[[^\]]+\]|~[^~]+~)/g;
            const parts = content.split(regex);

            return parts.map((part, pIdx) => {
              if (!part) return null;

              if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                return (
                  <Text key={pIdx} style={{ fontWeight: 'bold' }}>
                    {part.slice(1, -1)}
                  </Text>
                );
              }
              if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
                return (
                  <Text key={pIdx} style={{ fontStyle: 'italic' }}>
                    {part.slice(1, -1)}
                  </Text>
                );
              }
              if (part.startsWith('[') && part.endsWith(']') && part.length > 2) {
                return (
                  <Text key={pIdx} style={{ textDecorationLine: 'underline' }}>
                    {part.slice(1, -1)}
                  </Text>
                );
              }
              if (part.startsWith('~') && part.endsWith('~') && part.length > 2) {
                return (
                  <Text key={pIdx} style={{ textDecorationLine: 'line-through' }}>
                    {part.slice(1, -1)}
                  </Text>
                );
              }

              return <Text key={pIdx}>{part}</Text>;
            });
          };

          return (
            <Text
              key={lIdx}
              style={[
                styles.a4Value,
                {
                  marginBottom: 3,
                  textAlign: alignment === 'justify' ? 'justify' : 'left',
                  lineHeight: 19,
                },
              ]}
            >
              {parseLineContent(line)}
            </Text>
          );
        })}
      </View>
    );
  };

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

  const handleEditar = () => {
    if (!report) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = `/?editId=${report.id}`;
    } else {
      router.push(`/?editId=${report.id}`);
    }
  };

  // Cálculo de Paginação de Passageiros DINÂMICO (evita qualquer colisão com rodapé e background)
  const paginationData = useMemo(() => {
    if (!pdfData) return { p1Pax1: '', p1Pax2: '', continuationPages: [], totalPages: 1 };

    const rawPax1 = (pdfData.pax_embarcando || '').replace(/\r/g, '');
    const rawPax2 = (pdfData.pax_desembarcando || '').replace(/\r/g, '');
    const lines1 = rawPax1.trim() !== '' ? rawPax1.split('\n') : [];
    const lines2 = rawPax2.trim() !== '' ? rawPax2.split('\n') : [];
    const maxLines = Math.max(lines1.length, lines2.length);

    // Estima o espaço ocupado por textos longos de informações de troca e horários extras de hotel
    const cleanInfoText = (pdfData.info_troca || '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/\r/g, '');
    const infoLines = cleanInfoText.split('\n');
    let infoLineCount = 0;
    for (const l of infoLines) {
      const trimmed = l.trim();
      if (!trimmed) {
        infoLineCount += 0.8;
      } else {
        infoLineCount += Math.max(1, Math.ceil(trimmed.length / 70));
      }
    }

    const saidasList = pdfData.listaSaidas || [];
    const saidasExtra = Math.max(0, saidasList.length - 1);
    const totalExtraLines = Math.round(infoLineCount + saidasExtra);

    // Ajusta o limite da página 1 conforme o tamanho do cabeçalho
    const LIMIT_PAGE_1 = Math.max(3, Math.min(16, 20 - totalExtraLines));
    const LIMIT_CONT_PAGE = 26;

    const p1Pax1 = lines1.slice(0, LIMIT_PAGE_1).join('\n');
    const p1Pax2 = lines2.slice(0, LIMIT_PAGE_1).join('\n');

    const continuationPages: Array<{ pax1: string; pax2: string }> = [];
    if (maxLines > LIMIT_PAGE_1) {
      let idx = LIMIT_PAGE_1;
      while (idx < maxLines) {
        continuationPages.push({
          pax1: lines1.slice(idx, idx + LIMIT_CONT_PAGE).join('\n'),
          pax2: lines2.slice(idx, idx + LIMIT_CONT_PAGE).join('\n'),
        });
        idx += LIMIT_CONT_PAGE;
      }
    }

    const totalPages = 1 + continuationPages.length + (pdfData.fotos || []).length;

    return {
      p1Pax1,
      p1Pax2,
      continuationPages,
      totalPages,
    };
  }, [pdfData]);

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
    : formatarData(pdfData.data);

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── TOOLBAR SUPERIOR MODERNA ─── */}
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
              {report.empresa || 'MMS'} • {dataFormatada} • Preposto: {pdfData.preposto}
            </Text>
          </View>
        </View>

        <View style={styles.toolbarRight}>
          <TouchableOpacity
            style={styles.btnEditar}
            onPress={handleEditar}
            activeOpacity={0.85}
          >
            <Text style={styles.btnEditarText}>✏️ EDITAR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnBaixar}
            onPress={handleBaixar}
            disabled={isExporting}
            activeOpacity={0.85}
          >
            <Text style={styles.btnBaixarText}>
              {isExporting ? 'GERANDO...' : '📥 BAIXAR PDF'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnCompartilhar}
            onPress={handleCompartilhar}
            activeOpacity={0.85}
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

      {/* ─── CORPO DO DOCUMENTO (FOLHAS A4 100% FIÉIS AO INDEX.TSX) ─── */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
        <View
          style={[
            styles.previewWrap,
            previewScale < 1 && {
              width: windowWidth < (a4BaseWidth + 24) ? windowWidth - 16 : a4BaseWidth,
              height: (a4BaseHeight * paginationData.totalPages + (paginationData.totalPages - 1) * 24) * previewScale + 40,
              overflow: 'hidden',
              alignItems: 'center',
            },
          ]}
        >
          <View
            style={[
              styles.previewScaleContainer,
              previewScale < 1 && {
                transform: [{ scale: previewScale }],
                transformOrigin: 'top center',
              },
            ]}
          >
            {/* ─── PÁGINA 1: CABEÇALHO, DETALHES, INFORMAÇÕES E PASSAGEIROS ─── */}
            <View style={styles.pageA4}>
              {/* Imagem de Fundo Geométrico / Marca D'água */}
              <Image
                source={require('../../assets/images/background.png')}
                style={styles.a4BgImage}
                resizeMode="stretch"
              />

              {/* Logo Oficial da MMS */}
              <View style={styles.a4FixedLogo}>
                <Image
                  source={require('../../assets/images/logo2.jpg')}
                  style={{ width: 80, height: 80 }}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.a4PageContent}>
                <Text style={styles.a4DocumentTitle}>RELATÓRIO DE TROCA DE TURMA</Text>

                {/* Informações Principais */}
                <View style={styles.a4Row}>
                  <Text style={styles.a4Label}>Unidade: </Text>
                  <Text style={styles.a4Value}>{pdfData.unidade || 'N/A'}</Text>
                </View>

                <View style={styles.a4Row}>
                  <Text style={styles.a4Label}>Data: </Text>
                  <Text style={styles.a4Value}>{formatarData(pdfData.data) || 'N/A'}</Text>
                </View>

                <View style={styles.a4Row}>
                  <Text style={styles.a4Label}>Local: </Text>
                  <Text style={styles.a4Value}>{pdfData.local || 'N/A'}</Text>
                </View>

                <View style={styles.a4Row}>
                  <Text style={styles.a4Label}>Modal: </Text>
                  <Text style={styles.a4Value}>{pdfData.modal || 'N/A'}</Text>
                </View>

                {/* Horário de Saída do Hotel */}
                <View style={[styles.a4Row, { marginBottom: 0, marginTop: 4 }]}>
                  <Text style={styles.a4Label}>Horário de Saída do Hotel (Previsto e Real):</Text>
                </View>
                {pdfData.semSaida || !pdfData.listaSaidas || pdfData.listaSaidas.length === 0 ? (
                  <View style={styles.a4ContentBox}>
                    <Text style={styles.a4Value}>N/A</Text>
                  </View>
                ) : (
                  <View style={{ marginBottom: 6, marginTop: 2 }}>
                    {pdfData.listaSaidas.map((item: any, idx: number) => (
                      <View
                        key={item.id || idx}
                        style={[
                          styles.a4ContentBox,
                          {
                            flexWrap: 'wrap',
                            marginTop: 0,
                            marginBottom: idx === pdfData.listaSaidas.length - 1 ? 0 : 2,
                          },
                        ]}
                      >
                        <Text style={styles.a4Label}>{item.label1 || 'Previsto'}: </Text>
                        <Text style={styles.a4Value}>{fmtHoraA4(item.h1, item.m1)}</Text>
                        <Text style={[styles.a4Label, { marginLeft: 16 }]}>Real: </Text>
                        <Text style={styles.a4Value}>{fmtHoraA4(item.h2, item.m2)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Horários de Embarque */}
                <View style={[styles.a4Row, { marginBottom: 0, marginTop: 4 }]}>
                  <Text style={styles.a4Label}>Horários de Embarque (Previsto e Real):</Text>
                </View>
                <View style={styles.a4ContentBox}>
                  <Text style={styles.a4Label}>Previsto: </Text>
                  <Text style={styles.a4Value}>
                    {pdfData.semEmbarquePrev ? 'N/A' : fmtHoraA4(pdfData.h3, pdfData.m3)}
                  </Text>
                  <Text style={[styles.a4Label, { marginLeft: 16 }]}>Real: </Text>
                  <Text style={styles.a4Value}>
                    {pdfData.semEmbarque ? 'N/A' : fmtHoraA4(pdfData.h4, pdfData.m4)}
                  </Text>
                </View>

                {/* Horário Inicial e de Finalização */}
                <View style={[styles.a4Row, { marginBottom: 0, marginTop: 4 }]}>
                  <Text style={styles.a4Label}>Horário Inicial e de finalização:</Text>
                </View>
                <View style={styles.a4ContentBox}>
                  <Text style={styles.a4Label}>Início: </Text>
                  <Text style={styles.a4Value}>{fmtHoraA4(pdfData.h5, pdfData.m5)}</Text>
                  <Text style={styles.a4Value}> às </Text>
                  <Text style={styles.a4Label}>Fim: </Text>
                  <Text style={styles.a4Value}>{fmtHoraA4(pdfData.h6, pdfData.m6)}</Text>
                </View>

                {/* Preposto */}
                <View style={[styles.a4Row, { marginTop: 4 }]}>
                  <Text style={styles.a4Label}>Nome do Preposto: </Text>
                  <Text style={styles.a4Value}>{pdfData.preposto || 'N/A'}</Text>
                </View>

                {/* Informações sobre a troca */}
                <View style={[styles.a4Row, { marginBottom: 0, marginTop: 4 }]}>
                  <Text style={styles.a4Label}>Informações sobre a troca de turma:</Text>
                </View>
                <View style={styles.a4InfoBox}>
                  {renderFormattedText(pdfData.info_troca, pdfData.alinhamentoInfo)}
                </View>

                {/* Tabela de Passageiros */}
                <View style={styles.a4PaxTable}>
                  <View style={styles.a4PaxColLeft}>
                    <Text style={styles.a4PaxTitle}>Nomes Passageiros Embarcando:</Text>
                    <View>{renderFormattedText(paginationData.p1Pax1)}</View>
                  </View>
                  <View style={styles.a4PaxColRight}>
                    <Text style={styles.a4PaxTitle}>Nomes Passageiros Desembarcados:</Text>
                    <View>{renderFormattedText(paginationData.p1Pax2)}</View>
                  </View>
                </View>
              </View>

              {/* Footer Corporativo Oficial */}
              <View style={styles.a4Footer}>
                <Text style={styles.a4FooterText}>
                  Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072{'\n'}
                  E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
                </Text>
              </View>
            </View>

            {/* ─── PÁGINAS ADICIONAIS DE PASSAGEIROS (SE HOUVER QUEBRA) ─── */}
            {paginationData.continuationPages.map((chunk, idx) => (
              <View key={`pax-cont-${idx}`} style={[styles.pageA4, { marginTop: 24 }]}>
                <Image
                  source={require('../../assets/images/background.png')}
                  style={styles.a4BgImage}
                  resizeMode="stretch"
                />
                <View style={styles.a4FixedLogo}>
                  <Image
                    source={require('../../assets/images/logo2.jpg')}
                    style={{ width: 80, height: 80 }}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.a4PageContent}>
                  <Text style={styles.a4DocumentTitle}>RELATÓRIO DE TROCA DE TURMA (CONT.)</Text>

                  <View style={[styles.a4PaxTable, { marginTop: 14 }]}>
                    <View style={styles.a4PaxColLeft}>
                      <Text style={styles.a4PaxTitle}>Nomes Passageiros Embarcando (Cont.):</Text>
                      <View>{renderFormattedText(chunk.pax1)}</View>
                    </View>
                    <View style={styles.a4PaxColRight}>
                      <Text style={styles.a4PaxTitle}>Nomes Passageiros Desembarcados (Cont.):</Text>
                      <View>{renderFormattedText(chunk.pax2)}</View>
                    </View>
                  </View>
                </View>
                <View style={styles.a4Footer}>
                  <Text style={styles.a4FooterText}>
                    Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072{'\n'}
                    E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
                  </Text>
                </View>
              </View>
            ))}

            {/* ─── PÁGINAS ADICIONAIS PARA ANEXOS FOTOGRÁFICOS ─── */}
            {(pdfData.fotos || []).map((foto: any, idx: number) => {
              const src = foto.uri || foto.url || foto.base64 || '';
              if (!src) return null;
              return (
                <View key={foto.id || idx} style={[styles.pageA4, { marginTop: 24 }]}>
                  <Image
                    source={require('../../assets/images/background.png')}
                    style={styles.a4BgImage}
                    resizeMode="stretch"
                  />
                  <View style={styles.a4FixedLogo}>
                    <Image
                      source={require('../../assets/images/logo2.jpg')}
                      style={{ width: 80, height: 80 }}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={styles.a4PageContent}>
                    <Text style={styles.a4DocumentTitle}>
                      {(foto.titulo || `ANEXO FOTOGRÁFICO ${idx + 1}`).toUpperCase()}
                    </Text>
                    <View style={styles.a4PhotoContainer}>
                      <Image
                        source={{ uri: src }}
                        style={styles.a4PhotoImage}
                        resizeMode="contain"
                      />
                    </View>
                  </View>
                  <View style={styles.a4Footer}>
                    <Text style={styles.a4FooterText}>
                      Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072{'\n'}
                      E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
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
    color: '#94a3b8',
    fontFamily: modernFont,
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 6,
    fontFamily: modernFont,
  },
  notFoundSub: {
    fontSize: 13,
    color: '#94a3b8',
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
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 100,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 240,
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
    flexWrap: 'wrap',
  },
  btnEditar: {
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  btnEditarText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: modernFont,
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
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  previewWrap: {
    width: '100%',
    maxWidth: 798,
    alignItems: 'center',
    alignSelf: 'center',
  },
  previewScaleContainer: {
    width: 794,
    alignItems: 'center',
  },
  pageA4: {
    backgroundColor: '#ffffff',
    width: 794,
    height: 1123,
    minHeight: 1123,
    maxHeight: 1123,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
    position: 'relative',
    overflow: 'hidden',
    paddingTop: 114, // 30mm conforme index.php
    paddingHorizontal: 57, // 15mm conforme index.php
    paddingBottom: 68, // 18mm conforme index.php
  },
  a4PageContent: {
    position: 'relative',
    zIndex: 2,
    width: '100%',
    flex: 1,
  },
  a4BgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 794,
    height: 1123,
    zIndex: 1,
    // @ts-ignore
    pointerEvents: 'none',
  },
  a4FixedLogo: {
    position: 'absolute',
    top: 19, // 5mm
    left: 57, // 15mm
    width: 80,
    height: 80,
    zIndex: 5,
  },
  a4DocumentTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
    marginTop: -8,
    marginBottom: 19,
    color: '#000000',
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
    letterSpacing: 0.5,
    zIndex: 2,
  },
  a4Row: {
    flexDirection: 'row',
    marginBottom: 6,
    zIndex: 2,
  },
  a4Label: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#000000',
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4Value: {
    fontSize: 14,
    color: '#000000',
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4ContentBox: {
    marginLeft: 20,
    marginTop: 2,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  a4InfoBox: {
    minHeight: 40,
    marginTop: 2,
    marginBottom: 10,
    marginLeft: 20,
    zIndex: 2,
  },
  a4PaxTable: {
    flexDirection: 'row',
    marginTop: 14,
    zIndex: 2,
  },
  a4PaxColLeft: {
    width: '48%',
    paddingRight: 15,
    borderRightWidth: 1.5,
    borderRightColor: '#d1d5db',
  },
  a4PaxColRight: {
    width: '48%',
    paddingLeft: 15,
  },
  a4PaxTitle: {
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 8,
    color: '#000000',
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4Footer: {
    position: 'absolute',
    left: 57,
    right: 57,
    bottom: 38,
    alignItems: 'center',
    zIndex: 5,
  },
  a4FooterText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4PhotoContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    zIndex: 2,
  },
  a4PhotoImage: {
    width: '100%',
    height: 650,
    maxHeight: 650,
  },
});
