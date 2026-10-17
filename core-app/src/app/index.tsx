import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { gerarHtmlPdfFidelidade } from '../lib/pdfHtmlGenerator';
import {
  getSavedSessionSync,
  getValidatedUserSession,
  saveSessionLocal,
  logoutUserSession,
  isUserCoordinator,
  AppUserSession,
} from '../lib/auth';

// Cores Curadas do Layout Original Tailwind / PHP
const colors = {
  body: '#0f172a',
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  black: '#000000',
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue200: '#bfdbfe',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  blue800: '#1e40af',
  indigo50: '#eef2ff',
  indigo100: '#e0e7ff',
  indigo200: '#c7d2fe',
  indigo400: '#818cf8',
  indigo600: '#4f46e5',
  indigo700: '#4338ca',
  indigo800: '#3730a3',
  indigo900: '#312e81',
  emerald50: '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald300: '#6ee7b7',
  emerald600: '#059669',
  emerald700: '#047857',
  rose50: '#fff1f2',
  rose100: '#ffe4e6',
  rose200: '#fecdd3',
  rose300: '#fda4af',
  rose500: '#f43f5e',
  rose600: '#e11d48',
  rose700: '#be123c',
  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber800: '#92400e',
};

const corporateFont = Platform.OS === 'web' 
  ? '"Times New Roman", Times, serif'
  : undefined;

const modernFont = Platform.OS === 'web'
  ? "'Inter', system-ui, -apple-system, sans-serif"
  : undefined;

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  if (!document.getElementById('inter-font-link')) {
    const link = document.createElement('link');
    link.id = 'inter-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap';
    document.head.appendChild(link);
  }

  if (!document.getElementById('pax-focus-styles')) {
    const style = document.createElement('style');
    style.id = 'pax-focus-styles';
    style.innerHTML = `
      #field-pax1 {
        outline: none !important;
        border: 1.5px solid #a7f3d0 !important;
        transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
      }
      #field-pax1:focus {
        outline: none !important;
        border: 2px solid #10b981 !important;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2) !important;
      }
      #field-pax2 {
        outline: none !important;
        border: 1.5px solid #fecdd3 !important;
        transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
      }
      #field-pax2:focus {
        outline: none !important;
        border: 2px solid #f43f5e !important;
        box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.2) !important;
      }
    `;
    document.head.appendChild(style);
  }
}

const GRUPO_OPTIONS = ['TECHNIP', 'DOF', 'TECHNIP/DOF', 'CONSTELLATION', 'ZONDA', 'ALPHA OFFSHORE', 'NEXUS LOGÍSTICA', 'OCEANIC ENERGY', 'SOLARIS SHIPPING', 'VANGUARD MARÍTIMA', 'OUTROS'];

interface SaidaItem {
  id: string;
  label1: string;
  h1: string;
  m1: string;
  label2: string;
  h2: string;
  m2: string;
}

interface FotoItem {
  id: number;
  uri: string;
  titulo: string;
}

interface TabData {
  grupo: string;
  unidade: string;
  data: string;
  local: string;
  modal: string;
  observacao: string;
  preposto: string;
  info: string;
  pax1: string;
  pax2: string;
  h3: string;
  m3: string;
  h4: string;
  m4: string;
  h5: string;
  m5: string;
  h6: string;
  m6: string;
  listaSaidas: SaidaItem[];
  fotosAnexadas: FotoItem[];
  semSaida: boolean;
  semEmbarquePrev: boolean;
  semEmbarque: boolean;
  alinhamentoInfo: 'left' | 'justify';
}

const createDefaultTab = (prepostoDefault = ''): TabData => ({
  grupo: 'TECHNIP',
  unidade: '',
  data: '',
  local: '',
  modal: 'Helicóptero',
  observacao: '',
  preposto: prepostoDefault,
  info: '',
  pax1: '',
  pax2: '',
  h3: '',
  m3: '',
  h4: '',
  m4: '',
  h5: '',
  m5: '',
  h6: '',
  m6: '',
  listaSaidas: [{ id: '1', label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' }],
  fotosAnexadas: [],
  semSaida: false,
  semEmbarquePrev: false,
  semEmbarque: false,
  alinhamentoInfo: 'left',
});

const getRotatedBase64 = (imageUri: string, angle: number): Promise<string> => {
  return new Promise((resolve) => {
    if (angle === 0 || Platform.OS !== 'web') {
      resolve(imageUri);
      return;
    }
    try {
      const img = new (window as any).Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageUri);
          return;
        }
        const rad = (angle * Math.PI) / 180;
        if (angle === 90 || angle === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(imageUri);
      img.src = imageUri;
    } catch (err) {
      resolve(imageUri);
    }
  });
};

const InfoBoxEditor = ({
  info,
  alignment,
  onUpdateInfo,
  onUpdateAlignment,
}: {
  info: string;
  alignment: 'left' | 'justify';
  onUpdateInfo: (val: string) => void;
  onUpdateAlignment: (align: 'left' | 'justify') => void;
}) => {
  const webEditorRef = useRef<HTMLDivElement | null>(null);
  const [mobileSelection, setMobileSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  useEffect(() => {
    if (Platform.OS === 'web' && webEditorRef.current) {
      const currentHtml = webEditorRef.current.innerHTML;
      if (currentHtml !== info && webEditorRef.current.innerText !== info) {
        webEditorRef.current.innerHTML = info || '';
      }
    }
  }, [info]);

  const handleFormat = (command: 'bold' | 'italic' | 'underline') => {
    if (Platform.OS === 'web') {
      if (webEditorRef.current) {
        webEditorRef.current.focus();
        document.execCommand(command, false);
        onUpdateInfo(webEditorRef.current.innerHTML);
      }
    } else {
      const currentText = info || '';
      const { start, end } = mobileSelection;
      let newText = '';
      let newPos = start;

      if (start !== end && start >= 0 && end <= currentText.length) {
        const selected = currentText.substring(start, end);
        let wrapped = '';
        if (command === 'bold') wrapped = `*${selected}*`;
        else if (command === 'italic') wrapped = `_${selected}_`;
        else if (command === 'underline') wrapped = `[${selected}]`;
        newText = currentText.substring(0, start) + wrapped + currentText.substring(end);
        newPos = start + wrapped.length;
      } else {
        const pos = (start >= 0 && start <= currentText.length) ? start : currentText.length;
        let snippet = command === 'bold' ? '*negrito*' : command === 'italic' ? '_italico_' : '[sublinhado]';
        newText = currentText.substring(0, pos) + snippet + currentText.substring(pos);
        newPos = pos + snippet.length;
      }

      onUpdateInfo(newText);
      setMobileSelection({ start: newPos, end: newPos });
    }
  };

  const handleInsertTopic = () => {
    if (Platform.OS === 'web') {
      if (webEditorRef.current) {
        webEditorRef.current.focus();
        document.execCommand('insertHTML', false, '▪ ');
        onUpdateInfo(webEditorRef.current.innerHTML);
      }
    } else {
      const pos = (mobileSelection.start >= 0 && mobileSelection.start <= (info || '').length)
        ? mobileSelection.start
        : (info || '').length;
      const snippet = (pos > 0 && info[pos - 1] !== '\n' ? '\n▪ ' : '▪ ');
      const newText = (info || '').substring(0, pos) + snippet + (info || '').substring(pos);
      onUpdateInfo(newText);
    }
  };

  const handleWebInput = () => {
    if (Platform.OS === 'web' && webEditorRef.current) {
      let html = webEditorRef.current.innerHTML;
      const autoFormattedHtml = html.replace(/(^|>|\s)\*([^\*\s<]+)\*(\s|<|$)/g, '$1<b>$2</b>$3');
      if (autoFormattedHtml !== html) {
        webEditorRef.current.innerHTML = autoFormattedHtml;
        html = autoFormattedHtml;
      }
      onUpdateInfo(html);
    }
  };

  return (
    <View style={styles.textAreaContainer}>
      <View style={styles.textAreaToolbar}>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={() => handleFormat('bold')}
          activeOpacity={0.7}
        >
          <Text style={[styles.toolbarBtnText, { fontWeight: 'bold' }]}>B</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={() => handleFormat('italic')}
          activeOpacity={0.7}
        >
          <Text style={[styles.toolbarBtnText, { fontStyle: 'italic' }]}>I</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={() => handleFormat('underline')}
          activeOpacity={0.7}
        >
          <Text style={[styles.toolbarBtnText, { textDecorationLine: 'underline' }]}>U</Text>
        </TouchableOpacity>

        <View style={styles.toolbarDivider} />

        <TouchableOpacity
          style={[
            styles.toolbarBtn,
            alignment === 'left' && styles.toolbarBtnActive,
          ]}
          onPress={() => onUpdateAlignment('left')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.toolbarBtnText,
              alignment === 'left' && styles.toolbarBtnTextActive,
            ]}
          >
            Esquerda
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toolbarBtn,
            alignment === 'justify' && styles.toolbarBtnActive,
          ]}
          onPress={() => onUpdateAlignment('justify')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.toolbarBtnText,
              alignment === 'justify' && styles.toolbarBtnTextActive,
            ]}
          >
            Justificar
          </Text>
        </TouchableOpacity>

        <View style={styles.toolbarDivider} />

        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={handleInsertTopic}
          activeOpacity={0.7}
        >
          <Text style={styles.toolbarBtnText}>▪ Inserir Tópico</Text>
        </TouchableOpacity>
      </View>

      {Platform.OS === 'web' ? (
        <div
          ref={webEditorRef}
          contentEditable
          onInput={handleWebInput}
          onBlur={handleWebInput}
          onKeyUp={handleWebInput}
          style={{
            minHeight: '280px',
            padding: '14px',
            fontSize: '14px',
            color: '#1e293b',
            backgroundColor: '#ffffff',
            fontFamily: corporateFont || '"Times New Roman", Times, serif',
            outline: 'none',
            textAlign: alignment === 'justify' ? 'justify' : 'left',
            lineHeight: '1.5',
            boxSizing: 'border-box',
            overflowY: 'auto',
          }}
          data-placeholder="Houve embarque de material..."
        />
      ) : (
        <TextInput
          style={[
            styles.textAreaInput,
            alignment === 'justify' && { textAlign: 'justify' },
          ]}
          multiline
          placeholder="Houve embarque de material..."
          placeholderTextColor={colors.slate400}
          value={info}
          onChangeText={onUpdateInfo}
          onSelectionChange={(e) => setMobileSelection(e.nativeEvent.selection)}
        />
      )}
    </View>
  );
};

export default function ReportGenerator() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<number>(1);
  const [tabs, setTabs] = useState<number[]>([1]);
  const [tabStore, setTabStore] = useState<{ [key: number]: TabData }>({
    1: createDefaultTab(),
  });

  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [isLoadingReportEdit, setIsLoadingReportEdit] = useState<boolean>(false);
  const [pdfGenerated, setPdfGenerated] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    if (showMenu) {
      Animated.timing(menuAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => setShowMenu(false));
    } else {
      setShowMenu(true);
      Animated.spring(menuAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  };

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('app_theme_dark');
      if (saved !== null) {
        return saved === 'true';
      }
    }
    return true;
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (isDarkMode) {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
      } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
      }
      try {
        localStorage.setItem('app_theme_dark', String(isDarkMode));
      } catch (e) {}
    }
  }, [isDarkMode]);

  const [isGrupoDropdownOpen, setIsGrupoDropdownOpen] = useState<boolean>(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<string>('meus_relatorios');
  const [isPax1Focused, setIsPax1Focused] = useState<boolean>(false);
  const [isPax2Focused, setIsPax2Focused] = useState<boolean>(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(false);
  const [infoSelection, setInfoSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const applyFormatToInfo = (formatType: 'bold' | 'italic' | 'underline' | 'topic') => {
    const currentText = currentData.info || '';
    const { start, end } = infoSelection;

    let newText = '';
    let newCursorPos = start;

    if (start !== end && start >= 0 && end <= currentText.length) {
      const selected = currentText.substring(start, end);
      let wrapped = '';

      if (formatType === 'bold') wrapped = `*${selected}*`;
      else if (formatType === 'italic') wrapped = `_${selected}_`;
      else if (formatType === 'underline') wrapped = `[${selected}]`;
      else if (formatType === 'topic') wrapped = `▪ ${selected}`;

      newText = currentText.substring(0, start) + wrapped + currentText.substring(end);
      newCursorPos = start + wrapped.length;
    } else {
      const pos = (start >= 0 && start <= currentText.length) ? start : currentText.length;
      let snippet = '';

      if (formatType === 'bold') snippet = '*negrito*';
      else if (formatType === 'italic') snippet = '_italico_';
      else if (formatType === 'underline') snippet = '[sublinhado]';
      else if (formatType === 'topic') snippet = (pos > 0 && currentText[pos - 1] !== '\n' ? '\n▪ ' : '▪ ');

      newText = currentText.substring(0, pos) + snippet + currentText.substring(pos);
      newCursorPos = pos + snippet.length;
    }

    updateCurrentTab({ info: newText });
    setInfoSelection({ start: newCursorPos, end: newCursorPos });
  };

  // Custom Alert / Confirmation Pop-up State
  const [customDialog, setCustomDialog] = useState<{
    visible: boolean;
    type: 'alert' | 'confirm' | 'info';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    visible: false,
    type: 'alert',
    title: '',
    message: '',
  });

  const showCustomAlert = (title: string, message: string, onConfirm?: () => void) => {
    setCustomDialog({
      visible: true,
      type: 'alert',
      title,
      message,
      confirmText: 'OK',
      onConfirm: () => {
        setCustomDialog((prev) => ({ ...prev, visible: false }));
        if (onConfirm) {
          setTimeout(() => {
            onConfirm();
          }, 180);
        }
      },
    });
  };

  const showCustomConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar'
  ) => {
    setCustomDialog({
      visible: true,
      type: 'confirm',
      title,
      message,
      confirmText,
      cancelText,
      onConfirm: () => {
        setCustomDialog((prev) => ({ ...prev, visible: false }));
        onConfirm();
      },
      onCancel: () => {
        setCustomDialog((prev) => ({ ...prev, visible: false }));
      },
    });
  };

  // State para Pop-up de Edição e Rotação de Imagem ("CONFIRMAR E ANEXAR")
  const [imageEditorModal, setImageEditorModal] = useState<{
    visible: boolean;
    rawUri: string;
    titulo: string;
    rotation: number;
    editingId?: number;
  }>({
    visible: false,
    rawUri: '',
    titulo: 'ANEXO FOTOGRÁFICO',
    rotation: 0,
  });

  // Animação de pulso e rotação suave para o Loading Elegante
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 900,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    pulseLoop.start();
    spinLoop.start();
    return () => {
      pulseLoop.stop();
      spinLoop.stop();
    };
  }, [pulseAnim, spinAnim]);

  const spinDegree = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Supabase Auth State & User Level
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [userSession, setUserSession] = useState<AppUserSession | null>(() => getSavedSessionSync());
  const [isAuthModalVisible, setIsAuthModalVisible] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'cadastro'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState<string>('');
  const [authName, setAuthName] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authMsg, setAuthMsg] = useState<{ type: 'erro' | 'sucesso'; text: string } | null>(null);

  // Focus Refs & Auto-Advance
  const inputRefs = useRef<{ [key: string]: TextInput | null }>({});

  // Detecção se está em WebApp (PWA / Mobile) ou Aplicativo Nativo
  const [isAppOrMobile, setIsAppOrMobile] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return true;
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      const isMobileScreen = window.innerWidth <= 768;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      return Boolean(isStandalone || isMobileScreen || isMobileUA);
    }
    return false;
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const checkMode = () => {
        const isStandalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as any).standalone === true;
        const isMobileScreen = window.innerWidth <= 768;
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
        setIsAppOrMobile(Boolean(isStandalone || isMobileScreen || isMobileUA));
      };
      checkMode();
      window.addEventListener('resize', checkMode);
      return () => window.removeEventListener('resize', checkMode);
    }
  }, []);

  // Listen to Supabase Session & Local Session
  useEffect(() => {
    // Valida com o banco de dados e atualiza a sessão ativa
    getValidatedUserSession().then((session) => {
      setUserSession(session);
      if (session?.user) {
        const userName = session.user.user_metadata?.name || session.user.email?.split('@')[0] || '';
        updateCurrentTab({ preposto: userName });
      } else {
        updateCurrentTab({ preposto: '' });
      }
      setIsAuthChecking(false);
    }).catch(() => {
      setIsAuthChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const validated = await getValidatedUserSession();
        setUserSession(validated);
        if (validated?.user) {
          const userName = validated.user.user_metadata?.name || validated.user.email?.split('@')[0] || '';
          updateCurrentTab({ preposto: userName });
        }
      } else if (_event === 'SIGNED_OUT') {
        await logoutUserSession();
        setUserSession(null);
        updateCurrentTab({ preposto: '' });
      }
      setIsAuthChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const currentData = tabStore[activeTab] || createDefaultTab();

  const updateCurrentTab = (updater: Partial<TabData> | ((prev: TabData) => TabData)) => {
    setTabStore((prev) => {
      const existing = prev[activeTab] || createDefaultTab();
      const nextData = typeof updater === 'function' ? updater(existing) : { ...existing, ...updater };
      return { ...prev, [activeTab]: nextData };
    });
  };

  const carregarRelatorioParaEdicao = async (reportId: number) => {
    setIsLoadingReportEdit(true);
    try {
      const { data: report, error } = await supabase
        .from('relatorios')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error || !report) {
        showCustomAlert('RELATÓRIO NÃO ENCONTRADO', 'Não foi possível carregar o relatório solicitado para edição.');
        return;
      }

      let parsed: any = {};
      if (typeof report.dados_json === 'string') {
        try {
          parsed = JSON.parse(report.dados_json);
        } catch (e) {
          parsed = {};
        }
      } else if (typeof report.dados_json === 'object' && report.dados_json !== null) {
        parsed = report.dados_json;
      }

      const horarios = parsed.horarios || {};

      // Lista Saídas
      let listaSaidas: SaidaItem[] = [];
      if (Array.isArray(horarios.saida_hotel) && horarios.saida_hotel.length > 0) {
        listaSaidas = horarios.saida_hotel.map((s: any, idx: number) => ({
          id: String(s.id || idx + 1),
          label1: s.label1 || 'Previsto',
          h1: s.h1 || '',
          m1: s.m1 || '',
          label2: s.label2 || 'Real',
          h2: s.h2 || '',
          m2: s.m2 || '',
        }));
      } else {
        listaSaidas = [{ id: '1', label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' }];
      }

      // Embarque Previsto
      let h3 = '';
      let m3 = '';
      let semEmbarquePrev = false;
      const embPrevStr = String(horarios.embarque_previsto || '').trim();
      if (embPrevStr === 'N/A' || embPrevStr === '') {
        semEmbarquePrev = embPrevStr === 'N/A';
      } else if (embPrevStr.includes(':')) {
        const parts = embPrevStr.split(':');
        h3 = parts[0] || '';
        m3 = parts[1] || '';
      }

      // Embarque Real
      let h4 = '';
      let m4 = '';
      let semEmbarque = false;
      const embRealStr = String(horarios.embarque_real || '').trim();
      if (embRealStr === 'N/A' || embRealStr === '') {
        semEmbarque = embRealStr === 'N/A';
      } else if (embRealStr.includes(':')) {
        const parts = embRealStr.split(':');
        h4 = parts[0] || '';
        m4 = parts[1] || '';
      }

      // Atendimento Início
      let h5 = '';
      let m5 = '';
      const atIniStr = String(horarios.atendimento_inicio || '').trim();
      if (atIniStr.includes(':')) {
        const parts = atIniStr.split(':');
        h5 = parts[0] || '';
        m5 = parts[1] || '';
      }

      // Atendimento Fim
      let h6 = '';
      let m6 = '';
      const atFimStr = String(horarios.atendimento_fim || '').trim();
      if (atFimStr.includes(':')) {
        const parts = atFimStr.split(':');
        h6 = parts[0] || '';
        m6 = parts[1] || '';
      }

      // Fotos
      const fotosAnexadas: FotoItem[] = Array.isArray(parsed.fotos)
        ? parsed.fotos.map((f: any, idx: number) => ({
            id: f.id || Date.now() + idx,
            uri: f.uri || f.url || f.base64 || '',
            titulo: f.titulo || `ANEXO ${idx + 1}`,
          }))
        : [];

      // Data
      let dataVal = parsed.data || '';
      if (!dataVal && report.data_criacao) {
        dataVal = report.data_criacao.split('T')[0];
      }

      const loadedTab: TabData = {
        grupo: parsed.grupo || report.empresa || 'TECHNIP',
        unidade: parsed.unidade || report.unidade || '',
        data: dataVal,
        local: parsed.local || report.local_atendimento || '',
        modal: parsed.modal || 'Helicóptero',
        observacao: parsed.observacao_nome_arquivo || parsed.observacao || '',
        preposto: parsed.preposto || report.preposto || '',
        info: parsed.info_troca || parsed.info || '',
        pax1: parsed.pax_embarcando || parsed.pax1 || '',
        pax2: parsed.pax_desembarcando || parsed.pax2 || '',
        h3,
        m3,
        h4,
        m4,
        h5,
        m5,
        h6,
        m6,
        listaSaidas,
        fotosAnexadas,
        semSaida: false,
        semEmbarquePrev,
        semEmbarque,
        alinhamentoInfo: parsed.alinhamentoInfo || 'left',
      };

      setTabStore((prev) => ({
        ...prev,
        [activeTab]: loadedTab,
      }));
      setEditingReportId(reportId);
      setPdfGenerated(false);

      showCustomAlert(
        'MODO EDIÇÃO ATIVADO',
        `O relatório #${reportId} (${loadedTab.unidade || 'Sem Unidade'}) foi carregado no formulário. Faça as alterações desejadas e clique em "ATUALIZAR RELATÓRIO" ao final.`
      );
    } catch (err: any) {
      showCustomAlert('ERRO AO CARREGAR', `Falha ao carregar relatório: ${err?.message || err}`);
    } finally {
      setIsLoadingReportEdit(false);
    }
  };

  const cancelarEdicao = () => {
    showCustomConfirm(
      'CANCELAR EDIÇÃO',
      'Deseja sair do modo de edição? Qualquer alteração não salva neste relatório será descartada.',
      () => {
        setEditingReportId(null);
        setPdfGenerated(false);
        const userName = userSession?.user?.user_metadata?.name || userSession?.user?.email?.split('@')[0] || '';
        setTabStore((prev) => ({
          ...prev,
          [activeTab]: createDefaultTab(userName),
        }));
        router.setParams({ editId: undefined });
      },
      'Sair da Edição',
      'Continuar Editando'
    );
  };

  useEffect(() => {
    if (editId) {
      const idNum = Number(editId);
      if (!isNaN(idNum) && idNum > 0 && idNum !== editingReportId) {
        carregarRelatorioParaEdicao(idNum);
      }
    }
  }, [editId]);


  const addTab = () => {
    if (tabs.length < 4) {
      const nextId = tabs.length + 1;
      const userName = userSession?.user?.user_metadata?.name || userSession?.user?.email?.split('@')[0] || '';
      setTabs([...tabs, nextId]);
      setTabStore((prev) => ({ ...prev, [nextId]: createDefaultTab(userName) }));
      setActiveTab(nextId);
    }
  };

  const removeTab = (tabIndex: number) => {
    if (tabs.length <= 1) return;
    const confirmMessage = "Deseja realmente remover este relatório? Todos os dados dele serão perdidos.";
    
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        performRemoveTab(tabIndex);
      }
    } else {
      Alert.alert('Remover Relatório', confirmMessage, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => performRemoveTab(tabIndex) },
      ]);
    }
  };

  const performRemoveTab = (tabIndex: number) => {
    const newTabs = tabs.filter((t) => t !== tabIndex);
    const newStore = { ...tabStore };
    delete newStore[tabIndex];
    setTabs(newTabs);
    setTabStore(newStore);
    if (activeTab === tabIndex) {
      setActiveTab(newTabs[0]);
    }
  };

  const limparTudo = () => {
    const confirmMsg = "Deseja reiniciar este relatório? Todos os campos serão limpos.";
    const executeClear = () => {
      const userName = userSession?.user?.user_metadata?.name || userSession?.user?.email?.split('@')[0] || '';
      updateCurrentTab(createDefaultTab(userName));
      setPdfGenerated(false);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) executeClear();
    } else {
      Alert.alert('Novo Relatório', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpar', style: 'destructive', onPress: executeClear },
      ]);
    }
  };

  // Auth Functions
  const handleAuthSubmit = async () => {
    setAuthMsg(null);
    if (!authEmail || !authPassword) {
      setAuthMsg({ type: 'erro', text: 'Preencha o e-mail ou usuário e a senha.' });
      return;
    }

    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        const inputStr = authEmail.trim();

        // 1. Busca na tabela de usuários migrados do MySQL (public.usuarios) com suporte a ilike e fallback
        let dbUser: any = null;
        const { data: matchedDbUser } = await supabase
          .from('usuarios')
          .select('*')
          .or(`email.ilike.${inputStr},username.ilike.${inputStr}`)
          .maybeSingle();

        if (matchedDbUser) {
          dbUser = matchedDbUser;
        } else {
          // Fallback case-insensitive se houver acento ou formato especial
          const { data: allUsers } = await supabase.from('usuarios').select('*');
          if (allUsers) {
            const lowInput = inputStr.toLowerCase();
            dbUser = allUsers.find(
              (u) =>
                u.username?.trim().toLowerCase() === lowInput ||
                u.email?.trim().toLowerCase() === lowInput ||
                u.nome?.trim().toLowerCase() === lowInput
            );
          }
        }

        if (dbUser) {
          // Usuário encontrado na base migrada! Login aprovado e sessão gerada instantaneamente.
          const userSessionObj: AppUserSession = {
            user: {
              id: dbUser.id,
              email: dbUser.email || `${dbUser.username}@app.local`,
              user_metadata: {
                name: dbUser.nome || dbUser.username,
                username: dbUser.username,
                nivel_autoridade: Number(dbUser.nivel_autoridade || 1),
              },
            },
          };

          saveSessionLocal(userSessionObj);
          setUserSession(userSessionObj);

          const userName = dbUser.nome || dbUser.username;
          updateCurrentTab({ preposto: userName });

          setAuthMsg({ type: 'sucesso', text: 'Login realizado com sucesso!' });
          setTimeout(() => setIsAuthModalVisible(false), 600);
          setAuthLoading(false);
          return;
        }

        // 2. Se o usuário digitado não é e-mail, evita chamar Supabase Auth para prevenir o erro HTTP 400 no console
        if (!inputStr.includes('@')) {
          setAuthMsg({ type: 'erro', text: 'Usuário não encontrado ou senha incorreta.' });
          setAuthLoading(false);
          return;
        }

        // 3. Se for e-mail, tenta no Supabase Auth nativo
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: inputStr,
          password: authPassword,
        });

        if (authErr) {
          setAuthMsg({
            type: 'erro',
            text: authErr.message === 'Invalid login credentials'
              ? 'E-mail ou senha incorretos.'
              : (authErr.message || 'Erro ao realizar login.'),
          });
        } else if (authData.session) {
          // Busca o nivel_autoridade e nome em public.usuarios
          const { data: dbUser } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', inputStr.toLowerCase())
            .maybeSingle();

          const nivel = Number(dbUser?.nivel_autoridade ?? authData.session.user.user_metadata?.nivel_autoridade ?? 1);
          const userName = dbUser?.nome || authData.session.user.user_metadata?.name || inputStr.split('@')[0];

          const enrichedSession: AppUserSession = {
            user: {
              id: dbUser?.id || authData.session.user.id,
              email: inputStr.toLowerCase(),
              user_metadata: {
                name: userName,
                username: dbUser?.username || authData.session.user.user_metadata?.username || inputStr.split('@')[0],
                nivel_autoridade: nivel,
              },
            },
          };

          saveSessionLocal(enrichedSession);
          setUserSession(enrichedSession);
          updateCurrentTab({ preposto: userName });

          setAuthMsg({ type: 'sucesso', text: 'Login realizado com sucesso!' });
          setTimeout(() => setIsAuthModalVisible(false), 600);
        }
      } else {
        const cleanName = authName.trim();
        const cleanEmail = authEmail.trim().toLowerCase();

        if (!cleanName || !cleanEmail || !authPassword || !authConfirmPassword) {
          setAuthMsg({ type: 'erro', text: 'Preencha todos os campos do cadastro.' });
          setAuthLoading(false);
          return;
        }

        if (authPassword !== authConfirmPassword) {
          setAuthMsg({ type: 'erro', text: 'As senhas não coincidem. Digite a mesma senha nos dois campos.' });
          setAuthLoading(false);
          return;
        }

        if (authPassword.length < 6) {
          setAuthMsg({ type: 'erro', text: 'A senha deve conter no mínimo 6 caracteres.' });
          setAuthLoading(false);
          return;
        }

        const usernameDerived = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '');

        // 1. Tentar criar em public.usuarios
        const { error: dbErr } = await supabase.from('usuarios').insert([{
          nome: cleanName,
          email: cleanEmail,
          username: usernameDerived,
          nivel_autoridade: 1
        }]);

        // 2. Tentar criar em Supabase Auth
        const { data: signUpData, error: authErr } = await supabase.auth.signUp({
          email: cleanEmail,
          password: authPassword,
          options: {
            data: { name: cleanName, username: usernameDerived },
          },
        });

        if (!dbErr || !authErr || signUpData?.user) {
          const userSessionObj: AppUserSession = {
            user: {
              id: signUpData?.user?.id || Date.now(),
              email: cleanEmail,
              user_metadata: {
                name: cleanName,
                username: usernameDerived,
                nivel_autoridade: 1,
              },
            },
          };

          saveSessionLocal(userSessionObj);
          setUserSession(userSessionObj);
          updateCurrentTab({ preposto: cleanName });

          setAuthMsg({ type: 'sucesso', text: 'Conta criada e ativada com sucesso!' });
          setTimeout(() => {
            setIsAuthModalVisible(false);
            setAuthConfirmPassword('');
          }, 1000);
        } else {
          setAuthMsg({ type: 'erro', text: authErr?.message || dbErr?.message || 'Erro ao criar conta.' });
        }
      }
    } catch (err: any) {
      setAuthMsg({ type: 'erro', text: err.message || 'Erro de conexão.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logoutUserSession();
    setUserSession(null);
    updateCurrentTab({ preposto: '' });
    setShowMenu(false);
  };

  // Sequência e Auto-Advance encadeado de todos os campos de horas e minutos
  const focusNextTimeField = (currentFieldId: string) => {
    const sequence: string[] = [];
    currentData.listaSaidas.forEach((item) => {
      sequence.push(`field-saida_h1_${item.id}`);
      sequence.push(`field-saida_m1_${item.id}`);
      sequence.push(`field-saida_h2_${item.id}`);
      sequence.push(`field-saida_m2_${item.id}`);
    });
    sequence.push('field-h3');
    sequence.push('field-m3');
    sequence.push('field-h4');
    sequence.push('field-m4');
    sequence.push('field-h5');
    sequence.push('field-m5');
    sequence.push('field-h6');
    sequence.push('field-m6');

    const currIdx = sequence.indexOf(currentFieldId);
    if (currIdx >= 0 && currIdx < sequence.length - 1) {
      const nextId = sequence[currIdx + 1];
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        setTimeout(() => {
          const el = document.getElementById(nextId) as HTMLInputElement | null;
          if (el) {
            el.focus();
          }
        }, 30);
      } else {
        const r = inputRefs.current[nextId];
        if (r) {
          r.focus();
        }
      }
    }
  };

  const handleTimeChange = (
    val: string,
    fieldH: keyof TabData,
    fieldId: string
  ) => {
    const clean = val.replace(/\D/g, '');
    let validH = clean;
    if (clean !== '') {
      const num = parseInt(clean, 10);
      if (num > 23) validH = '23';
    }
    updateCurrentTab({ [fieldH]: validH });
    if (validH.length === 2) {
      focusNextTimeField(fieldId);
    }
  };

  const handleMinChange = (val: string, fieldM: keyof TabData, fieldId: string) => {
    const clean = val.replace(/\D/g, '');
    let validM = clean;
    if (clean !== '') {
      const num = parseInt(clean, 10);
      if (num > 59) validM = '59';
    }
    updateCurrentTab({ [fieldM]: validM });
    if (validM.length === 2) {
      focusNextTimeField(fieldId);
    }
  };

  // Saída hotel handlers
  const addSaidaLine = () => {
    const newSaida: SaidaItem = {
      id: Date.now().toString(),
      label1: 'Previsto',
      h1: '',
      m1: '',
      label2: 'Real',
      h2: '',
      m2: '',
    };
    updateCurrentTab({ listaSaidas: [...currentData.listaSaidas, newSaida] });
  };

  const removeSaidaLine = (id: string) => {
    if (currentData.listaSaidas.length > 1) {
      updateCurrentTab({
        listaSaidas: currentData.listaSaidas.filter((item) => item.id !== id),
      });
    }
  };

  const updateSaidaItem = (id: string, field: keyof SaidaItem, val: string) => {
    let finalVal = val;
    let shouldAdvance = false;

    if (field === 'h1' || field === 'h2') {
      const clean = val.replace(/\D/g, '');
      if (clean !== '' && parseInt(clean, 10) > 23) finalVal = '23';
      else finalVal = clean;
      if (finalVal.length === 2) shouldAdvance = true;
    } else if (field === 'm1' || field === 'm2') {
      const clean = val.replace(/\D/g, '');
      if (clean !== '' && parseInt(clean, 10) > 59) finalVal = '59';
      else finalVal = clean;
      if (finalVal.length === 2) shouldAdvance = true;
    }

    updateCurrentTab({
      listaSaidas: currentData.listaSaidas.map((item) => {
        if (item.id !== id) return item;
        return { ...item, [field]: finalVal };
      }),
    });

    if (shouldAdvance) {
      const currentFieldId = `field-saida_${field}_${id}`;
      focusNextTimeField(currentFieldId);
    }
  };

  const toggleSemSaida = () => {
    const nextVal = !currentData.semSaida;
    updateCurrentTab({
      semSaida: nextVal,
      listaSaidas: currentData.listaSaidas.map((item) => ({
        ...item,
        h1: nextVal ? 'N/A' : item.h1 === 'N/A' ? '' : item.h1,
        m1: nextVal ? '' : item.m1,
        h2: nextVal ? 'N/A' : item.h2 === 'N/A' ? '' : item.h2,
        m2: nextVal ? '' : item.m2,
      })),
    });
  };

  const toggleSemEmbarquePrev = () => {
    const nextVal = !currentData.semEmbarquePrev;
    updateCurrentTab({
      semEmbarquePrev: nextVal,
      h3: nextVal ? 'N/A' : currentData.h3 === 'N/A' ? '' : currentData.h3,
      m3: nextVal ? '' : currentData.m3,
    });
  };

  const toggleSemEmbarque = () => {
    const nextVal = !currentData.semEmbarque;
    updateCurrentTab({
      semEmbarque: nextVal,
      h4: nextVal ? 'N/A' : currentData.h4 === 'N/A' ? '' : currentData.h4,
      m4: nextVal ? '' : currentData.m4,
    });
  };

  // Fotos
  // Fotos
  const handlePickImage = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const uri = event.target?.result as string;
            if (uri) {
              setImageEditorModal({
                visible: true,
                rawUri: uri,
                titulo: 'ANEXO FOTOGRÁFICO',
                rotation: 0,
              });
            }
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      showCustomAlert('Selecionar Foto', 'Recurso de upload de imagem ativado na plataforma.');
    }
  };

  const handleEditAttachedPhoto = (foto: FotoItem) => {
    setImageEditorModal({
      visible: true,
      rawUri: foto.uri,
      titulo: foto.titulo || 'ANEXO FOTOGRÁFICO',
      rotation: 0,
      editingId: foto.id,
    });
  };

  const handleSaveImageEdit = async () => {
    if (!imageEditorModal.rawUri) return;
    const finalUri = await getRotatedBase64(imageEditorModal.rawUri, imageEditorModal.rotation);
    if (imageEditorModal.editingId) {
      updateCurrentTab({
        fotosAnexadas: currentData.fotosAnexadas.map((f) =>
          f.id === imageEditorModal.editingId
            ? { ...f, uri: finalUri, titulo: imageEditorModal.titulo.toUpperCase() }
            : f
        ),
      });
    } else {
      const newFoto: FotoItem = {
        id: Date.now(),
        uri: finalUri,
        titulo: imageEditorModal.titulo.toUpperCase(),
      };
      updateCurrentTab({ fotosAnexadas: [...currentData.fotosAnexadas, newFoto] });
    }
    setImageEditorModal({ visible: false, rawUri: '', titulo: 'ANEXO FOTOGRÁFICO', rotation: 0 });
  };

  const removeFoto = (id: number) => {
    showCustomConfirm(
      'Excluir Imagem',
      'Deseja realmente excluir esta imagem anexada?',
      () => {
        updateCurrentTab({
          fotosAnexadas: currentData.fotosAnexadas.filter((f) => f.id !== id),
        });
      },
      'Excluir',
      'Cancelar'
    );
  };

  const updateFotoTitle = (id: number, title: string) => {
    updateCurrentTab({
      fotosAnexadas: currentData.fotosAnexadas.map((f) =>
        f.id === id ? { ...f, titulo: title.toUpperCase() } : f
      ),
    });
  };

  const moveFoto = (index: number, direction: 'up' | 'down') => {
    const list = [...currentData.fotosAnexadas];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx >= 0 && targetIdx < list.length) {
      const temp = list[index];
      list[index] = list[targetIdx];
      list[targetIdx] = temp;
      updateCurrentTab({ fotosAnexadas: list });
    }
  };

  // Validation State & Modal
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: boolean }>({});
  const [isValidationModalOpen, setIsValidationModalOpen] = useState<boolean>(false);
  const [firstErrorField, setFirstErrorField] = useState<string | null>(null);

  const getFilenamePreview = () => {
    const dateFormatted = currentData.data
      ? currentData.data.split('-').reverse().join('-')
      : '00-00-0000';
    const obsFormatted = currentData.observacao ? `_${currentData.observacao.toUpperCase().replace(/\s+/g, '_')}` : '';
    const unidadeClean = currentData.unidade ? currentData.unidade.toUpperCase().replace(/\s+/g, '_') : 'RELATORIO';
    return `${unidadeClean}_${dateFormatted}${obsFormatted}.pdf`;
  };

  const scrollToField = (fieldKey: string | null) => {
    if (!fieldKey || Platform.OS !== 'web' || typeof document === 'undefined') return;

    setTimeout(() => {
      let el: HTMLElement | null =
        document.getElementById(`field-${fieldKey}`) ||
        document.querySelector(`#field-${fieldKey}`) ||
        document.querySelector(`[nativeID="field-${fieldKey}"]`) ||
        document.querySelector(`[data-field="${fieldKey}"]`);

      if (!el) {
        const errEls = document.querySelectorAll('.inputError, [style*="f87171"], [style*="ffe4e6"]');
        if (errEls.length > 0) {
          el = errEls[0] as HTMLElement;
        }
      }

      if (el) {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}

        try {
          const rect = el.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetY = rect.top + scrollTop - 140;
          window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        } catch (e) {}

        try {
          el.focus();
        } catch (e) {}
      }
    }, 120);
  };

  const handleGerarPDF = () => {
    const errors: { [key: string]: boolean } = {};
    let firstErr: string | null = null;

    const checkField = (key: string, val: string) => {
      if (!val || val.trim() === '') {
        errors[key] = true;
        if (!firstErr) firstErr = key;
      }
    };

    checkField('unidade', currentData.unidade);
    checkField('data', currentData.data);
    checkField('local', currentData.local);
    checkField('modal', currentData.modal);
    checkField('preposto', currentData.preposto);

    if (!currentData.semSaida) {
      currentData.listaSaidas.forEach((item) => {
        checkField(`saida_h1_${item.id}`, item.h1);
        checkField(`saida_m1_${item.id}`, item.m1);
        checkField(`saida_h2_${item.id}`, item.h2);
        checkField(`saida_m2_${item.id}`, item.m2);
      });
    }

    if (!currentData.semEmbarquePrev) {
      checkField('h3', currentData.h3);
      checkField('m3', currentData.m3);
    }

    if (!currentData.semEmbarque) {
      checkField('h4', currentData.h4);
      checkField('m4', currentData.m4);
    }

    checkField('h5', currentData.h5);
    checkField('m5', currentData.m5);
    checkField('h6', currentData.h6);
    checkField('m6', currentData.m6);

    checkField('pax1', currentData.pax1);
    checkField('pax2', currentData.pax2);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFirstErrorField(firstErr);

      const triggerScroll = () => {
        scrollToField(firstErr);
      };

      showCustomAlert(
        'AVISO',
        'Por favor, preencha todos os campos obrigatórios destacados em vermelho antes de gerar o relatório.',
        triggerScroll
      );
      setPdfGenerated(false);
      return;
    }

    setFieldErrors({});
    setFirstErrorField(null);
    setPdfGenerated(true);

    // Salva automaticamente o relatório gerado na nuvem Supabase
    salvarRelatorioNoSupabase();

    if (Platform.OS === 'web') {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  // Compartilhar Resumo Formatado via WhatsApp
  const handleCompartilharWhatsApp = () => {
    const dataFormatada = data ? formatarData(data) : new Date().toLocaleDateString('pt-BR');
    const embLines = (embarcandoText || '').split('\n').filter((l) => l.trim().length > 0);
    const desLines = (desembarcandoText || '').split('\n').filter((l) => l.trim().length > 0);

    let msg = `📋 *RESUMO DO ATENDIMENTO OPERACIONAL*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏢 *Empresa:* ${(empresa || 'N/A').toUpperCase()}\n`;
    msg += `⚓ *Unidade:* ${unidade || 'N/A'}\n`;
    msg += `📍 *Local:* ${local || 'N/A'}\n`;
    msg += `👤 *Preposto:* ${preposto || 'Não informado'}\n`;
    msg += `📅 *Data:* ${dataFormatada}\n`;

    if (embarquePrevistoHora || embarqueRealHora) {
      const prev = embarquePrevistoHora ? `${embarquePrevistoHora}:${embarquePrevistoMin || '00'}` : 'N/A';
      const real = embarqueRealHora ? `${embarqueRealHora}:${embarqueRealMin || '00'}` : 'N/A';
      msg += `⏰ *Embarque:* Prev. ${prev} | Real ${real}\n`;
    }

    if (embLines.length > 0 || desLines.length > 0) {
      msg += `👥 *Passageiros (PAX):* 🟢 ${embLines.length} Emb. | 🔴 ${desLines.length} Des.\n`;
    }

    if (infoTroca && infoTroca.trim()) {
      msg += `📝 *Observação:* ${infoTroca.trim()}\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🌐 *Consultar Relatório:* https://relatorios.atmai.com.br/meus_relatorios`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(waUrl, '_blank');
    } else {
      Linking.openURL(waUrl);
    }
  };

  // Geração Nativa de Documento e PDF de Alta Fidelidade (Fiel ao modelo PHP)
  const handleExportarPdfOffline = (modo: 'imprimir' | 'download_html' = 'imprimir') => {
    const docHtml = gerarHtmlPdfFidelidade({
      grupo: currentData.grupo,
      unidade: currentData.unidade,
      data: currentData.data,
      local: currentData.local,
      modal: currentData.modal,
      preposto: currentData.preposto,
      horarios: {
        saida_hotel: currentData.listaSaidas,
        embarque_previsto: currentData.semEmbarquePrev ? 'N/A' : `${currentData.h3}:${currentData.m3}`,
        embarque_real: currentData.semEmbarque ? 'N/A' : `${currentData.h4}:${currentData.m4}`,
        atendimento_inicio: `${currentData.h5}:${currentData.m5}`,
        atendimento_fim: `${currentData.h6}:${currentData.m6}`,
      },
      info_troca: currentData.info,
      pax_embarcando: currentData.pax1,
      pax_desembarcando: currentData.pax2,
      fotos: currentData.fotosAnexadas,
      alinhamentoInfo: currentData.alinhamentoInfo,
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (modo === 'download_html') {
        const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const unidadeClean = (currentData.unidade || 'MMS').toUpperCase().replace(/\s+/g, '_');
        const dataClean = (currentData.data || 'data').replace(/-/g, '_');
        link.download = `${unidadeClean}_${dataClean}.html`;
        link.click();
        return;
      }

      // Impressão / Salvar como PDF
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(docHtml);
        printWin.document.close();
        setTimeout(() => {
          printWin.focus();
          printWin.print();
        }, 350);
      } else {
        window.print();
      }
    } else {
      Alert.alert('Exportação Offline', 'Documento gerado e pronto para exportação.');
    }
  };

  const salvarRelatorioNoSupabase = async () => {
    const jsonPayload = {
      grupo: currentData.grupo,
      unidade: currentData.unidade,
      data: currentData.data,
      local: currentData.local,
      modal: currentData.modal,
      preposto: currentData.preposto,
      observacao_nome_arquivo: currentData.observacao,
      horarios: {
        saida_hotel: currentData.listaSaidas,
        embarque_previsto: currentData.semEmbarquePrev ? 'N/A' : `${currentData.h3}:${currentData.m3}`,
        embarque_real: currentData.semEmbarque ? 'N/A' : `${currentData.h4}:${currentData.m4}`,
        atendimento_inicio: `${currentData.h5}:${currentData.m5}`,
        atendimento_fim: `${currentData.h6}:${currentData.m6}`,
      },
      info_troca: currentData.info,
      pax_embarcando: currentData.pax1,
      pax_desembarcando: currentData.pax2,
      fotos: currentData.fotosAnexadas,
    };

    const isOffline = Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine;

    // Se estiver explicitamente offline, salva localmente
    if (isOffline) {
      salvarOfflineLocal(jsonPayload);
      showCustomAlert(
        'MODO OFFLINE ATIVADO',
        'Você está sem conexão com a internet. O relatório foi salvo localmente no seu dispositivo e está disponível para download ou impressão em PDF offline!'
      );
      return;
    }

    try {
      let pdfUrlResult: string | null = null;

      // 1. Tenta enviar para o servidor PHP
      try {
        const phpResp = await fetch(PHP_SAVE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonPayload),
        });

        if (phpResp.ok) {
          const phpData = await phpResp.json();
          if (phpData?.sucesso && phpData?.pdf_url) {
            pdfUrlResult = formatReportPdfUrl(phpData.pdf_url);
          }
        }
      } catch (phpErr) {
        console.log('Servidor PHP offline ou sem rota. Prosseguindo com Supabase.');
      }

      // Se estiver em modo de edição, atualiza o registro existente
      if (editingReportId) {
        const { error: updErr } = await supabase
          .from('relatorios')
          .update({
            empresa: currentData.grupo,
            unidade: currentData.unidade,
            local_atendimento: currentData.local,
            dados_json: JSON.stringify(jsonPayload),
            teve_anexo: currentData.fotosAnexadas.length > 0,
            ...(pdfUrlResult ? { pdf_url: pdfUrlResult, caminho_pdf: pdfUrlResult } : {}),
          })
          .eq('id', editingReportId);

        if (updErr) {
          console.warn('Falha ao atualizar relatório no Supabase:', updErr.message);
          showCustomAlert('ERRO AO ATUALIZAR', 'Não foi possível atualizar o relatório na nuvem: ' + updErr.message);
        } else {
          showCustomAlert(
            'RELATÓRIO ATUALIZADO',
            `O relatório #${editingReportId} (${currentData.unidade}) foi atualizado com sucesso no Supabase!`
          );
        }
        return;
      }

      // 2. Registra novo relatório no banco Supabase
      const { data, error } = await supabase.from('relatorios').insert([{
        usuario_id: userSession?.user?.id || null,
        empresa: currentData.grupo,
        unidade: currentData.unidade,
        local_atendimento: currentData.local,
        dados_json: JSON.stringify(jsonPayload),
        teve_anexo: currentData.fotosAnexadas.length > 0,
        pdf_url: pdfUrlResult,
        caminho_pdf: pdfUrlResult,
        data_criacao: new Date().toISOString(),
      }]);

      if (error) {
        console.warn('Falha na sincronização online. Armazenando cópia offline.', error.message);
        salvarOfflineLocal(jsonPayload);
        showCustomAlert(
          'SALVO LOCALMENTE (OFFLINE)',
          'Houve uma oscilação na conexão com a nuvem, mas seu relatório foi salvo com segurança na memória local do aparelho.'
        );
      } else {
        showCustomAlert(
          'RELATÓRIO SALVO',
          'Seu relatório foi gerado e salvo com sucesso! Você pode visualizá-lo a qualquer momento na página "Meus Relatórios".'
        );
      }
    } catch (err: any) {
      salvarOfflineLocal(jsonPayload);
      showCustomAlert(
        'SALVO EM MODO OFFLINE',
        'Relatório gerado e armazenado localmente no dispositivo para exportação direta de PDF offline.'
      );
    }
  };

  const salvarOfflineLocal = (payload: any) => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        const salvosStr = localStorage.getItem('mms_relatorios_offline_salvos') || '[]';
        const lista = JSON.parse(salvosStr);
        lista.push({
          ...payload,
          id_offline: Date.now(),
          data_criacao: new Date().toISOString(),
        });
        localStorage.setItem('mms_relatorios_offline_salvos', JSON.stringify(lista));
      } catch (e) {}
    }
  };

  const handleCloseWarningModal = () => {
    setIsValidationModalOpen(false);
    if (firstErrorField && Platform.OS === 'web') {
      setTimeout(() => {
        const el = document.getElementById(`field-${firstErrorField}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      }, 150);
    }
  };

  const formatarData = (val: string) => {
    if (!val) return '';
    const parts = val.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : val;
  };

  const renderFormattedText = (text: string, alignment: 'left' | 'justify' = 'left') => {
    if (!text || text.trim() === '' || text === '<br>' || text === '<div><br></div>') {
      return <Text style={styles.a4Value}>N/A</Text>;
    }

    // 1. Decodificar entidades HTML comuns (evita expor &nbsp; na tela)
    let cleanText = text
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&nbsp/gi, ' ')
      .replace(/&bull;/gi, '▪ ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&nbsp/gi, ' ');

    // 2. Normalizar quebras de linha de tags HTML
    cleanText = cleanText
      .replace(/<div><br><\/div>/gi, '\n')
      .replace(/<div>/gi, '\n')
      .replace(/<\/div>/gi, '')
      .replace(/<p>/gi, '')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');

    // 3. Converter tags HTML para a sintaxe de marcação unificada
    cleanText = cleanText
      .replace(/<b>(.*?)<\/b>/gi, '*$1*')
      .replace(/<strong>(.*?)<\/strong>/gi, '*$1*')
      .replace(/<i>(.*?)<\/i>/gi, '_$1_')
      .replace(/<em>(.*?)<\/em>/gi, '_$1_')
      .replace(/<u>(.*?)<\/u>/gi, '[$1]');

    // 4. Remover qualquer outra tag HTML residual
    cleanText = cleanText.replace(/<[^>]+>/g, '');

    const lines = cleanText.split('\n');
    return (
      <View style={{ width: '100%' }}>
        {lines.map((line, lIdx) => {
          if (line.trim() === '' && lines.length > 1) {
            return <View key={lIdx} style={{ height: 6 }} />;
          }

          const parseLineContent = (content: string): React.ReactNode[] => {
            const regex = /(\*[^*]+\*|_[^_]+_|\[[^\]]+\])/g;
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

  return (
    <SafeAreaView style={[styles.body, !isDarkMode && { backgroundColor: '#f1f5f9' }]}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />

      {/* Navbar Superior Limpa */}
      <View style={styles.navbar}>
        <Text style={styles.navTitleText}>📋 GERADOR DE RELATÓRIOS</Text>

        <TouchableOpacity
          onPress={toggleMenu}
          style={[styles.navMenuBtn, showMenu && styles.navMenuBtnActive]}
          activeOpacity={0.8}
        >
          <Text style={[styles.navMenuBtnText, showMenu && styles.navMenuBtnTextActive]}>MENU</Text>

          <View style={styles.menuIconCircle}>
            <Text style={styles.menuIconCircleText}>
              {userSession?.user
                ? (userSession.user.user_metadata?.name || userSession.user.email || 'i')[0].toLowerCase()
                : 'i'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Dropdown Menu Modal (Elimina qualquer travamento, estouro de tela ou bug de z-index) */}
        <Modal
          visible={showMenu}
          transparent
          animationType="fade"
          onRequestClose={toggleMenu}
        >
          <TouchableOpacity
            style={styles.dropdownModalBackdrop}
            activeOpacity={1}
            onPress={toggleMenu}
          >
            <Animated.View
              style={[
                styles.dropdownMenuCard,
                !isDarkMode && styles.dropdownMenuCardLight,
                {
                  opacity: menuAnim,
                  transform: [
                    {
                      translateY: menuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-10, 0],
                      }),
                    },
                    {
                      scale: menuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <TouchableOpacity activeOpacity={1} style={{ width: '100%' }}>
                {/* Linha com Switch de Tema */}
                <View style={styles.menuThemeRow}>
                  <Text style={styles.menuThemeLabel}>
                    {isDarkMode ? '🌙 Modo Escuro' : '☀️ Modo Claro'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.themeToggleTrack, isDarkMode && styles.themeToggleTrackActive]}
                    onPress={() => setIsDarkMode(!isDarkMode)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.themeToggleThumb, isDarkMode && styles.themeToggleThumbActive]} />
                  </TouchableOpacity>
                </View>

                <View style={styles.menuDivider} />

                {userSession?.user ? (
                  <>
                    <View style={styles.menuHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={styles.menuHeaderLabel}>SESSÃO ATIVA</Text>
                        <View style={[
                          styles.nivelBadge,
                          isUserCoordinator(userSession) ? styles.nivelBadgeCoord : styles.nivelBadgePreposto
                        ]}>
                          <Text style={[
                            styles.nivelBadgeText,
                            isUserCoordinator(userSession) ? styles.nivelBadgeCoordText : styles.nivelBadgePrepostoText
                          ]}>
                            {isUserCoordinator(userSession) ? 'COORDENAÇÃO (NÍVEL 2)' : 'PREPOSTO (NÍVEL 1)'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.menuHeaderName} numberOfLines={1}>
                        {userSession.user.user_metadata?.name || userSession.user.email?.split('@')[0]}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.menuItem,
                        selectedMenuItem === 'meus_relatorios' && styles.menuItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedMenuItem('meus_relatorios');
                        toggleMenu();
                        router.push('/meus_relatorios');
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.menuItemIcon}>📁</Text>
                        <Text
                          style={[
                            styles.menuItemText,
                            selectedMenuItem === 'meus_relatorios' && styles.menuItemTextSelected,
                          ]}
                        >
                          Meus Relatórios
                        </Text>
                      </View>
                      {selectedMenuItem === 'meus_relatorios' && (
                        <Text style={styles.menuItemSelectedCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    {/* Painel de Coordenação: EXCLUSIVO PARA USUÁRIOS LOGADOS NÍVEL 2 */}
                    {isUserCoordinator(userSession) && (
                      <TouchableOpacity
                        style={[
                          styles.menuItem,
                          selectedMenuItem === 'painel_coord' && styles.menuItemSelectedAmber,
                        ]}
                        onPress={() => {
                          setSelectedMenuItem('painel_coord');
                          toggleMenu();
                          router.push('/painel_coord');
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.menuItemIcon}>🛡️</Text>
                          <Text
                            style={[
                              styles.menuItemText,
                              { color: colors.amber800 },
                              selectedMenuItem === 'painel_coord' && styles.menuItemTextSelected,
                            ]}
                          >
                            Painel de Coordenação
                          </Text>
                        </View>
                        {selectedMenuItem === 'painel_coord' && (
                          <Text style={[styles.menuItemSelectedCheck, { color: colors.amber800 }]}>✓</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.menuItem, { borderTopWidth: 1, borderColor: colors.slate100 }]}
                      onPress={() => {
                        toggleMenu();
                        handleSignOut();
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.menuItemIcon}>🚪</Text>
                        <Text style={[styles.menuItemText, { color: colors.rose600 }]}>Sair do Sistema</Text>
                      </View>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={styles.menuHeader}>
                      <Text style={styles.menuHeaderLabel}>MODO VISITANTE</Text>
                      <Text style={[styles.menuHeaderName, { fontSize: 13, color: colors.slate500, fontWeight: 'normal' }]}>
                        Não autenticado
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.menuItem,
                        selectedMenuItem === 'login' && styles.menuItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedMenuItem('login');
                        toggleMenu();
                        setAuthMode('login');
                        setIsAuthModalVisible(true);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.menuItemIcon}>🔑</Text>
                        <Text style={[styles.menuItemText, { color: colors.blue600 }]}>Fazer Login</Text>
                      </View>
                      {selectedMenuItem === 'login' && (
                        <Text style={styles.menuItemSelectedCheck}>✓</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.menuItem, { borderTopWidth: 1, borderColor: colors.slate100 }]}
                      onPress={() => {
                        setSelectedMenuItem('cadastro');
                        toggleMenu();
                        setAuthMode('cadastro');
                        setIsAuthModalVisible(true);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.menuItemIcon}>📝</Text>
                        <Text style={[styles.menuItemText, { color: colors.emerald600 }]}>Criar Nova Conta</Text>
                      </View>
                      {selectedMenuItem === 'cadastro' && (
                        <Text style={styles.menuItemSelectedCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Cartão Principal de Preenchimento (Independente e Separado do Preview) */}
        <View style={styles.card}>
          {/* Header do Card com Botão Iniciar Novo Relatório */}
          <View style={styles.cardHeader}>
            <TouchableOpacity onPress={limparTudo} style={styles.btnNovoRelatorio} activeOpacity={0.75}>
              <Text style={styles.btnNovoRelatorioIcon}>+</Text>
              <Text style={styles.btnNovoRelatorioText}>Iniciar Novo Relatório</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.mainTitle}>PREENCHIMENTO DE RELATÓRIO</Text>
          {/* Banner de Modo Edição Ativo */}
          {editingReportId && (
            <View style={styles.editingBannerCard}>
              <View style={styles.editingBannerLeft}>
                <View style={styles.editingBannerBadge}>
                  <Text style={styles.editingBannerBadgeText}>✏️ MODO EDIÇÃO ATIVO</Text>
                </View>
                <Text style={styles.editingBannerTitle}>
                  Editando Relatório #{editingReportId} ({currentData.unidade || 'Sem Unidade'})
                </Text>
                <Text style={styles.editingBannerSub}>
                  Ao salvar, as alterações atualizarão o registro existente no Supabase sem duplicar.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.btnCancelarEdicao}
                onPress={cancelarEdicao}
                activeOpacity={0.8}
              >
                <Text style={styles.btnCancelarEdicaoText}>✕ Cancelar Edição</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Controle de Abas Simultâneas (Até 4) */}
          <View style={styles.tabsSection}>
            <View style={styles.tabsTopRow}>
              <Text style={styles.tabsSectionTitle}>RELATÓRIOS EM ANDAMENTO</Text>
              {tabs.length < 4 && (
                <TouchableOpacity onPress={addTab} style={styles.btnAddTab}>
                  <Text style={styles.btnAddTabText}>+ ADICIONAR RELATÓRIO</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.tabsContainer}>
              {tabs.map((tabId) => {
                const isActive = activeTab === tabId;
                const tabData = tabStore[tabId];
                const tabName = tabData?.unidade ? tabData.unidade.toUpperCase() : 'Vazio';

                return (
                  <TouchableOpacity
                    key={tabId}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => setActiveTab(tabId)}
                  >
                    {tabs.length > 1 && (
                      <TouchableOpacity
                        style={styles.tabRemoveBtn}
                        onPress={() => removeTab(tabId)}
                      >
                        <Text style={styles.tabRemoveText}>✕</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                      Relatório {tabId}
                    </Text>
                    <Text
                      style={[styles.tabName, isActive ? { color: colors.slate800 } : { color: colors.slate500 }]}
                      numberOfLines={1}
                    >
                      {tabName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Formulário Principal com Espaçamentos Aumentados */}
          <View style={styles.formContainer}>
            {/* Empresa / Grupo (Estilo Select Dropdown conforme Anexo 2) */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>EMPRESA / GRUPO:</Text>

              <TouchableOpacity
                style={styles.selectBoxContainer}
                onPress={() => setIsGrupoDropdownOpen(!isGrupoDropdownOpen)}
                activeOpacity={0.8}
              >
                <Text style={styles.selectBoxText}>{currentData.grupo || 'TECHNIP'}</Text>
                <Text style={styles.selectBoxChevron}>{isGrupoDropdownOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {isGrupoDropdownOpen && (
                <View style={styles.dropdownOptionsList}>
                  {GRUPO_OPTIONS.map((opt) => {
                    const isSelected = currentData.grupo === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.dropdownOptionItem, isSelected && styles.dropdownOptionItemActive]}
                        onPress={() => {
                          updateCurrentTab({ grupo: opt });
                          setIsGrupoDropdownOpen(false);
                        }}
                      >
                        <Text style={[styles.dropdownOptionText, isSelected && styles.dropdownOptionTextActive]}>
                          {opt}
                        </Text>
                        {isSelected && <Text style={styles.dropdownOptionCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Unidade */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>UNIDADE:</Text>
              <TextInput
                nativeID="field-unidade"
                id="field-unidade"
                style={[styles.input, { textTransform: 'uppercase' }, fieldErrors.unidade && styles.inputError]}
                value={currentData.unidade}
                onChangeText={(val) => updateCurrentTab({ unidade: val.toUpperCase() })}
                placeholder="Ex: LONE STAR SS79"
                placeholderTextColor={colors.slate400}
                autoCapitalize="characters"
              />
            </View>

            {/* Data */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>DATA:</Text>
              {Platform.OS === 'web' ? (
                <input
                  id="field-data"
                  type={currentData.data ? 'date' : 'text'}
                  value={currentData.data}
                  onChange={(e: any) => updateCurrentTab({ data: e.target.value })}
                  onClick={(e: any) => {
                    e.target.type = 'date';
                    try {
                      e.target.showPicker();
                    } catch (err) {}
                  }}
                  onFocus={(e: any) => {
                    e.target.type = 'date';
                    try {
                      e.target.showPicker();
                    } catch (err) {}
                  }}
                  onBlur={(e: any) => {
                    if (!e.target.value) e.target.type = 'text';
                  }}
                  placeholder="Selecionar a data aqui 📅"
                  style={{
                    border: fieldErrors.data ? '2px solid #f87171' : '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '13px',
                    fontFamily: corporateFont,
                    backgroundColor: fieldErrors.data ? '#ffe4e6' : '#f8fafc',
                    color: '#1e293b',
                    width: '100%',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <TextInput
                  nativeID="field-data"
                  id="field-data"
                  style={[styles.input, fieldErrors.data && styles.inputError]}
                  value={currentData.data}
                  onChangeText={(val) => updateCurrentTab({ data: val })}
                  placeholder="Selecionar a data aqui 📅"
                  placeholderTextColor={colors.slate400}
                />
              )}
            </View>

            {/* Local */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>LOCAL:</Text>
              <TextInput
                nativeID="field-local"
                id="field-local"
                style={[styles.input, fieldErrors.local && styles.inputError]}
                value={currentData.local}
                onChangeText={(val) => updateCurrentTab({ local: val })}
                placeholder="Local de atendimento"
                placeholderTextColor={colors.slate400}
              />
            </View>

            {/* Modal */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>MODAL:</Text>
              <TextInput
                nativeID="field-modal"
                id="field-modal"
                style={[styles.input, fieldErrors.modal && styles.inputError]}
                value={currentData.modal}
                onChangeText={(val) => updateCurrentTab({ modal: val })}
                placeholder="Helicóptero"
                placeholderTextColor={colors.slate400}
              />
            </View>

            {/* Observação Troca */}
            <View style={styles.obsBox}>
              <Text style={styles.obsLabel}>OBSERVAÇÃO TROCA:</Text>
              <TextInput
                style={[styles.obsInput, { textTransform: 'uppercase' }]}
                value={currentData.observacao}
                onChangeText={(val) => updateCurrentTab({ observacao: val.toUpperCase().replace(/\s/g, '_') })}
                placeholder="Ex: TRANSFERIDO"
                placeholderTextColor={colors.indigo200}
                autoCapitalize="characters"
              />
              <Text style={styles.obsHint}>
                💡 O texto será <Text style={{ fontWeight: 'bold' }}>adicionado ao nome do arquivo PDF</Text>. (Ex: TRANSFERIDO, 1ª TENTATIVA).
              </Text>
            </View>

            {/* Nome do Preposto */}
            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.label}>NOME DO PREPOSTO:</Text>
                {userSession?.user && (
                  <View style={styles.prepostoLockBadge}>
                    <Text style={styles.prepostoLockText}>🔒 Preenchido via conta logada</Text>
                  </View>
                )}
              </View>
              <TextInput
                nativeID="field-preposto"
                id="field-preposto"
                style={[
                  styles.input,
                  userSession?.user && styles.inputDisabledPreposto,
                  fieldErrors.preposto && styles.inputError,
                ]}
                value={currentData.preposto}
                onChangeText={(val) => {
                  if (!userSession?.user) {
                    updateCurrentTab({ preposto: val });
                  }
                }}
                editable={!userSession?.user}
                placeholder="Seu nome"
                placeholderTextColor={colors.slate400}
              />
            </View>

            {/* Controle de Horários */}
            <View style={styles.horariosBox}>
              <Text style={styles.horariosTitle}>CONTROLE DE HORÁRIOS</Text>

              {/* Card 1: Saída do Hotel */}
              <View style={styles.horarioCard}>
                <View style={styles.horarioBadgeWrapper}>
                  <Text style={styles.horarioBadge}>SAÍDA DO HOTEL</Text>
                </View>

                <View style={styles.dicaBox}>
                  <Text style={styles.dicaText}>
                    ✏️ <Text style={{ fontWeight: 'bold' }}>Dica:</Text> O rótulo inicial <Text style={styles.dicaTag}>Previsto</Text> pode ser clicado e editado (Ex: Previsto DOF, Previsto TFMC).
                  </Text>
                </View>

                {currentData.listaSaidas.map((item, idx) => (
                  <View key={item.id} style={styles.saidaRowContainer}>
                    <View style={styles.timeSectionBlock}>
                      <View style={styles.saidaLabelGroup}>
                        <TextInput
                          style={[
                            styles.saidaLabelInput,
                            { width: Math.max(65, (item.label1 || 'Previsto').length * 9.5) }
                          ]}
                          value={item.label1}
                          onChangeText={(val) => updateSaidaItem(item.id, 'label1', val)}
                          placeholder="Previsto"
                          placeholderTextColor={colors.slate400}
                        />
                        <Text style={styles.colon}>:</Text>
                      </View>

                      <View style={styles.timeInputsWrapper}>
                        <TextInput
                          nativeID={`field-saida_h1_${item.id}`}
                          id={`field-saida_h1_${item.id}`}
                          ref={(r) => { if (r) inputRefs.current[`field-saida_h1_${item.id}`] = r; }}
                          style={[styles.timeInput, currentData.semSaida && styles.disabledInput, fieldErrors[`saida_h1_${item.id}`] && styles.inputError]}
                          value={item.h1}
                          onChangeText={(val) => updateSaidaItem(item.id, 'h1', val)}
                          maxLength={2}
                          keyboardType="numeric"
                          editable={!currentData.semSaida}
                        />
                        <Text style={styles.timeSufix}>h</Text>
                        <TextInput
                          nativeID={`field-saida_m1_${item.id}`}
                          id={`field-saida_m1_${item.id}`}
                          ref={(r) => { if (r) inputRefs.current[`field-saida_m1_${item.id}`] = r; }}
                          style={[styles.timeInput, currentData.semSaida && styles.disabledInput, fieldErrors[`saida_m1_${item.id}`] && styles.inputError]}
                          value={item.m1}
                          onChangeText={(val) => updateSaidaItem(item.id, 'm1', val)}
                          maxLength={2}
                          keyboardType="numeric"
                          editable={!currentData.semSaida}
                        />
                        <Text style={styles.timeSufix}>m</Text>
                      </View>
                    </View>

                    <View style={[styles.timeSectionBlock, { marginTop: 16 }]}>
                      <Text style={styles.saidaRealLabel}>REAL:</Text>
                      <View style={styles.timeInputsWrapper}>
                        <TextInput
                          nativeID={`field-saida_h2_${item.id}`}
                          id={`field-saida_h2_${item.id}`}
                          ref={(r) => { if (r) inputRefs.current[`field-saida_h2_${item.id}`] = r; }}
                          style={[styles.timeInput, currentData.semSaida && styles.disabledInput, fieldErrors[`saida_h2_${item.id}`] && styles.inputError]}
                          value={item.h2}
                          onChangeText={(val) => updateSaidaItem(item.id, 'h2', val)}
                          maxLength={2}
                          keyboardType="numeric"
                          editable={!currentData.semSaida}
                        />
                        <Text style={styles.timeSufix}>h</Text>
                        <TextInput
                          nativeID={`field-saida_m2_${item.id}`}
                          id={`field-saida_m2_${item.id}`}
                          ref={(r) => { if (r) inputRefs.current[`field-saida_m2_${item.id}`] = r; }}
                          style={[styles.timeInput, currentData.semSaida && styles.disabledInput, fieldErrors[`saida_m2_${item.id}`] && styles.inputError]}
                          value={item.m2}
                          onChangeText={(val) => updateSaidaItem(item.id, 'm2', val)}
                          maxLength={2}
                          keyboardType="numeric"
                          editable={!currentData.semSaida}
                        />
                        <Text style={styles.timeSufix}>m</Text>
                      </View>
                    </View>

                    {idx > 0 && (
                      <TouchableOpacity style={styles.btnRemoveSaida} onPress={() => removeSaidaLine(item.id)}>
                        <Text style={styles.btnRemoveSaidaText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <TouchableOpacity style={styles.checkboxRow} onPress={toggleSemSaida}>
                  <View style={[styles.checkbox, currentData.semSaida && styles.checkboxChecked]}>
                    {currentData.semSaida && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>N/A SAÍDA DE HOTEL</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.btnNovaSaida} onPress={addSaidaLine}>
                  <Text style={styles.btnNovaSaidaText}>+ ADICIONAR NOVA SAÍDA</Text>
                </TouchableOpacity>
              </View>

              {/* Card 2: Embarque */}
              <View style={styles.horarioCard}>
                <View style={styles.horarioBadgeWrapper}>
                  <Text style={styles.horarioBadge}>EMBARQUE</Text>
                </View>

                {/* Previsão Embarque */}
                <View style={styles.saidaRowContainer}>
                  <View style={styles.timeSectionBlock}>
                    <Text style={styles.timeSectionLabel}>PREVISÃO:</Text>
                    <View style={styles.timeInputsWrapper}>
                      <TextInput
                        nativeID="field-h3"
                        id="field-h3"
                        ref={(r) => { if (r) inputRefs.current['field-h3'] = r; }}
                        style={[styles.timeInput, currentData.semEmbarquePrev && styles.disabledInput, fieldErrors.h3 && styles.inputError]}
                        value={currentData.h3}
                        onChangeText={(val) => handleTimeChange(val, 'h3', 'field-h3')}
                        maxLength={2}
                        keyboardType="numeric"
                        editable={!currentData.semEmbarquePrev}
                      />
                      <Text style={styles.timeSufix}>h</Text>
                      <TextInput
                        nativeID="field-m3"
                        id="field-m3"
                        ref={(r) => { if (r) inputRefs.current['field-m3'] = r; }}
                        style={[styles.timeInput, currentData.semEmbarquePrev && styles.disabledInput, fieldErrors.m3 && styles.inputError]}
                        value={currentData.m3}
                        onChangeText={(val) => handleMinChange(val, 'm3', 'field-m3')}
                        maxLength={2}
                        keyboardType="numeric"
                        editable={!currentData.semEmbarquePrev}
                      />
                      <Text style={styles.timeSufix}>m</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity style={styles.checkboxRow} onPress={toggleSemEmbarquePrev}>
                  <View style={[styles.checkbox, currentData.semEmbarquePrev && styles.checkboxChecked]}>
                    {currentData.semEmbarquePrev && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>N/A EMBARQUE</Text>
                </TouchableOpacity>

                {/* Real Embarque */}
                <View style={styles.saidaRowContainer}>
                  <View style={styles.timeSectionBlock}>
                    <Text style={styles.timeSectionLabel}>REAL:</Text>
                    <View style={styles.timeInputsWrapper}>
                      <TextInput
                        nativeID="field-h4"
                        id="field-h4"
                        ref={(r) => { if (r) inputRefs.current['field-h4'] = r; }}
                        style={[styles.timeInput, currentData.semEmbarque && styles.disabledInput, fieldErrors.h4 && styles.inputError]}
                        value={currentData.h4}
                        onChangeText={(val) => handleTimeChange(val, 'h4', 'field-h4')}
                        maxLength={2}
                        keyboardType="numeric"
                        editable={!currentData.semEmbarque}
                      />
                      <Text style={styles.timeSufix}>h</Text>
                      <TextInput
                        nativeID="field-m4"
                        id="field-m4"
                        ref={(r) => { if (r) inputRefs.current['field-m4'] = r; }}
                        style={[styles.timeInput, currentData.semEmbarque && styles.disabledInput, fieldErrors.m4 && styles.inputError]}
                        value={currentData.m4}
                        onChangeText={(val) => handleMinChange(val, 'm4', 'field-m4')}
                        maxLength={2}
                        keyboardType="numeric"
                        editable={!currentData.semEmbarque}
                      />
                      <Text style={styles.timeSufix}>m</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity style={styles.checkboxRow} onPress={toggleSemEmbarque}>
                  <View style={[styles.checkbox, currentData.semEmbarque && styles.checkboxChecked]}>
                    {currentData.semEmbarque && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>N/A EMBARQUE</Text>
                </TouchableOpacity>
              </View>

              {/* Card 3: Atendimento */}
              <View style={styles.horarioCard}>
                <View style={styles.horarioBadgeWrapper}>
                  <Text style={styles.horarioBadge}>ATENDIMENTO</Text>
                </View>

                {/* Início Atendimento */}
                <View style={styles.saidaRowContainer}>
                  <View style={styles.timeSectionBlock}>
                    <Text style={styles.timeSectionLabel}>INÍCIO:</Text>
                    <View style={styles.timeInputsWrapper}>
                      <TextInput
                        nativeID="field-h5"
                        id="field-h5"
                        ref={(r) => { if (r) inputRefs.current['field-h5'] = r; }}
                        style={[styles.timeInput, fieldErrors.h5 && styles.inputError]}
                        value={currentData.h5}
                        onChangeText={(val) => handleTimeChange(val, 'h5', 'field-h5')}
                        maxLength={2}
                        keyboardType="numeric"
                      />
                      <Text style={styles.timeSufix}>h</Text>
                      <TextInput
                        nativeID="field-m5"
                        id="field-m5"
                        ref={(r) => { if (r) inputRefs.current['field-m5'] = r; }}
                        style={[styles.timeInput, fieldErrors.m5 && styles.inputError]}
                        value={currentData.m5}
                        onChangeText={(val) => handleMinChange(val, 'm5', 'field-m5')}
                        maxLength={2}
                        keyboardType="numeric"
                      />
                      <Text style={styles.timeSufix}>m</Text>
                    </View>
                  </View>
                </View>

                {/* Fim Atendimento */}
                <View style={styles.saidaRowContainer}>
                  <View style={styles.timeSectionBlock}>
                    <Text style={styles.timeSectionLabel}>FIM:</Text>
                    <View style={styles.timeInputsWrapper}>
                      <TextInput
                        nativeID="field-h6"
                        id="field-h6"
                        ref={(r) => { if (r) inputRefs.current['field-h6'] = r; }}
                        style={[styles.timeInput, fieldErrors.h6 && styles.inputError]}
                        value={currentData.h6}
                        onChangeText={(val) => handleTimeChange(val, 'h6', 'field-h6')}
                        maxLength={2}
                        keyboardType="numeric"
                      />
                      <Text style={styles.timeSufix}>h</Text>
                      <TextInput
                        nativeID="field-m6"
                        id="field-m6"
                        ref={(r) => { if (r) inputRefs.current['field-m6'] = r; }}
                        style={[styles.timeInput, fieldErrors.m6 && styles.inputError]}
                        value={currentData.m6}
                        onChangeText={(val) => handleMinChange(val, 'm6', 'field-m6')}
                        maxLength={2}
                        keyboardType="numeric"
                      />
                      <Text style={styles.timeSufix}>m</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Informações sobre a troca */}
            <View style={styles.sectionHeaderBox}>
              <Text style={styles.sectionHeaderTitle}>INFORMAÇÕES SOBRE A TROCA:</Text>

              <InfoBoxEditor
                info={currentData.info}
                alignment={currentData.alinhamentoInfo}
                onUpdateInfo={(val) => updateCurrentTab({ info: val })}
                onUpdateAlignment={(align) => updateCurrentTab({ alinhamentoInfo: align })}
              />

              <Text style={styles.hintInfoText}>
                💡 <Text style={{ fontWeight: 'bold' }}>Dica:</Text> O alinhamento <Text style={{ fontWeight: 'bold' }}>Justificar</Text> distribui o texto para encostar nas margens do relatório.
              </Text>
            </View>

            {/* Passageiros (Embarcando e Desembarcando) - Caixas Altas Féis ao Print */}
            <View style={styles.sectionHeaderBox}>
              <View style={styles.paxNoticeBox}>
                <Text style={styles.paxNoticeText}>
                  💡 Nos campos <Text style={{ fontWeight: 'bold' }}>EMBARCANDO</Text> e <Text style={{ fontWeight: 'bold' }}>DESEMBARCANDO</Text> colocar uma palavra entre *asteriscos* a deixará em <Text style={{ fontWeight: 'bold', color: colors.blue800 }}>Negrito</Text>.
                </Text>
              </View>

              <View style={styles.paxGrid}>
                {/* Embarcando */}
                <View style={styles.paxBoxEmbarque}>
                  <View style={styles.paxHeaderBadgeEmbarque}>
                    <Text style={styles.paxTitleEmbarque}>EMBARCANDO</Text>
                  </View>
                  <TextInput
                    nativeID="field-pax1"
                    id="field-pax1"
                    style={[
                      styles.paxTextInputEmbarque,
                      isPax1Focused ? styles.paxTextInputEmbarqueFocused : styles.paxTextInputEmbarqueUnfocused,
                      fieldErrors.pax1 && styles.inputError,
                    ]}
                    multiline
                    placeholder="1- Nome..."
                    placeholderTextColor={colors.slate400}
                    value={currentData.pax1}
                    onChangeText={(val) => updateCurrentTab({ pax1: val })}
                    onFocus={() => setIsPax1Focused(true)}
                    onBlur={() => setIsPax1Focused(false)}
                  />
                </View>

                {/* Desembarcando */}
                <View style={styles.paxBoxDesembarque}>
                  <View style={styles.paxHeaderBadgeDesembarque}>
                    <Text style={styles.paxTitleDesembarque}>DESEMBARCANDO</Text>
                  </View>
                  <TextInput
                    nativeID="field-pax2"
                    id="field-pax2"
                    style={[
                      styles.paxTextInputDesembarque,
                      isPax2Focused ? styles.paxTextInputDesembarqueFocused : styles.paxTextInputDesembarqueUnfocused,
                      fieldErrors.pax2 && styles.inputError,
                    ]}
                    multiline
                    placeholder="1- Nome..."
                    placeholderTextColor={colors.slate400}
                    value={currentData.pax2}
                    onChangeText={(val) => updateCurrentTab({ pax2: val })}
                    onFocus={() => setIsPax2Focused(true)}
                    onBlur={() => setIsPax2Focused(false)}
                  />
                </View>
              </View>
            </View>

            {/* Anexos Fotográficos */}
            <View style={styles.anexosCard}>
              <Text style={styles.anexosTitle}>ANEXOS FOTOGRÁFICOS</Text>

              <View style={styles.anexosNoticeBox}>
                <Text style={styles.anexosNoticeText}>
                  💡 <Text style={{ fontWeight: 'bold' }}>Dica de Usabilidade:</Text> Ao anexar uma foto, o campo com o título "ANEXO FOTOGRÁFICO" é totalmente editável. Você pode trocá-lo, por exemplo, por "MATERIAL", "CARGO MANIFEST", etc.
                </Text>
              </View>

              {currentData.fotosAnexadas.map((foto, idx) => (
                <View key={foto.id} style={styles.fotoRowCard}>
                  <TouchableOpacity onPress={() => handleEditAttachedPhoto(foto)} activeOpacity={0.8}>
                    <Image source={{ uri: foto.uri }} style={styles.fotoThumb} resizeMode="cover" />
                  </TouchableOpacity>

                  <View style={styles.fotoMetaBox}>
                    <TextInput
                      style={styles.fotoTitleInput}
                      value={foto.titulo}
                      onChangeText={(val) => updateFotoTitle(foto.id, val)}
                      placeholder="ANEXO FOTOGRÁFICO"
                    />

                    <View style={styles.fotoActionsRow}>
                      {idx > 0 && (
                        <TouchableOpacity style={styles.fotoOrderBtn} onPress={() => moveFoto(idx, 'up')}>
                          <Text style={styles.fotoOrderBtnText}>▲ Subir</Text>
                        </TouchableOpacity>
                      )}
                      {idx < currentData.fotosAnexadas.length - 1 && (
                        <TouchableOpacity style={styles.fotoOrderBtn} onPress={() => moveFoto(idx, 'down')}>
                          <Text style={styles.fotoOrderBtnText}>▼ Descer</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.fotoRotateBtn} onPress={() => handleEditAttachedPhoto(foto)}>
                        <Text style={styles.fotoRotateBtnText}>🔄 Rotacionar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.fotoDeleteBtn} onPress={() => removeFoto(foto.id)}>
                        <Text style={styles.fotoDeleteBtnText}>🗑 Excluir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={styles.btnUpload} onPress={handlePickImage}>
                <Text style={styles.btnUploadText}>📷 SELECIONAR IMAGEM</Text>
              </TouchableOpacity>
            </View>

            {/* Prévia do Nome do Arquivo */}
            <View style={styles.filenamePreviewBox}>
              <Text style={styles.filenamePreviewLabel}>PRÉVIA DO NOME DO ARQUIVO:</Text>
              {!(currentData.unidade || currentData.data || currentData.observacao) ? (
                <View style={styles.elegantLoadingContainer}>
                  <Animated.View style={[styles.elegantSpinnerRing, { transform: [{ rotate: spinDegree }] }]}>
                    <View style={styles.elegantSpinnerDot} />
                  </Animated.View>
                  <Animated.Text style={[styles.elegantLoadingText, { opacity: pulseAnim }]}>
                    AGUARDANDO INFORMAÇÕES...
                  </Animated.Text>
                </View>
              ) : (
                <Text style={styles.filenamePreviewValue}>📄 {getFilenamePreview()}</Text>
              )}
            </View>

            {/* Botão Gerar ou Atualizar Relatório */}
            {!pdfGenerated && (
              <TouchableOpacity
                style={[
                  styles.btnGerarPdf,
                  editingReportId ? styles.btnGerarPdfEditing : null,
                ]}
                onPress={handleGerarPDF}
                activeOpacity={0.85}
              >
                <Text style={styles.btnGerarPdfText}>
                  {editingReportId
                    ? `💾 ATUALIZAR RELATÓRIO #${editingReportId}`
                    : 'GERAR RELATÓRIO (PDF)'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Sucesso do Relatório Gerado (Design Fiel ao Anexo 1) */}
            {pdfGenerated && (
              <View style={styles.areaSucessoPdfAnexo1}>
                <View style={styles.sucessoPillHeader}>
                  <Text style={styles.sucessoPillCheck}>✅</Text>
                  <Text style={styles.sucessoPillTitle}>Relatório gerado com sucesso!</Text>
                </View>

                <View style={styles.sucessoActionsRow}>
                  <TouchableOpacity
                    style={styles.btnCompartilharAnexo1}
                    onPress={handleCompartilharWhatsApp}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnCompartilharAnexo1Icon}>🔗</Text>
                    <Text style={styles.btnCompartilharAnexo1Text}>Compartilhar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnBaixarAnexo1}
                    onPress={() => handleExportarPdfOffline('imprimir')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnBaixarAnexo1Icon}>📥</Text>
                    <Text style={styles.btnBaixarAnexo1Text}>Baixar</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.btnEditarAnexo1}
                  onPress={() => {
                    setPdfGenerated(false);
                    if (Platform.OS === 'web') {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnEditarAnexo1Icon}>✏️</Text>
                  <Text style={styles.btnEditarAnexo1Text}>Editar Relatório</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Indicador de Sincronizado conforme Anexo 4 */}
            <View style={styles.sincronizadoRow}>
              <View style={styles.sincronizadoDot} />
              <Text style={styles.sincronizadoText}>SINCRONIZADO</Text>
            </View>
          </View>
        </View>

        {/* PREVIEW COMPLETO DO DOCUMENTO - SEPARADO E EXTERNO AO CARD PRINCIPAL (RÉPLICA DO ANEXO 4) */}
        <Text style={styles.previewTitleMain}>PREVIEW DO DOCUMENTO</Text>

        <View style={styles.previewWrap}>
          <View style={styles.pageA4}>
            {/* Imagem de Fundo Geométrico / Marca D'água */}
            <Image
              source={require('../../assets/images/background.png')}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />

            {/* Header do PDF */}
            <View style={styles.a4FixedLogo}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={{ width: 75, height: 75 }}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.a4DocumentTitle}>RELATÓRIO DE TROCA DE TURMA</Text>

            {/* Informações Principais */}
            <View style={styles.a4Row}>
              <Text style={styles.a4Label}>Unidade: </Text>
              <Text style={styles.a4Value}>{currentData.unidade || 'N/A'}</Text>
            </View>

            <View style={styles.a4Row}>
              <Text style={styles.a4Label}>Data: </Text>
              <Text style={styles.a4Value}>{formatarData(currentData.data) || 'N/A'}</Text>
            </View>

            <View style={styles.a4Row}>
              <Text style={styles.a4Label}>Local: </Text>
              <Text style={styles.a4Value}>{currentData.local || 'N/A'}</Text>
            </View>

            <View style={styles.a4Row}>
              <Text style={styles.a4Label}>Modal: </Text>
              <Text style={styles.a4Value}>{currentData.modal || 'N/A'}</Text>
            </View>

            {/* Horário de Saída do Hotel */}
            <View style={[styles.a4Row, { marginTop: 6 }]}>
              <Text style={styles.a4Label}>Horário de Saída do Hotel (Previsto e Real):</Text>
            </View>
            <View style={{ marginBottom: 4 }}>
              {currentData.listaSaidas.map((item) => (
                <View key={item.id} style={[styles.a4ContentBox, { flexWrap: 'wrap', marginBottom: 2 }]}>
                  <Text style={styles.a4Label}>{item.label1 || 'Previsto'}: </Text>
                  <Text style={styles.a4Value}>{fmtHoraA4(item.h1, item.m1)}</Text>
                  <Text style={[styles.a4Label, { marginLeft: 16 }]}>Real: </Text>
                  <Text style={styles.a4Value}>{fmtHoraA4(item.h2, item.m2)}</Text>
                </View>
              ))}
            </View>

            {/* Horários de Embarque */}
            <View style={[styles.a4Row, { marginTop: 6 }]}>
              <Text style={styles.a4Label}>Horários de Embarque (Previsto e Real):</Text>
            </View>
            <View style={styles.a4ContentBox}>
              <Text style={styles.a4Label}>Previsto: </Text>
              <Text style={styles.a4Value}>{fmtHoraA4(currentData.h3, currentData.m3)}</Text>
              <Text style={[styles.a4Label, { marginLeft: 16 }]}>Real: </Text>
              <Text style={styles.a4Value}>{fmtHoraA4(currentData.h4, currentData.m4)}</Text>
            </View>

            {/* Horário Inicial e de Finalização */}
            <View style={[styles.a4Row, { marginTop: 6 }]}>
              <Text style={styles.a4Label}>Horário Inicial e de finalização:</Text>
            </View>
            <View style={styles.a4ContentBox}>
              <Text style={styles.a4Label}>Início: </Text>
              <Text style={styles.a4Value}>{fmtHoraA4(currentData.h5, currentData.m5)}</Text>
              <Text style={styles.a4Value}> às </Text>
              <Text style={styles.a4Label}>Fim: </Text>
              <Text style={styles.a4Value}>{fmtHoraA4(currentData.h6, currentData.m6)}</Text>
            </View>

            {/* Preposto */}
            <View style={[styles.a4Row, { marginTop: 6 }]}>
              <Text style={styles.a4Label}>Nome do Preposto: </Text>
              <Text style={styles.a4Value}>{currentData.preposto || 'N/A'}</Text>
            </View>

            {/* Informações sobre a troca */}
            <View style={[styles.a4Row, { marginTop: 6 }]}>
              <Text style={styles.a4Label}>Informações sobre a troca de turma:</Text>
            </View>
            <View style={styles.a4InfoBox}>{renderFormattedText(currentData.info, currentData.alinhamentoInfo)}</View>

            {/* Tabela de Passageiros */}
            <View style={styles.a4PaxTable}>
              <View style={styles.a4PaxColLeft}>
                <Text style={styles.a4PaxTitle}>Nomes Passageiros Embarcando:</Text>
                <View>{renderFormattedText(currentData.pax1)}</View>
              </View>
              <View style={styles.a4PaxColRight}>
                <Text style={styles.a4PaxTitle}>Nomes Passageiros Desembarcados:</Text>
                <View>{renderFormattedText(currentData.pax2)}</View>
              </View>
            </View>

            {/* Footer Corporativo (fixo no rodapé da página - Anexo 1) */}
            <View style={styles.a4Footer}>
              <Text style={styles.a4FooterText}>
                Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072{'\n'}
                E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
              </Text>
            </View>
          </View>

          {/* Páginas A4 adicionais para anexos fotográficos */}
          {currentData.fotosAnexadas.map((foto) => (
            <View key={foto.id} style={[styles.pageA4, { marginTop: 24 }]}>
              <View style={styles.a4FixedLogo}>
                <Image
                  source={require('../../assets/images/logo.png')}
                  style={{ width: 64, height: 64 }}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.a4DocumentTitle}>{foto.titulo || 'ANEXO FOTOGRÁFICO'}</Text>

              <View style={styles.a4PhotoContainer}>
                <Image source={{ uri: foto.uri }} style={styles.a4PhotoImage} resizeMode="contain" />
              </View>

              <View style={styles.a4Footer}>
                <Text style={styles.a4FooterText}>
                  Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072{'\n'}
                  E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Barra Flutuante de Navegação Inferior (Exclusiva para WebApp Mobile e Aplicativo) */}
      {isAppOrMobile && (
        <View style={styles.floatingNavWrapper} pointerEvents="box-none">
          <View style={styles.floatingNavPill}>
            <TouchableOpacity
              style={styles.floatingNavItem}
              onPress={limparTudo}
              activeOpacity={0.7}
            >
              <Text style={styles.floatingNavIcon}>🔄</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingNavItem}
              onPress={() => router.push('/meus_relatorios')}
              activeOpacity={0.7}
            >
              <Text style={styles.floatingNavIcon}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingNavItem}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.open('https://relatorios.atmai.com.br', '_blank');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.floatingNavIcon}>🌐</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingNavItem}
              onPress={() => router.push('/meus_relatorios')}
              activeOpacity={0.7}
            >
              <Text style={styles.floatingNavIcon}>↪️</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal Autenticação Supabase */}
      <Modal visible={isAuthModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.authCard}>
            <TouchableOpacity
              style={styles.authCloseBtn}
              onPress={() => setIsAuthModalVisible(false)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.authCloseText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.authTitle}>
              {authMode === 'login' ? 'ACESSO Á PLATAFORMA' : 'CRIAR NOVA CONTA'}
            </Text>

            {authMsg && (
              <View style={[styles.authMsgBox, authMsg.type === 'erro' ? styles.authMsgErro : styles.authMsgSucesso]}>
                <Text style={styles.authMsgText}>{authMsg.text}</Text>
              </View>
            )}

            {authMode === 'cadastro' && (
              <View style={styles.authField}>
                <Text style={styles.authLabel}>NOME COMPLETO</Text>
                <TextInput
                  style={styles.authInput}
                  placeholder="Seu nome"
                  placeholderTextColor={colors.slate400}
                  value={authName}
                  onChangeText={setAuthName}
                />
              </View>
            )}

            <View style={styles.authField}>
              <Text style={styles.authLabel}>
                {authMode === 'login' ? 'E-MAIL OU NOME DE USUÁRIO' : 'E-MAIL'}
              </Text>
              <TextInput
                style={styles.authInput}
                placeholder={authMode === 'login' ? 'Seu e-mail ou nome de usuário' : 'seu.email@exemplo.com'}
                placeholderTextColor={colors.slate400}
                keyboardType="email-address"
                autoCapitalize="none"
                value={authEmail}
                onChangeText={setAuthEmail}
              />
            </View>

            <View style={styles.authField}>
              <Text style={styles.authLabel}>SENHA</Text>
              <TextInput
                style={styles.authInput}
                placeholder="••••••••"
                placeholderTextColor={colors.slate400}
                secureTextEntry
                value={authPassword}
                onChangeText={setAuthPassword}
              />
            </View>

            {authMode === 'cadastro' && (
              <View style={styles.authField}>
                <Text style={styles.authLabel}>CONFIRMAR SENHA</Text>
                <TextInput
                  style={styles.authInput}
                  placeholder="••••••••"
                  placeholderTextColor={colors.slate400}
                  secureTextEntry
                  value={authConfirmPassword}
                  onChangeText={setAuthConfirmPassword}
                />
              </View>
            )}

            <TouchableOpacity style={styles.btnAuthSubmit} onPress={handleAuthSubmit} disabled={authLoading}>
              {authLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.btnAuthSubmitText}>
                  {authMode === 'login' ? 'ENTRAR NA PLATAFORMA' : 'CADASTRAR CONTA'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.authToggleMode}
              onPress={() => {
                setAuthMsg(null);
                setAuthMode(authMode === 'login' ? 'cadastro' : 'login');
              }}
            >
              <Text style={styles.authToggleModeText}>
                {authMode === 'login'
                  ? 'Não tem uma conta? Cadastre-se aqui'
                  : 'Já tem uma conta? Faça login'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de Edição e Rotação de Imagem ("CONFIRMAR E ANEXAR") */}
      <Modal visible={imageEditorModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.cropEditorCard}>
            <TouchableOpacity
              style={styles.authCloseBtn}
              onPress={() => setImageEditorModal((prev) => ({ ...prev, visible: false }))}
            >
              <Text style={styles.authCloseText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.cropEditorTitle}>EDITAR E ANEXAR IMAGEM</Text>

            <View style={styles.cropPreviewContainer}>
              {imageEditorModal.rawUri ? (
                <Image
                  source={{ uri: imageEditorModal.rawUri }}
                  style={[
                    styles.cropPreviewImage,
                    { transform: [{ rotate: `${imageEditorModal.rotation}deg` }] },
                  ]}
                  resizeMode="contain"
                />
              ) : null}
            </View>

            <View style={styles.cropControlsRow}>
              <TouchableOpacity
                style={styles.btnRotateQuarter}
                onPress={() =>
                  setImageEditorModal((prev) => ({
                    ...prev,
                    rotation: (prev.rotation + 90) % 360,
                  }))
                }
              >
                <Text style={styles.btnRotateQuarterText}>🔄 Rotacionar 90° ({imageEditorModal.rotation}°)</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.inputGroup, { marginTop: 12, width: '100%' }]}>
              <Text style={styles.label}>TÍTULO DO ANEXO:</Text>
              <TextInput
                style={styles.input}
                value={imageEditorModal.titulo}
                onChangeText={(val) =>
                  setImageEditorModal((prev) => ({ ...prev, titulo: val.toUpperCase() }))
                }
                placeholder="ANEXO FOTOGRÁFICO"
                autoCapitalize="characters"
              />
            </View>

            <TouchableOpacity
              style={styles.btnConfirmAttach}
              onPress={handleSaveImageEdit}
              activeOpacity={0.8}
            >
              <Text style={styles.btnConfirmAttachText}>✅ CONFIRMAR E ANEXAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Pop-up Alert: Banner "Salvar na Nuvem" (Aviso em Modal para Visitantes não logados) */}
      <Modal visible={!userSession && !isBannerDismissed} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.cloudBannerPopUpCard}>
            <TouchableOpacity
              style={styles.authCloseBtn}
              onPress={() => setIsBannerDismissed(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.authCloseText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.cloudBannerPopUpHeader}>
              <View style={styles.cloudBannerIconBoxPopUp}>
                <Text style={{ fontSize: 28 }}>☁️</Text>
              </View>
              <Text style={styles.cloudBannerTitlePopUp}>Sincronização em Nuvem</Text>
              <Text style={styles.cloudBannerPopUpSubtitle}>
                Acesse seus relatórios de qualquer dispositivo
              </Text>
            </View>

            <Text style={styles.cloudBannerPopUpBody}>
              Conecte sua conta para salvar relatórios com segurança no banco de dados, sincronizar fotos de atendimentos e consultar todo o seu histórico em tempo real.
            </Text>

            <View style={styles.cloudBannerPopUpActions}>
              <TouchableOpacity
                style={styles.btnBannerEntrarPopUp}
                onPress={() => {
                  setIsBannerDismissed(true);
                  setAuthMode('login');
                  setIsAuthModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.btnBannerEntrarPopUpText}>🔑 ENTRAR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnBannerCriarContaPopUp}
                onPress={() => {
                  setIsBannerDismissed(true);
                  setAuthMode('cadastro');
                  setIsAuthModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.btnBannerCriarContaPopUpText}>✨ CRIAR CONTA</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setIsBannerDismissed(true)}
              style={{ marginTop: 14, paddingVertical: 4 }}
            >
              <Text style={styles.btnBannerContinuarVisitante}>Continuar como visitante por enquanto</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Pop-up Personalizado Reutilizável (Substitui Alerts Nativos) */}
      <Modal visible={customDialog.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.warningCard}>
            <View style={styles.warningIconCircle}>
              <Text style={styles.warningIconText}>
                {customDialog.type === 'confirm' ? '❓' : 'ⓘ'}
              </Text>
            </View>

            <Text style={styles.warningTitle}>{customDialog.title || 'AVISO'}</Text>

            <Text style={styles.warningMessage}>{customDialog.message}</Text>

            <View style={styles.customDialogButtonsRow}>
              {customDialog.type === 'confirm' && (
                <TouchableOpacity
                  style={styles.btnCustomCancel}
                  onPress={customDialog.onCancel}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnCustomCancelText}>
                    {customDialog.cancelText || 'Cancelar'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.btnWarningOk,
                  customDialog.type === 'confirm' && { flex: 1 },
                ]}
                onPress={customDialog.onConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.btnWarningOkText}>
                  {customDialog.confirmText || 'OK'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Formata horas no preview A4 no padrão do documento oficial: "HH h MM min" (campos vazios ficam em branco)
const fmtHoraA4 = (h?: string, m?: string) => {
  if (h === 'N/A') return 'N/A';
  const blank = '\u00A0\u00A0\u00A0';
  return `${h || blank} h ${m || blank} min`;
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    backgroundColor: colors.body,
  },
  navbar: {
    height: 56,
    backgroundColor: colors.slate900,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate800,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 50,
  },
  navTitleText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  navMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  navMenuBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  navMenuBtnText: {
    color: colors.white,
    fontWeight: '700', // Removido o negrito extra pesado (900), idêntico ao Anexo 2
    fontSize: 14,
    letterSpacing: 0.5,
    fontFamily: modernFont,
  },
  navMenuBtnTextActive: {
    color: colors.white,
  },
  menuIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#06b6d4', // Ciano idêntico ao Anexo 2
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconCircleText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
    fontFamily: modernFont,
  },
  hamburgerLinesContainer: {
    width: 18,
    height: 14,
    justifyContent: 'space-between',
    marginLeft: 4,
  },
  hamburgerLineBar: {
    width: 18,
    height: 2,
    backgroundColor: colors.slate200,
    borderRadius: 1,
  },
  hamburgerLineBarActive: {
    backgroundColor: colors.blue500,
  },
  dropdownModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 16,
  },
  dropdownMenuCard: {
    width: 280,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.slate200,
    elevation: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    padding: 8,
    overflow: 'hidden',
  },
  dropdownMenuCardLight: {
    backgroundColor: colors.white,
    borderColor: colors.slate300,
  },
  menuThemeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: colors.slate50,
    borderRadius: 8,
  },
  menuThemeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.slate800,
    fontFamily: modernFont,
  },
  themeToggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.slate300,
    padding: 2,
    justifyContent: 'center',
  },
  themeToggleTrackActive: {
    backgroundColor: colors.indigo600,
  },
  themeToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  themeToggleThumbActive: {
    alignSelf: 'flex-end',
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.slate200,
    marginVertical: 6,
  },
  menuHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
    backgroundColor: colors.slate50,
  },
  menuHeaderLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.slate400,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  menuHeaderName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.slate800,
    marginTop: 2,
    fontFamily: modernFont,
  },
  nivelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nivelBadgeCoord: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  nivelBadgePreposto: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  nivelBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  nivelBadgeCoordText: {
    color: '#b45309',
  },
  nivelBadgePrepostoText: {
    color: '#0369a1',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginVertical: 2,
  },
  menuItemSelected: {
    backgroundColor: colors.blue50,
    borderLeftWidth: 4,
    borderLeftColor: colors.blue600,
  },
  menuItemSelectedAmber: {
    backgroundColor: colors.amber50,
    borderLeftWidth: 4,
    borderLeftColor: colors.amber800,
  },
  menuItemSelectedEmerald: {
    backgroundColor: colors.emerald50,
    borderLeftWidth: 4,
    borderLeftColor: colors.emerald600,
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.slate700,
    fontFamily: modernFont,
  },
  cloudBannerWrapper: {
    width: '100%',
    maxWidth: 672,
    marginBottom: 16,
    alignSelf: 'center',
  },
  cloudBannerBox: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    position: 'relative',
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  cloudBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  cloudBannerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cloudBannerIcon: {
    fontSize: 20,
  },
  cloudBannerTextGroup: {
    flex: 1,
  },
  cloudBannerTitle: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 14,
    fontFamily: modernFont,
    letterSpacing: 0.5,
  },
  cloudBannerText: {
    color: '#dbeafe',
    fontWeight: '500',
    fontSize: 11,
    fontFamily: modernFont,
    marginTop: 2,
    lineHeight: 16,
  },
  cloudBannerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 20,
  },
  btnBannerEntrar: {
    backgroundColor: colors.white,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  btnBannerEntrarText: {
    color: colors.blue700,
    fontWeight: '900',
    fontSize: 11,
    fontFamily: modernFont,
    letterSpacing: 1,
  },
  btnBannerCriarConta: {
    backgroundColor: '#1e40af',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  btnBannerCriarContaText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 11,
    fontFamily: modernFont,
    letterSpacing: 1,
  },
  cloudBannerCloseBtn: {
    position: 'absolute',
    top: 10,
    right: 12,
    padding: 4,
  },
  cloudBannerCloseText: {
    color: '#bfdbfe',
    fontWeight: 'bold',
    fontSize: 14,
  },
  menuItemTextSelected: {
    fontWeight: '900',
  },
  menuItemSelectedCheck: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.blue600,
  },
  scroll: {
    padding: 12,
    paddingBottom: 48,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 672,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.white,
    marginBottom: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 36,
  },
  headerLogoImage: {
    height: 60,
    width: 150,
  },
  btnNovoRelatorio: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: 8,
    gap: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  btnNovoRelatorioIcon: {
    color: colors.slate600,
    fontSize: 16,
    fontWeight: '600',
  },
  btnNovoRelatorioText: {
    color: colors.slate700,
    fontWeight: '700',
    fontSize: 13,
    fontFamily: modernFont,
  },
  mainTitle: {
    fontSize: 24, // Aumentado em +2px para destaque elegante (de 22px para 24px)
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
    color: colors.slate800,
    textTransform: 'uppercase',
    letterSpacing: -0.5,
    fontFamily: corporateFont,
  },
  headerDivider: {
    height: 1,
    backgroundColor: colors.slate200,
    marginBottom: 24,
  },
  editingBannerCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  editingBannerLeft: {
    flex: 1,
    minWidth: 240,
  },
  editingBannerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  editingBannerBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#b45309',
    letterSpacing: 0.5,
  },
  editingBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#78350f',
  },
  editingBannerSub: {
    fontSize: 11,
    color: '#92400e',
    marginTop: 2,
  },
  btnCancelarEdicao: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d97706',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  btnCancelarEdicaoText: {
    color: '#b45309',
    fontWeight: '800',
    fontSize: 11,
  },
  tabsSection: {
    marginBottom: 24,
  },
  tabsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tabsSectionTitle: {
    fontWeight: '900',
    fontSize: 10,
    color: colors.slate400,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: corporateFont,
  },
  btnAddTab: {
    backgroundColor: colors.blue50,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue200,
  },
  btnAddTabText: {
    color: colors.blue600,
    fontWeight: '900',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: corporateFont,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.slate100,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.slate200,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  tabActive: {
    backgroundColor: colors.white,
    borderColor: colors.slate200,
    elevation: 2,
  },
  tabRemoveBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.rose100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRemoveText: {
    color: colors.rose600,
    fontSize: 10,
    fontWeight: '900',
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: colors.slate400,
    letterSpacing: 0.5,
    fontFamily: corporateFont,
  },
  tabLabelActive: {
    color: colors.blue600,
  },
  tabName: {
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
    fontFamily: corporateFont,
  },
  formContainer: {
    gap: 20, // Aumentado o espaçamento entre os grupos de campos
  },
  inputGroup: {
    flexDirection: 'column',
    marginBottom: 4,
  },
  label: {
    fontWeight: '900',
    fontSize: 11,
    color: colors.black,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    fontFamily: corporateFont,
  },
  selectBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  selectBoxText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.slate800,
    fontFamily: corporateFont,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectBoxChevron: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.slate600,
  },
  dropdownOptionsList: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
  },
  dropdownOptionItemActive: {
    backgroundColor: colors.blue50,
  },
  dropdownOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate700,
    fontFamily: corporateFont,
  },
  dropdownOptionTextActive: {
    color: colors.blue700,
    fontWeight: '900',
  },
  dropdownOptionCheck: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.blue600,
  },
  rowSplit: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    fontWeight: '500',
    color: colors.slate800,
    backgroundColor: colors.slate50,
    fontFamily: corporateFont,
  },
  obsBox: {
    backgroundColor: colors.indigo50,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.indigo100,
    marginVertical: 4,
  },
  obsLabel: {
    fontWeight: '900',
    fontSize: 11,
    color: colors.indigo800,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    fontFamily: corporateFont,
  },
  obsInput: {
    borderWidth: 1,
    borderColor: colors.indigo200,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    fontWeight: '700',
    color: colors.indigo900,
    backgroundColor: colors.white,
    marginBottom: 6,
    fontFamily: corporateFont,
  },
  obsHint: {
    fontSize: 11,
    color: colors.indigo800,
    lineHeight: 16,
    fontFamily: corporateFont,
  },
  horariosBox: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 16,
    marginVertical: 8,
  },
  horariosTitle: {
    fontWeight: '900',
    fontSize: 16,
    color: '#0f172a',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
    marginBottom: 4,
    fontFamily: corporateFont,
  },
  horarioCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 14,
  },
  horarioBadgeWrapper: {
    alignItems: 'center',
    marginBottom: 2,
  },
  horarioBadge: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1d4ed8',
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: corporateFont,
  },
  dicaBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef08a',
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
  },
  dicaText: {
    fontSize: 12,
    color: '#b45309',
    fontFamily: corporateFont,
    lineHeight: 18,
  },
  dicaTag: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fde047',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#854d0e',
  },
  saidaRowContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    borderRadius: 12,
    gap: 16,
    position: 'relative',
    alignItems: 'center',
  },
  saidaFieldHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  timeSectionBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  timeSectionLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: corporateFont,
  },
  saidaLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  saidaLabelInput: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1d4ed8',
    textAlign: 'center',
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
    fontFamily: corporateFont,
  },
  saidaRealLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: corporateFont,
  },
  colon: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#1d4ed8',
    marginLeft: 3,
  },
  btnRemoveSaida: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ffe4e6',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f43f5e',
  },
  btnRemoveSaidaText: {
    color: '#e11d48',
    fontWeight: 'bold',
    fontSize: 11,
  },
  timeRow: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  timeRowLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: corporateFont,
  },
  timeInputsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  timeInput: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    width: 68,
    height: 48,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontFamily: corporateFont,
  },
  disabledInput: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
    borderColor: '#e2e8f0',
  },
  timeSufix: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 14,
    marginHorizontal: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 6,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  checkboxLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: corporateFont,
  },
  btnNovaSaida: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    marginTop: 6,
  },
  btnNovaSaidaText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: corporateFont,
  },
  sectionHeaderBox: {
    marginTop: 8,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.slate800,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    fontFamily: corporateFont,
  },
  textAreaContainer: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 8,
    overflow: 'hidden',
  },
  textAreaToolbar: {
    backgroundColor: colors.slate100,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    padding: 6,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  toolbarDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.slate300,
    marginHorizontal: 2,
  },
  toolbarBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  toolbarBtnActive: {
    backgroundColor: colors.blue50,
    borderColor: colors.blue200,
  },
  toolbarBtnText: {
    fontSize: 11,
    color: colors.slate700,
    fontFamily: corporateFont,
  },
  toolbarBtnTextActive: {
    color: colors.blue700,
    fontWeight: '900',
  },
  textAreaInput: {
    minHeight: 280, // Aumentado em +30px conforme solicitado
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
    color: colors.slate800,
    backgroundColor: colors.white,
    fontFamily: corporateFont,
    lineHeight: 22,
  },
  hintInfoText: {
    fontSize: 10,
    color: colors.slate500,
    marginTop: 4,
    fontFamily: corporateFont,
  },
  paxNoticeBox: {
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue100,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  paxNoticeText: {
    fontSize: 11,
    color: colors.blue800,
    lineHeight: 16,
    fontFamily: corporateFont,
  },
  paxGrid: {
    gap: 16,
  },
  paxBoxEmbarque: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#d1fae5',
    borderRadius: 12,
    padding: 12,
  },
  paxHeaderBadgeEmbarque: {
    backgroundColor: '#e6f7f0',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  paxTitleEmbarque: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: corporateFont,
  },
  paxBoxDesembarque: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 12,
    padding: 12,
  },
  paxHeaderBadgeDesembarque: {
    backgroundColor: '#fff1f2',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  paxTitleDesembarque: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#be123c',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: corporateFont,
  },
  paxTextInputEmbarque: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    minHeight: 380,
    fontSize: 13,
    color: colors.slate800,
    textAlignVertical: 'top',
    fontFamily: corporateFont,
  },
  paxTextInputEmbarqueUnfocused: {
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
  },
  paxTextInputEmbarqueFocused: {
    borderWidth: 2,
    borderColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  paxTextInputDesembarque: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    minHeight: 380,
    fontSize: 13,
    color: colors.slate800,
    textAlignVertical: 'top',
    fontFamily: corporateFont,
  },
  paxTextInputDesembarqueUnfocused: {
    borderWidth: 1.5,
    borderColor: '#fecdd3',
  },
  paxTextInputDesembarqueFocused: {
    borderWidth: 2,
    borderColor: '#f43f5e',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  inputDisabledPreposto: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    color: '#475569',
    fontWeight: '700',
  },
  prepostoLockBadge: {
    backgroundColor: '#e0e7ff',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  prepostoLockText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3730a3',
    fontFamily: modernFont,
  },
  anexosCard: {
    backgroundColor: colors.slate50,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginTop: 8,
  },
  anexosTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.slate700,
    textTransform: 'uppercase',
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.slate200,
    paddingBottom: 6,
    marginBottom: 8,
    fontFamily: corporateFont,
  },
  anexosNoticeBox: {
    backgroundColor: colors.indigo50,
    borderWidth: 1,
    borderColor: colors.indigo100,
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  anexosNoticeText: {
    fontSize: 10,
    color: colors.indigo900,
    lineHeight: 14,
    fontFamily: corporateFont,
  },
  fotoRowCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    gap: 10,
  },
  fotoThumb: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  fotoMetaBox: {
    flex: 1,
    justifyContent: 'space-between',
  },
  fotoTitleInput: {
    fontSize: 12,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    paddingVertical: 2,
    fontFamily: corporateFont,
  },
  fotoActionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  fotoOrderBtn: {
    backgroundColor: colors.slate100,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  fotoOrderBtnText: {
    fontSize: 10,
    color: colors.slate700,
    fontWeight: '700',
    fontFamily: corporateFont,
  },
  fotoDeleteBtn: {
    backgroundColor: colors.rose50,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  fotoDeleteBtnText: {
    fontSize: 10,
    color: colors.rose600,
    fontWeight: '700',
    fontFamily: corporateFont,
  },
  btnUpload: {
    backgroundColor: colors.indigo600,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnUploadText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: corporateFont,
  },
  filenamePreviewBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  filenamePreviewLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.indigo600,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  filenamePreviewValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.slate800,
    marginTop: 4,
    fontFamily: modernFont,
  },
  elegantLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  elegantSpinnerRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#c7d2fe',
    borderTopColor: colors.indigo600,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  elegantSpinnerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.indigo600,
    marginTop: -1,
  },
  elegantLoadingText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.indigo600,
    letterSpacing: 1.2,
    fontFamily: modernFont,
  },
  btnGerarPdf: {
    backgroundColor: colors.emerald600,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  btnGerarPdfText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: corporateFont,
  },
  areaSucessoPdfAnexo1: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    gap: 14,
  },
  sucessoPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sucessoPillCheck: {
    fontSize: 18,
  },
  sucessoPillTitle: {
    color: '#15803d',
    fontWeight: '900',
    fontSize: 17,
    fontFamily: corporateFont,
  },
  sucessoActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btnCompartilharAnexo1: {
    flex: 1,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnCompartilharAnexo1Icon: {
    fontSize: 18,
    color: '#ffffff',
  },
  btnCompartilharAnexo1Text: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
    fontFamily: corporateFont,
  },
  btnBaixarAnexo1: {
    flex: 1,
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#1e293b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnBaixarAnexo1Icon: {
    fontSize: 18,
    color: '#ffffff',
  },
  btnBaixarAnexo1Text: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
    fontFamily: corporateFont,
  },
  btnEditarAnexo1: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  btnEditarAnexo1Icon: {
    fontSize: 18,
    color: '#1e293b',
  },
  btnEditarAnexo1Text: {
    color: '#1e293b',
    fontWeight: '800',
    fontSize: 16,
    fontFamily: corporateFont,
  },
  btnGerarPdfEditing: {
    backgroundColor: '#d97706',
  },
  sincronizadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  sincronizadoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  sincronizadoText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  floatingNavWrapper: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99,
  },
  floatingNavPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    gap: 24,
  },
  floatingNavItem: {
    padding: 6,
  },
  floatingNavIcon: {
    fontSize: 20,
  },
  demoBannerBox: {
    marginTop: 24,
    backgroundColor: colors.amber50,
    borderWidth: 1,
    borderColor: colors.amber200,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: colors.amber800,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  demoBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.amber800,
  },
  demoBannerText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.amber800,
    textAlign: 'center',
    letterSpacing: 0.5,
    fontFamily: corporateFont,
  },
  previewTitleMain: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.slate400,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 32,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: corporateFont,
  },
  previewWrap: {
    width: '100%',
    maxWidth: 794,
    alignItems: 'center',
  },
  pageA4: {
    backgroundColor: colors.white,
    width: '100%',
    maxWidth: 794,
    minHeight: 1123,
    aspectRatio: 1 / 1.414,
    borderRadius: 4,
    paddingHorizontal: 40,
    paddingBottom: 120,
    paddingTop: 110,
    borderWidth: 1,
    borderColor: colors.slate200,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  a4FixedLogo: {
    position: 'absolute',
    top: 15,
    left: 20,
    zIndex: 10,
  },
  a4DocumentTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 20,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
    marginBottom: 16,
    marginTop: 0,
    color: colors.black,
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4Row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  a4Label: {
    fontWeight: 'bold',
    fontSize: 16,
    color: colors.black,
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4Value: {
    fontSize: 16,
    color: colors.black,
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4ContentBox: {
    marginLeft: 16,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  a4InfoBox: {
    minHeight: 60,
    padding: 6,
    fontSize: 16,
    color: colors.black,
    lineHeight: 22,
  },
  a4PaxTable: {
    flexDirection: 'row',
    marginTop: 32,
    paddingTop: 4,
  },
  a4PaxColLeft: {
    width: '46%',
    paddingRight: 15,
    borderRightWidth: 1,
    borderRightColor: '#ccc',
  },
  a4PaxColRight: {
    width: '54%',
    paddingLeft: 25,
  },
  a4PaxTitle: {
    fontWeight: 'bold',
    fontSize: 17,
    marginBottom: 12,
    color: colors.black,
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4Footer: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 48,
    alignItems: 'center',
  },
  a4FooterText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 'bold',
    color: colors.black,
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4PhotoContainer: {
    height: 380,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  a4PhotoImage: {
    width: '100%',
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  authCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    position: 'relative',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  authCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  authCloseText: {
    color: colors.slate600,
    fontWeight: 'bold',
    fontSize: 16,
  },
  authTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.slate800,
    textAlign: 'center',
    marginBottom: 16,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  authMsgBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  authMsgErro: {
    backgroundColor: colors.rose50,
    borderWidth: 1,
    borderColor: colors.rose200,
  },
  authMsgSucesso: {
    backgroundColor: colors.emerald50,
    borderWidth: 1,
    borderColor: colors.emerald200,
  },
  authMsgText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: modernFont,
  },
  authField: {
    marginBottom: 12,
  },
  authLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.slate500,
    marginBottom: 4,
    fontFamily: modernFont,
  },
  authInput: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    backgroundColor: colors.slate50,
    color: colors.slate800,
    fontFamily: modernFont,
  },
  btnAuthSubmit: {
    backgroundColor: colors.blue600,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  btnAuthSubmitText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  authToggleMode: {
    marginTop: 16,
    alignItems: 'center',
  },
  authToggleModeText: {
    fontSize: 11,
    color: colors.slate500,
    fontWeight: '700',
    fontFamily: modernFont,
  },
  inputError: {
    borderColor: '#f87171',
    borderWidth: 2,
    backgroundColor: '#ffe4e6',
  },
  warningCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: '90%',
    maxWidth: 440,
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  warningIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  warningIconText: {
    fontSize: 32,
    color: '#059669',
    fontWeight: 'bold',
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.slate800,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 12,
    fontFamily: modernFont,
  },
  warningMessage: {
    fontSize: 14,
    color: colors.slate600,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    fontFamily: modernFont,
  },
  btnWarningOk: {
    backgroundColor: '#059669',
    borderRadius: 8,
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnWarningOkText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  userInitialCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  userInitialText: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 13,
  },
  menuItemIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  fotoRotateBtn: {
    backgroundColor: colors.indigo50,
    borderWidth: 1,
    borderColor: colors.indigo200,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  fotoRotateBtnText: {
    color: colors.indigo700,
    fontWeight: 'bold',
    fontSize: 11,
    fontFamily: corporateFont,
  },
  cropEditorCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 480,
    alignItems: 'center',
    position: 'relative',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  cropEditorTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.slate800,
    letterSpacing: 1,
    marginBottom: 16,
    fontFamily: corporateFont,
  },
  cropPreviewContainer: {
    width: '100%',
    height: 260,
    backgroundColor: colors.slate900,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cropPreviewImage: {
    width: '100%',
    height: '100%',
  },
  cropControlsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
    justifyContent: 'center',
  },
  btnRotateQuarter: {
    backgroundColor: colors.indigo600,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  btnRotateQuarterText: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 12,
    fontFamily: corporateFont,
  },
  btnConfirmAttach: {
    backgroundColor: colors.emerald600,
    paddingVertical: 14,
    width: '100%',
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  btnConfirmAttachText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
    fontFamily: corporateFont,
  },
  customDialogButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  btnCustomCancel: {
    flex: 1,
    backgroundColor: colors.slate200,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCustomCancelText: {
    color: colors.slate700,
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: modernFont,
  },
  cloudBannerPopUpCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 22,
    width: '92%',
    maxWidth: 440,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cloudBannerPopUpHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  cloudBannerIconBoxPopUp: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#bfdbfe',
  },
  cloudBannerTitlePopUp: {
    color: '#0f172a',
    fontWeight: '900',
    fontSize: 20,
    fontFamily: modernFont,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  cloudBannerPopUpSubtitle: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  cloudBannerPopUpBody: {
    fontSize: 14,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 22,
    fontFamily: modernFont,
  },
  cloudBannerPopUpActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  btnBannerEntrarPopUp: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnBannerEntrarPopUpText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: modernFont,
    letterSpacing: 0.5,
  },
  btnBannerCriarContaPopUp: {
    flex: 1,
    backgroundColor: '#4f46e5',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnBannerCriarContaPopUpText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: modernFont,
    letterSpacing: 0.5,
  },
  btnBannerContinuarVisitante: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
