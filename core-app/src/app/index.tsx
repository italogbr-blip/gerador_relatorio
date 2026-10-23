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
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { formatReportPdfUrl } from '../lib/config';
import { gerarHtmlPdfFidelidade } from '../lib/pdfHtmlGenerator';
import {
  baixarPdfRelatorio,
  compartilharPdfRelatorio,
  gerarNomeArquivoPdf,
  gerarPdfBlob,
  visualizarRelatorioHtml,
} from '../lib/pdfManager';
import {
  getSavedSessionSync,
  getValidatedUserSession,
  saveSessionLocal,
  logoutUserSession,
  isUserCoordinator,
  authenticateUser,
  AppUserSession,
} from '../lib/auth';
import {
  fetchFooterConfig,
  getLocalFooterConfig,
  fetchLatestAppVersion,
  FooterConfig,
} from '../lib/footerConfig';

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
      @keyframes mmsHaloPulse {
        0% {
          transform: scale(0.92);
          opacity: 0.35;
        }
        50% {
          transform: scale(1.3);
          opacity: 0.8;
        }
        100% {
          transform: scale(0.92);
          opacity: 0.35;
        }
      }
      .mms-halo-pulse {
        animation: mmsHaloPulse 2s ease-in-out infinite !important;
      }
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
      /* Efeito Blur Suave e Reduzido para Pop-ups e Modais (sem escurecer) */
      .modal-blur-overlay,
      div[data-modal-blur="true"] {
        backdrop-filter: blur(2px) !important;
        -webkit-backdrop-filter: blur(2px) !important;
        background-color: rgba(15, 23, 42, 0.08) !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// Ícones Flat Material Design Oficiais (Google Material Design)
const MATERIAL_PATHS = {
  refresh: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  public: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  alert: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  warningTriangle: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  check: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
};

type MaterialIconName = keyof typeof MATERIAL_PATHS;

const MaterialFlatIcon = ({
  name,
  size = 24,
  color = '#2563eb',
  style,
}: {
  name: MaterialIconName;
  size?: number;
  color?: string;
  style?: any;
}) => {
  const path = MATERIAL_PATHS[name] || MATERIAL_PATHS.info;

  if (Platform.OS === 'web') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={color}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          ...style,
        }}
      >
        <path d={path} />
      </svg>
    );
  }

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}"><path d="${path}"/></svg>`;
  return (
    <Image
      source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}` }}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
};

// ─── COMPONENTE FABBAR (INSPIRADO NO REPOSITÓRIO RYANASHCRAFT/FABBAR) ───
// Reproduz a barra Liquid Glass com cápsula de abas e botão FAB (+)
interface FabBarTabConfig {
  id: string;
  label: string;
  icon: MaterialIconName;
}

const FabBarTabButton = ({
  tab,
  isActive,
  isDarkMode,
  onPress,
}: {
  tab: FabBarTabConfig;
  isActive: boolean;
  isDarkMode: boolean;
  onPress: () => void;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: Platform.OS !== 'web',
      friction: 6,
      tension: 140,
    }).start();
  };

  const handlePressOut = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.12,
        useNativeDriver: Platform.OS !== 'web',
        friction: 4,
        tension: 110,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
        friction: 5,
        tension: 80,
      }),
    ]).start();
  };

  const activeColor = isDarkMode ? '#60a5fa' : '#2563eb';
  const inactiveColor = isDarkMode ? '#94a3b8' : '#64748b';
  const iconColor = isActive ? activeColor : inactiveColor;

  return (
    <TouchableOpacity
      style={[
        styles.fabBarTab,
        isActive && (isDarkMode ? styles.fabBarTabActiveDark : styles.fabBarTabActiveLight),
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
      accessibilityLabel={tab.label}
    >
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialFlatIcon name={tab.icon} size={20} color={iconColor} />
        <Text
          style={[
            styles.fabBarTabLabel,
            isDarkMode ? styles.fabBarTabLabelDark : styles.fabBarTabLabelLight,
            isActive && (isDarkMode ? styles.fabBarTabLabelActiveDark : styles.fabBarTabLabelActiveLight),
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

// Controle de visibilidade do Botão FAB (+) Circular Flutuante
// Ocultado conforme solicitação do usuário. Código preservado para uso futuro.
// Para reativar o botão futuramente, basta alterar SHOW_FAB_BUTTON para true.
const SHOW_FAB_BUTTON = false;

const FabBar = ({
  activeTab,
  onSelectTab,
  onFabPress,
  isDarkMode,
}: {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onFabPress?: () => void;
  isDarkMode: boolean;
}) => {
  const fabScaleAnim = useRef(new Animated.Value(1)).current;

  const handleFabPressIn = () => {
    Animated.spring(fabScaleAnim, {
      toValue: 0.86,
      useNativeDriver: Platform.OS !== 'web',
      friction: 6,
      tension: 140,
    }).start();
  };

  const handleFabPressOut = () => {
    Animated.sequence([
      Animated.spring(fabScaleAnim, {
        toValue: 1.15,
        useNativeDriver: Platform.OS !== 'web',
        friction: 4,
        tension: 100,
      }),
      Animated.spring(fabScaleAnim, {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
        friction: 5,
        tension: 80,
      }),
    ]).start();
  };

  const tabs: FabBarTabConfig[] = [
    { id: 'inicio', label: 'Início', icon: 'home' },
    { id: 'coord', label: 'Coordenação', icon: 'settings' },
    { id: 'relatorios', label: 'Relatórios', icon: 'folder' },
    { id: 'logout', label: 'Sair', icon: 'logout' },
  ];

  return (
    <View style={styles.fabBarWrapper} pointerEvents="box-none">
      <View style={styles.fabBarContainer}>
        {/* 1. Cápsula de Abas Liquid Glass */}
        <View
          style={[
            styles.fabBarCapsule,
            isDarkMode ? styles.fabBarCapsuleDark : styles.fabBarCapsuleLight,
          ]}
        >
          {tabs.map((tab) => (
            <FabBarTabButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              isDarkMode={isDarkMode}
              onPress={() => onSelectTab(tab.id)}
            />
          ))}
        </View>

        {/* 2. Floating Action Button (FAB) Tinted Liquid Glass (+) */}
        {/* Ocultado conforme solicitação do usuário. Código preservado intacto para uso futuro caso necessário. */}
        {SHOW_FAB_BUTTON && (
          <TouchableOpacity
            style={styles.fabButtonTouch}
            onPress={onFabPress}
            onPressIn={handleFabPressIn}
            onPressOut={handleFabPressOut}
            activeOpacity={0.85}
            accessibilityLabel="Iniciar Novo Relatório"
          >
            <Animated.View
              style={[
                styles.fabButtonCircle,
                { transform: [{ scale: fabScaleAnim }] },
              ]}
            >
              <MaterialFlatIcon name="plus" size={26} color="#ffffff" />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const GRUPO_OPTIONS = ['TECHNIP', 'DOF', 'TECHNIP/DOF', 'CONSTELLATION', 'ZONDA', 'OUTROS'];

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
  pdfUrl?: string | null;
  pdfNomeArquivo?: string | null;
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
  pdfUrl: null,
  pdfNomeArquivo: null,
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
          id="in-info"
          ref={webEditorRef}
          contentEditable
          onInput={handleWebInput}
          onBlur={handleWebInput}
          onKeyUp={handleWebInput}
          className="mms-info-editor-web"
          style={{
            minHeight: '280px',
            padding: '14px',
            fontSize: '14px',
            color: '#1e293b',
            backgroundColor: '#ffffff',
            fontFamily: 'Tahoma, sans-serif',
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

// Indicador pulsante de status sincronizado
const PulsingStatusDot = () => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.35,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(opacityAnim, {
              toValue: 0.8,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.35,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [pulseAnim, opacityAnim]);

  if (Platform.OS === 'web') {
    return (
      <span
        style={{
          position: 'relative',
          display: 'inline-flex',
          width: '18px',
          height: '18px',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          className="mms-halo-pulse"
          style={{
            position: 'absolute',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: 'rgba(34, 197, 94, 0.25)',
          }}
        />
        <span
          style={{
            position: 'relative',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            boxShadow: '0 0 6px rgba(16, 185, 129, 0.5)',
          }}
        />
      </span>
    );
  }

  return (
    <View style={styles.pingContainer}>
      <Animated.View
        style={[
          styles.pingPulse,
          {
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
          },
        ]}
      />
      <View style={styles.pingCore} />
    </View>
  );
};

export default function ReportGenerator() {
  const router = useRouter();
  // --- SISTEMA DE ABAS E LOCALSTORAGE (IDÊNTICO AO INDEX.PHP) ---
  const [activeTab, setActiveTab] = useState<number>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = parseInt(localStorage.getItem('mms_active_tab') || '1', 10);
      if (saved >= 1 && saved <= 4) return saved;
    }
    return 1;
  });

  const [tabs, setTabs] = useState<number[]>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const list: number[] = [];
      for (let i = 1; i <= 4; i++) {
        if (localStorage.getItem('mms_tab_' + i)) {
          list.push(i);
        }
      }
      if (list.length > 0) return list;
    }
    return [1];
  });

  const [tabStore, setTabStore] = useState<{ [key: number]: TabData }>(() => {
    const initial: { [key: number]: TabData } = {};
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      let foundAny = false;
      for (let i = 1; i <= 4; i++) {
        const item = localStorage.getItem('mms_tab_' + i);
        if (item) {
          try {
            initial[i] = JSON.parse(item);
            foundAny = true;
          } catch (e) { }
        }
      }
      if (foundAny) return initial;
    }
    initial[1] = createDefaultTab();
    return initial;
  });

  // Toast Flutuante de Rascunho Salvo (idêntico ao index.php)
  const [isDraftToastVisible, setIsDraftToastVisible] = useState(false);
  const draftToastTimeoutRef = useRef<any>(null);

  const mostrarToastSalvo = () => {
    setIsDraftToastVisible(true);
    if (draftToastTimeoutRef.current) clearTimeout(draftToastTimeoutRef.current);
    draftToastTimeoutRef.current = setTimeout(() => {
      setIsDraftToastVisible(false);
    }, 1500);
  };

  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const [activeMenuTab, setActiveMenuTab] = useState<'inicio' | 'coord' | 'relatorios' | 'logout'>('inicio');
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [isLoadingReportEdit, setIsLoadingReportEdit] = useState<boolean>(false);
  const [pdfGenerated, setPdfGenerated] = useState<boolean>(false);
  const [isDateInputFocused, setIsDateInputFocused] = useState<boolean>(false);
  const [footerConfig, setFooterConfig] = useState<FooterConfig>(() => getLocalFooterConfig());
  const [appVersao, setAppVersao] = useState<string>(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem('mms_cached_app_version') || 'V1.2.4';
      } catch (e) { }
    }
    return 'V1.2.4';
  });

  useEffect(() => {
    fetchFooterConfig().then((cfg) => {
      if (cfg) setFooterConfig(cfg);
    });
    fetchLatestAppVersion().then((v) => {
      if (v) setAppVersao(v);
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleVersionUpdated = (e: any) => {
        const novaVersao = e.detail?.versao || localStorage.getItem('mms_cached_app_version');
        if (novaVersao) setAppVersao(novaVersao);
      };
      window.addEventListener('mms_app_version_updated', handleVersionUpdated);
      window.addEventListener('storage', handleVersionUpdated);
      return () => {
        window.removeEventListener('mms_app_version_updated', handleVersionUpdated);
        window.removeEventListener('storage', handleVersionUpdated);
      };
    }
  }, []);

  // Escala Responsiva do Documento A4 (Proporcional para Mobiles e Telas Menores)
  const { width: windowWidth } = useWindowDimensions();
  const a4BaseWidth = 794;
  const a4BaseHeight = 1123;
  const previewScale = windowWidth < (a4BaseWidth + 24)
    ? Math.min(1, Math.max(0.32, (windowWidth - 20) / a4BaseWidth))
    : 1;

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
    return false;
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
      } catch (e) { }
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

  // Estados de Notificações e Comunicados In-App da Coordenação
  const [activePopup, setActivePopup] = useState<any | null>(null);
  const [isPopupModalOpen, setIsPopupModalOpen] = useState<boolean>(false);
  const [mensagensList, setMensagensList] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState<boolean>(false);

  const carregarNotificacoesInApp = async () => {
    try {
      // 1. Busca comunicados da coordenação (tabela notificacoes)
      let popupAtivo: any = null;
      let allNotifs: any[] = [];
      try {
        const { data: pops } = await supabase
          .from('notificacoes')
          .select('*')
          .order('id', { ascending: false })
          .limit(20);
        if (pops && pops.length > 0) {
          allNotifs = pops;
          popupAtivo = pops.find((p: any) => p.ativa === 1 || p.ativa === true) || null;
        }
      } catch (e) { }

      // Fallback local para comunicados/popups
      if (typeof localStorage !== 'undefined') {
        try {
          const rawP = localStorage.getItem('mms_popups_store') || localStorage.getItem('mms_popups_local');
          if (rawP) {
            const listP = JSON.parse(rawP);
            if (!popupAtivo) {
              popupAtivo = listP.find((p: any) => p.ativa === 1 || p.ativa === true) || null;
            }
            listP.forEach((lp: any) => {
              if (!allNotifs.some((n: any) => n.id === lp.id || n.titulo === lp.titulo)) {
                allNotifs.push(lp);
              }
            });
          }
        } catch (e) { }
      }

      // Se houver comunicado ativo, aciona o pop-up modal na tela se ainda não visto
      if (popupAtivo) {
        setActivePopup(popupAtivo);
        const popKey = 'mms_popup_visto_' + popupAtivo.id;
        if (typeof localStorage !== 'undefined') {
          const jaVisto = localStorage.getItem(popKey);
          if (!jaVisto || popupAtivo.regra_exibicao === 'sempre') {
            setIsPopupModalOpen(true);
          }
        } else {
          setIsPopupModalOpen(true);
        }
      }

      // 2. Busca mensagens diretas in-app (mms_mensagens)
      let msgs: any[] = [];
      try {
        const { data: dbMsgs } = await supabase
          .from('mms_mensagens')
          .select('*')
          .order('data_envio', { ascending: false })
          .limit(20);
        if (dbMsgs) msgs = dbMsgs;
      } catch (e) { }

      // Fallback e sincronização com localStorage de mensagens
      if (typeof localStorage !== 'undefined') {
        try {
          const rawM = localStorage.getItem('mms_mensagens_store') || localStorage.getItem('mms_mensagens_local');
          if (rawM) {
            const localMsgs = JSON.parse(rawM);
            const map = new Map();
            localMsgs.forEach((m: any) => map.set(String(m.id || m.data_envio || m.titulo), m));
            msgs.forEach((m: any) => map.set(String(m.id || m.data_envio || m.titulo), m));
            msgs = Array.from(map.values());
          }
        } catch (e) { }
      }

      // 3. INTEGRAÇÃO CRÍTICA: Insere também todos os comunicados da coordenação na lista do sininho 🔔
      // Garante que mesmo quando abre em pop-up, o preposto encontra o histórico no menu de notificações
      if (allNotifs.length > 0) {
        allNotifs.forEach((n: any) => {
          const exists = msgs.some((m: any) =>
            (m.notif_id && m.notif_id === n.id) ||
            (m.titulo === n.titulo && m.mensagem === n.mensagem)
          );
          if (!exists) {
            msgs.push({
              id: 'notif_' + n.id,
              notif_id: n.id,
              titulo: n.titulo,
              mensagem: n.mensagem,
              tipo: n.tipo || 'aviso',
              data_envio: n.created_at || n.data_criacao || new Date().toISOString(),
              is_coordenacao: true,
            });
          }
        });
      }

      // Ordena tudo por data mais recente
      msgs.sort((a, b) => new Date(b.data_envio).getTime() - new Date(a.data_envio).getTime());

      setMensagensList(msgs);

      // 4. Calcula mensagens e comunicados não lidos
      let lidas: any[] = [];
      if (typeof localStorage !== 'undefined') {
        try {
          const rawLidas = localStorage.getItem('mms_mensagens_lidas');
          if (rawLidas) lidas = JSON.parse(rawLidas);
        } catch (e) { }
      }
      const naoLidas = msgs.filter((m) => !lidas.includes(m.id) && !lidas.includes(m.notif_id));
      setUnreadCount(naoLidas.length);
    } catch (err) {
      console.warn('Erro ao carregar notificações in-app:', err);
    }
  };

  const handleMarcarTodasLidas = () => {
    if (typeof localStorage !== 'undefined') {
      const ids = mensagensList.map((m) => m.id);
      mensagensList.forEach((m) => {
        if (m.notif_id) ids.push(m.notif_id);
      });
      localStorage.setItem('mms_mensagens_lidas', JSON.stringify(ids));
      setUnreadCount(0);
    }
  };

  const handleFecharPopup = () => {
    setIsPopupModalOpen(false);
    if (activePopup && typeof localStorage !== 'undefined') {
      localStorage.setItem('mms_popup_visto_' + activePopup.id, 'true');
    }
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

  // Estado e Ações para o Menu Flutuante e Navegação de URL
  const [isUrlModalVisible, setIsUrlModalVisible] = useState(false);
  const [navUrl, setNavUrl] = useState('');

  const handleRefresh = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      limparTudo();
    }
  };

  const handleGoCoord = () => {
    router.push('/painel_coord');
  };

  const handleOpenUrlModal = () => {
    const currentUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.href
        : 'https://relatorios.atmai.com.br';
    setNavUrl(currentUrl);
    setIsUrlModalVisible(true);
  };

  const handleNavigateUrl = () => {
    let target = navUrl.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target;
    }
    setIsUrlModalVisible(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = target;
    } else {
      Linking.openURL(target).catch(() => {
        showCustomAlert('ERRO DE NAVEGAÇÃO', 'Não foi possível abrir o link informado.');
      });
    }
  };

  const handleMenuLogout = () => {
    if (userSession?.user) {
      showCustomConfirm(
        'ENCERRAR SESSÃO',
        `Deseja realmente sair da conta (${(userSession.user as any).nome || userSession.user.user_metadata?.name || userSession.user.email})?`,
        async () => {
          await logoutUserSession();
          setUserSession(null);
          showCustomAlert('SESSÃO ENCERRADA', 'Você foi desconectado com sucesso.');
        },
        'Sair',
        'Cancelar'
      );
    } else {
      showCustomAlert(
        'NENHUMA CONTA CONECTADA',
        'Você está navegando como visitante. Deseja fazer login?',
        () => {
          setAuthMode('login');
          setIsAuthModalVisible(true);
        }
      );
    }
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

  // Detecção se está em WebApp (PWA / Mobile) ou Aplicativo Nativo & Telas Maiores Desktop
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

  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.innerWidth >= 640;
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
        setIsDesktop(window.innerWidth >= 640);
      };
      checkMode();
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
      }
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
      carregarNotificacoesInApp();
      if (typeof window !== 'undefined') {
        window.addEventListener('mms_mensagens_atualizadas', carregarNotificacoesInApp);
        window.addEventListener('storage', carregarNotificacoesInApp);
      }
    }).catch(() => {
      setIsAuthChecking(false);
    });

    // Polling contínuo de 10 em 10 segundos para receber notificações da coordenação automaticamente
    const notifInterval = setInterval(() => {
      carregarNotificacoesInApp();
    }, 10000);

    // Canal Realtime do Supabase para atualizar notificações e comunicados no exato instante em que são criados
    const realtimeChannel = supabase
      .channel('notificacoes-app-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes' }, () => {
        carregarNotificacoesInApp();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mms_mensagens' }, () => {
        carregarNotificacoesInApp();
      })
      .subscribe();

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

    return () => {
      clearInterval(notifInterval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('mms_mensagens_atualizadas', carregarNotificacoesInApp);
        window.removeEventListener('storage', carregarNotificacoesInApp);
      }
      try {
        supabase.removeChannel(realtimeChannel);
      } catch (e) { }
      subscription.unsubscribe();
    };
  }, []);

  const currentData = tabStore[activeTab] || createDefaultTab();

  const updateCurrentTab = (updater: Partial<TabData> | ((prev: TabData) => TabData)) => {
    setTabStore((prev) => {
      const existing = prev[activeTab] || createDefaultTab();
      const nextData = typeof updater === 'function' ? updater(existing) : { ...existing, ...updater };

      // Persistência automática idêntica ao index.php
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_tab_' + activeTab, JSON.stringify(nextData));
          localStorage.setItem('mms_active_tab', String(activeTab));
        } catch (e) { }
      }

      mostrarToastSalvo();
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
        grupo: parsed.grupo || report.empresa || 'ALPHA OFFSHORE',
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
      const newTabState = createDefaultTab(userName);
      const newTabs = [...tabs, nextId];
      setTabs(newTabs);
      setTabStore((prev) => ({ ...prev, [nextId]: newTabState }));
      setActiveTab(nextId);
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_tab_' + nextId, JSON.stringify(newTabState));
          localStorage.setItem('mms_active_tab', String(nextId));
        } catch (e) { }
      }
      mostrarToastSalvo();
    }
  };

  const removeTab = (tabIndex: number) => {
    const confirmMessage = `Deseja realmente limpar ou fechar o Relatório ${tabIndex}? Todos os dados deste formulário serão reiniciados.`;
    showCustomConfirm(
      'REINICIAR / FECHAR RELATÓRIO',
      confirmMessage,
      () => performRemoveTab(tabIndex),
      'Limpar',
      'Cancelar'
    );
  };

  const performRemoveTab = (tabIndex: number) => {
    const userName = userSession?.user?.user_metadata?.name || userSession?.user?.email?.split('@')[0] || '';
    const defaultState = createDefaultTab(userName);

    if (tabs.length <= 1) {
      setTabStore((prev) => ({ ...prev, [tabIndex]: defaultState }));
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_tab_' + tabIndex, JSON.stringify(defaultState));
        } catch (e) { }
      }
      mostrarToastSalvo();
      return;
    }

    const newTabs = tabs.filter((t) => t !== tabIndex);
    const newStore = { ...tabStore };
    delete newStore[tabIndex];
    setTabs(newTabs);
    setTabStore(newStore);

    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('mms_tab_' + tabIndex);
      } catch (e) { }
    }

    if (activeTab === tabIndex) {
      const nextActive = newTabs[0] || 1;
      setActiveTab(nextActive);
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_active_tab', String(nextActive));
        } catch (e) { }
      }
    }
    mostrarToastSalvo();
  };

  const limparTudo = () => {
    const confirmMsg = "Deseja reiniciar este relatório? Todos os campos preenchidos serão limpos.";
    const executeClear = () => {
      const userName = userSession?.user?.user_metadata?.name || userSession?.user?.email?.split('@')[0] || '';
      const defaultState = createDefaultTab(userName);
      updateCurrentTab(defaultState);
      setPdfGenerated(false);
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('mms_tab_' + activeTab, JSON.stringify(defaultState));
        } catch (e) { }
      }
    };

    showCustomConfirm(
      'NOVO RELATÓRIO',
      confirmMsg,
      executeClear,
      'Limpar',
      'Cancelar'
    );
  };

  // Funções de Registro de Tentativas para o Painel de Coordenação
  const recordFailedAttempt = async (userIdent: string) => {
    const attempt = {
      id: Date.now(),
      usuario_id: null,
      username: userIdent || 'desconhecido',
      ip: '127.0.0.1',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 500) : 'Web App',
      data_tentativa: new Date().toISOString(),
    };
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('mms_coord_acessos_falhos');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(attempt);
        localStorage.setItem('mms_coord_acessos_falhos', JSON.stringify(list.slice(0, 100)));
      } catch (e) { }
    }
    try {
      await supabase.from('coord_acessos_falhos').insert([attempt]);
    } catch (e) { }
  };

  const recordSuccessfulLogin = async (userId: any, username: string) => {
    const logItem = {
      id: Date.now(),
      usuario_id: userId ? Number(userId) : 1,
      ip: '127.0.0.1',
      data_login: new Date().toISOString(),
      username: username || 'usuario',
    };
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('mms_registro_logins');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(logItem);
        localStorage.setItem('mms_registro_logins', JSON.stringify(list.slice(0, 50)));
      } catch (e) { }
    }
    try {
      await supabase.from('registro_logins').insert([{
        usuario_id: logItem.usuario_id,
        ip: logItem.ip,
        data_login: logItem.data_login,
      }]);
    } catch (e) { }
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

        // Senha conferida no servidor (RPC login_usuario) ou no Supabase Auth
        const result = await authenticateUser(inputStr, authPassword);

        if (!result.success || !result.session) {
          recordFailedAttempt(inputStr);
          setAuthMsg({ type: 'erro', text: result.error || 'Usuário não encontrado ou senha incorreta.' });
          return;
        }

        const session = result.session;
        setUserSession(session);

        const userName = session.user.user_metadata?.name || inputStr.split('@')[0];
        updateCurrentTab({ preposto: userName });

        recordSuccessfulLogin(session.user.id, userName);

        setAuthMsg({ type: 'sucesso', text: 'Login realizado com sucesso!' });
        setTimeout(() => {
          setIsAuthModalVisible(false);
          if (typeof window !== 'undefined') {
            window.scrollTo(0, 0);
          }
        }, 600);
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

        // Só considera a conta criada se o Supabase Auth aceitou o cadastro
        if (!authErr && signUpData?.user) {
          if (dbErr) {
            console.warn('Conta criada no Auth, mas falhou ao gravar em public.usuarios:', dbErr.message);
          }
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
            if (typeof window !== 'undefined') {
              window.scrollTo(0, 0);
            }
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

  const limparCacheGeral = () => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('mms_')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        window.location.reload();
      } catch (e) { }
    }
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
    return gerarNomeArquivoPdf({
      unidade: currentData.unidade,
      data: currentData.data,
      observacao: currentData.observacao,
      horarios: {
        embarque_previsto: currentData.semEmbarquePrev ? '' : `${currentData.h3}:${currentData.m3}`,
      },
    });
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
        } catch (e) { }

        try {
          const rect = el.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetY = rect.top + scrollTop - 140;
          window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        } catch (e) { }

        try {
          el.focus();
        } catch (e) { }
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

    // Pré-carrega o Blob do PDF em segundo plano para o botão Compartilhar abrir a navbar de compartilhamento instantaneamente
    if (Platform.OS === 'web') {
      try {
        const dadosPreload = obterDadosRelatorioAtual();
        gerarPdfBlob(dadosPreload, currentData.pdfUrl)
          .then((res) => {
            cachedPdfBlobRef.current = res;
          })
          .catch((err) => {
            console.warn('Pré-carregamento do PDF Blob em background:', err);
          });
      } catch (err) {}
    }

    // Salva automaticamente o relatório gerado na nuvem Supabase
    salvarRelatorioNoSupabase();

    if (Platform.OS === 'web') {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  // Handlers para Baixar, Compartilhar e Editar Relatório
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const cachedPdfBlobRef = useRef<{ blob: Blob; nomeArquivo: string } | null>(null);

  const obterDadosRelatorioAtual = () => ({
    grupo: currentData.grupo,
    unidade: currentData.unidade,
    data: currentData.data,
    local: currentData.local,
    modal: currentData.modal,
    preposto: currentData.preposto,
    observacao: currentData.observacao,
    observacao_nome_arquivo: currentData.observacao,
    semSaida: currentData.semSaida,
    semEmbarquePrev: currentData.semEmbarquePrev,
    semEmbarque: currentData.semEmbarque,
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

  const handleBaixarPdf = async () => {
    setIsExportingPdf(true);
    try {
      const dados = obterDadosRelatorioAtual();
      const res = await baixarPdfRelatorio(dados, currentData.pdfUrl);
      if (res.sucesso && Platform.OS !== 'web') {
        showCustomAlert('DOWNLOAD CONCLUÍDO', `Arquivo ${res.nomeArquivo} gerado com sucesso!`);
      }
    } catch (e: any) {
      showCustomAlert('DOWNLOAD DO PDF', e.message || 'Falha ao processar o download do PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCompartilharRelatorio = async () => {
    // Aciona a folha/navbar nativa de compartilhamento imediatamente no clique sem delay
    try {
      const dados = obterDadosRelatorioAtual();
      const fallbackUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? (currentData.pdfUrl || window.location.href)
        : undefined;
      const res = await compartilharPdfRelatorio(
        dados,
        fallbackUrl,
        currentData.pdfUrl,
        cachedPdfBlobRef.current?.blob
      );
      if (!res.sucesso && res.metodo === 'not_supported') {
        showCustomAlert(
          'COMPARTILHAR',
          'Função de compartilhar não suportada neste navegador. Use o botão Baixar.\n(O link foi copiado para a área de transferência).'
        );
      } else if (res.sucesso && res.metodo === 'clipboard') {
        showCustomAlert(
          'LINK COPIADO',
          'O link do relatório foi copiado para sua área de transferência para compartilhamento.'
        );
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        showCustomAlert('COMPARTILHAR', e?.message || 'Falha ao abrir menu de compartilhamento.');
      }
    }
  };

  const handleEditarRelatorio = () => {
    setPdfGenerated(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const formEl = document.getElementById('mms-form-fields');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  // Mantém retrocompatibilidade para exportação offline
  const handleExportarPdfOffline = (modo: 'imprimir' | 'download_html' = 'imprimir') => {
    handleBaixarPdf();
  };

  const salvarRelatorioNoSupabase = async () => {
    const rawPreposto = currentData.preposto;
    const prepostoTratado =
      rawPreposto && rawPreposto !== 'undefined' && rawPreposto.trim() !== ''
        ? rawPreposto.trim()
        : (userSession?.user?.user_metadata?.name || '');

    const jsonPayload = {
      grupo: currentData.grupo,
      unidade: currentData.unidade,
      data: currentData.data,
      local: currentData.local,
      modal: currentData.modal,
      preposto: prepostoTratado,
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
      let clientIp: string | null = null;

      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        if (ipRes.ok) {
          const ipJson = await ipRes.json();
          clientIp = ipJson.ip || null;
        }
      } catch (_) {}

      // Salvamento direto, seguro e sob demanda (sem gravação de arquivos estáticos no servidor PHP)

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
            ...(pdfUrlResult ? { pdf_url: pdfUrlResult } : {}),
            ...(clientIp ? { ip_origem: clientIp } : {}),
          })
          .eq('id', editingReportId);

        if (updErr) {
          console.warn('Falha ao atualizar relatório no Supabase:', updErr.message);
          showCustomAlert('ERRO AO ATUALIZAR', 'Não foi possível atualizar o relatório na nuvem: ' + updErr.message);
        } else {
          showCustomAlert(
            'RELATÓRIO ATUALIZADO',
            `O relatório #${editingReportId} (${currentData.unidade}) foi atualizado com sucesso no banco de dados central!`
          );
        }
        return;
      }

      // 2. Registra novo relatório no banco Supabase
      const numericUserId = typeof userSession?.user?.id === 'number'
        ? userSession.user.id
        : !isNaN(Number(userSession?.user?.id)) && Number(userSession?.user?.id) > 0
          ? Number(userSession?.user?.id)
          : null;

      // Busca o maior ID para evitar conflito com sequences desalinhadas da migração
      let nextCustomId: number | null = null;
      try {
        const { data: maxRows } = await supabase
          .from('relatorios')
          .select('id')
          .order('id', { ascending: false })
          .limit(1);
        if (maxRows && maxRows[0]?.id) {
          nextCustomId = Number(maxRows[0].id) + 1;
        }
      } catch (_) {}

      const insertPayload: any = {
        usuario_id: numericUserId,
        empresa: currentData.grupo,
        unidade: currentData.unidade,
        local_atendimento: currentData.local,
        dados_json: JSON.stringify(jsonPayload),
        teve_anexo: currentData.fotosAnexadas.length > 0,
        pdf_url: pdfUrlResult,
        ip_origem: clientIp,
        data_criacao: new Date().toISOString(),
      };

      if (nextCustomId) {
        insertPayload.id = nextCustomId;
      }

      let { data, error } = await supabase.from('relatorios').insert([insertPayload]);

      // Fallback em caso de colisão de ID ou chave única
      if (error && error.code === '23505') {
        try {
          const { data: retryMax } = await supabase
            .from('relatorios')
            .select('id')
            .order('id', { ascending: false })
            .limit(1);
          insertPayload.id = (retryMax && retryMax[0]?.id ? Number(retryMax[0].id) : (nextCustomId || 1433)) + 1;
          const retryRes = await supabase.from('relatorios').insert([insertPayload]);
          error = retryRes.error;
        } catch (_) {}
      }

      if (error) {
        console.warn('Falha na sincronização online. Armazenando cópia offline.', error.message);
        salvarOfflineLocal(jsonPayload);
        showCustomAlert(
          'SALVO LOCALMENTE (OFFLINE)',
          'Houve uma oscilação na conexão com a nuvem, mas seu relatório foi salvo com segurança na memória local do aparelho.'
        );
      } else {
        showCustomAlert(
          'RELATÓRIO SALVO NA NUVEM',
          'Seu relatório foi gerado e salvo com sucesso na nuvem! Você pode visualizá-lo a qualquer momento na página "Meus Relatórios".'
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
      } catch (e) { }
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

  // Adicionar Relatório / Ativar Novo Slot (Até 4 Abas)
  const adicionarNovoRelatorio = () => {
    if (tabs.length >= 4) return;
    const nextSlot = [1, 2, 3, 4].find((id) => !tabs.includes(id));
    if (!nextSlot) return;

    const userName =
      userSession?.user?.user_metadata?.name ||
      userSession?.user?.email?.split('@')[0] ||
      '';
    const newTabState = createDefaultTab(userName);
    const newTabs = [...tabs, nextSlot].sort((a, b) => a - b);

    setTabs(newTabs);
    setTabStore((prev) => ({ ...prev, [nextSlot]: newTabState }));
    setActiveTab(nextSlot);

    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('mms_tab_' + nextSlot, JSON.stringify(newTabState));
        localStorage.setItem('mms_active_tab', String(nextSlot));
      } catch (e) { }
    }
  };

  // Fechar / Excluir Aba de Relatório em Andamento e Esvaziar o Slot
  const fecharAba = (slotId: number) => {
    // SOMENTE O SLOT 1 NÃO PODE SER EXCLUÍDO
    if (slotId === 1) return;

    const executeClose = () => {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('mms_tab_' + slotId);
        } catch (e) { }
      }

      setTabs((prevTabs) => {
        const remaining = prevTabs.filter((t) => t !== slotId);

        // Se fechou a aba que estava ativa, foca imediatamente no slot 1 (ou primeiro restante)
        if (activeTab === slotId) {
          const nextActive = remaining.includes(1) ? 1 : remaining[0] || 1;
          setActiveTab(nextActive);
          if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('mms_active_tab', String(nextActive));
            } catch (e) { }
          }
        }

        // Limpa e esvazia os dados da aba fechada no estado
        setTabStore((prevStore) => {
          const nextStore = { ...prevStore };
          delete nextStore[slotId];
          return nextStore;
        });

        return remaining;
      });
    };

    showCustomConfirm(
      'EXCLUIR RELATÓRIO',
      `Deseja realmente remover este relatório em andamento? Todos os dados dele serão perdidos.`,
      executeClose,
      'Excluir',
      'Cancelar'
    );
  };

  // Renderizador dos Slots de Relatórios em Andamento (Idêntico ao index.php)
  const renderDraftTabSlot = (slotId: number) => {
    const isActive = activeTab === slotId;
    const tabData = tabStore[slotId];
    const tabName = tabData?.unidade ? tabData.unidade.toUpperCase() : 'Vazio';

    // Somente slots 2, 3 e 4 ocupados podem ser excluídos pelo X; slot 1 NUNCA pode ser excluído
    const showRemoveBtn = slotId !== 1;

    return (
      <TouchableOpacity
        key={slotId}
        className={`mms-draft-tab-slot ${isActive ? 'mms-draft-tab-slot--active' : ''}`}
        style={[
          styles.draftTabSlot,
          isActive ? styles.draftTabSlotActive : styles.draftTabSlotInactive,
        ]}
        onPress={() => {
          setActiveTab(slotId);
          if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('mms_active_tab', String(slotId));
            } catch (e) { }
          }
        }}
        activeOpacity={0.85}
      >
        {/* Botão de Fechar / Excluir (✕) - Somente slots 2, 3 e 4 */}
        {showRemoveBtn && (
          <TouchableOpacity
            style={styles.draftTabRemoveBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              fecharAba(slotId);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Excluir Relatório ${slotId}`}
          >
            <Text style={styles.draftTabRemoveText}>✕</Text>
          </TouchableOpacity>
        )}

        <Text
          style={[
            styles.draftTabSlotTitle,
            isActive ? styles.draftTabSlotTitleActive : styles.draftTabSlotTitleInactive,
          ]}
        >
          RELATÓRIO {slotId}
        </Text>
        <Text
          style={[
            styles.draftTabSlotName,
            isActive ? styles.draftTabSlotNameActive : styles.draftTabSlotNameInactive,
          ]}
          numberOfLines={1}
        >
          {tabName}
        </Text>
      </TouchableOpacity>
    );
  };


  return (
    <SafeAreaView style={styles.body} className="mms-app-layout">
      <StatusBar style="light" />

      <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={{ flexGrow: 1 }} className="mms-main-scroll">
        {/* Navbar Superior (Rola junto com a página - Não fixo) */}
        <View style={styles.navbar} className="mms-navbar">
          {/* Esquerda: Logo / Marca do Sistema (MMS RELATÓRIOS) */}
          <View style={styles.navBrandContainer} className="mms-navbar__brand">
            <View style={styles.navLeftGradientBox} className="mms-navbar__brand-icon">
              {Platform.OS === 'web' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              ) : (
                <Text style={{ color: '#fff', fontSize: 16 }}>📑</Text>
              )}
            </View>
            <View style={styles.navBrandTextWrap} className="mms-navbar__brand-text">
              <View style={styles.navBrandTitleRow} className="mms-navbar__brand-title-row">
                <Text style={styles.navBrandName} className="mms-navbar__brand-name">RELATÓRIOS</Text>
              </View>
            </View>
          </View>

          {/* Direita: Notificações e Menu */}
          <View style={styles.navRightGroup} className="mms-navbar__actions">
            {/* Botão de Notificações com Badge e Ação Real */}
            <TouchableOpacity
              style={styles.navNotifBtn}
              className="mms-navbar__notif-btn"
              activeOpacity={0.7}
              onPress={() => {
                setIsNotifDropdownOpen(!isNotifDropdownOpen);
                handleMarcarTodasLidas();
              }}
            >
              {Platform.OS === 'web' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={unreadCount > 0 ? '#38bdf8' : '#94a3b8'}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              ) : (
                <Text style={{ fontSize: 18 }}>🔔</Text>
              )}
              {unreadCount > 0 && (
                <View style={styles.notifBadgeCircle} className="mms-navbar__notif-badge">
                  <Text style={styles.notifBadgeCircleText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Botão Menu Hamburger / Avatar */}
            <TouchableOpacity
              onPress={toggleMenu}
              style={[styles.navMenuBtn, showMenu && styles.navMenuBtnActive]}
              className="mms-navbar__menu-btn"
              activeOpacity={0.8}
            >
              <Text style={styles.navMenuBtnText}>MENU</Text>

              {userSession?.user ? (
                <View style={styles.menuAvatarCircle}>
                  <Text style={styles.menuAvatarCircleText}>
                    {((userSession?.user?.user_metadata?.name || (userSession?.user as any)?.nome || (userSession?.user as any)?.username || userSession?.user?.email || 'U').toString().trim().charAt(0) || 'U').toUpperCase()}
                  </Text>
                </View>
              ) : (
                <View style={styles.navHamburgerLines}>
                  <View style={styles.navHamburgerBar} />
                  <View style={styles.navHamburgerBar} />
                  <View style={styles.navHamburgerBar} />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

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
                            {isUserCoordinator(userSession) ? 'COORDENAÇÃO' : 'PREPOSTO'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.menuHeaderName} numberOfLines={1}>
                        {userSession?.user?.user_metadata?.name || (userSession?.user as any)?.nome || (userSession?.user as any)?.username || userSession?.user?.email?.split('@')[0] || 'Usuário'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => {
                        toggleMenu();
                        router.push('/meus_relatorios');
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.menuItemIcon}>📂</Text>
                        <Text style={styles.menuItemText}>Meus Relatórios</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Painel de Coordenação: EXCLUSIVO PARA USUÁRIOS LOGADOS NÍVEL 2 */}
                    {isUserCoordinator(userSession) && (
                      <>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            toggleMenu();
                            router.push('/painel_coord');
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.menuItemIcon}>⚙️</Text>
                            <Text style={[styles.menuItemText, { color: '#d97706' }]}>Painel Coordenação</Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.menuItem, { borderTopWidth: 1, borderColor: colors.slate100 }]}
                          onPress={() => {
                            toggleMenu();
                            limparCacheGeral();
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.menuItemIcon}>🧹</Text>
                            <Text style={[styles.menuItemText, { color: '#4f46e5' }]}>Limpar Cache</Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.menuItem, { borderTopWidth: 1, borderColor: colors.slate100 }]}
                          onPress={() => {
                            toggleMenu();
                            setIsUrlModalVisible(true);
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.menuItemIcon}>🌐</Text>
                            <Text style={[styles.menuItemText, { color: '#0d9488' }]}>Navegador WebView</Text>
                          </View>
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity
                      style={[styles.menuItem, { borderTopWidth: 1, borderColor: colors.slate100, marginTop: 4 }]}
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
                      style={styles.menuItem}
                      onPress={() => {
                        toggleMenu();
                        setAuthMode('login');
                        setIsAuthModalVisible(true);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.menuItemIcon}>🔑</Text>
                        <Text style={[styles.menuItemText, { color: colors.blue600 }]}>Fazer Login</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.menuItem, { borderTopWidth: 1, borderColor: colors.slate100, marginTop: 4 }]}
                      onPress={() => {
                        toggleMenu();
                        setAuthMode('cadastro');
                        setIsAuthModalVisible(true);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.menuItemIcon}>📝</Text>
                        <Text style={[styles.menuItemText, { color: colors.emerald600 }]}>Criar Nova Conta</Text>
                      </View>
                    </TouchableOpacity>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>

        {/* Dropdown de Notificações / Mensagens da Coordenação */}
        <Modal
          visible={isNotifDropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsNotifDropdownOpen(false)}
        >
          <TouchableOpacity
            style={styles.dropdownModalBackdrop}
            activeOpacity={1}
            onPress={() => setIsNotifDropdownOpen(false)}
          >
            <View style={[styles.dropdownMenuCard, { width: 340, maxWidth: '92%', maxHeight: 480, padding: 0, overflow: 'hidden' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16 }}>🔔</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#0f172a' }}>NOTIFICAÇÕES DA COORDENAÇÃO</Text>
                </View>
                <TouchableOpacity onPress={() => setIsNotifDropdownOpen(false)}>
                  <Text style={{ fontSize: 16, color: '#94a3b8', fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 380, padding: 12 }}>
                {mensagensList.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>Nenhuma notificação no momento.</Text>
                  </View>
                ) : (
                  mensagensList.map((m, idx) => {
                    const corBadge = m.tipo === 'urgente' ? '#fee2e2' : m.tipo === 'alerta' ? '#fef3c7' : m.tipo === 'aviso' ? '#ffedd5' : '#e0f2fe';
                    const textBadge = m.tipo === 'urgente' ? '#dc2626' : m.tipo === 'alerta' ? '#b45309' : m.tipo === 'aviso' ? '#c2410c' : '#0284c7';
                    const dataStr = m.data_envio ? new Date(m.data_envio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                    return (
                      <View key={m.id || idx} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a', flex: 1 }}>{m.titulo}</Text>
                          <View style={{ backgroundColor: corBadge, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 9, fontWeight: '900', color: textBadge, textTransform: 'uppercase' }}>{m.tipo || 'info'}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 12, color: '#475569', lineHeight: 16, marginBottom: 6 }}>{m.mensagem}</Text>
                        <Text style={{ fontSize: 10, color: '#94a3b8' }}>🕒 {dataStr}</Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Modal de Comunicado / Pop-up Global da Coordenação */}
        {activePopup && (
          <Modal
            visible={isPopupModalOpen}
            transparent
            animationType="fade"
            onRequestClose={() => handleFecharPopup()}
          >
            <View
              // @ts-ignore
              dataSet={{ modalOverlay: 'true' }}
              style={styles.modalOverlay}
            >
              <View style={[styles.authCard, { maxWidth: 440, padding: 24, borderRadius: 20 }]}>
                <View style={{ alignItems: 'center', marginBottom: 14 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: activePopup.tipo === 'urgente' ? '#fee2e2' : '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 28 }}>{activePopup.tipo === 'urgente' ? '⚠️' : activePopup.tipo === 'feedback' ? '⭐' : '📢'}</Text>
                  </View>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#0f172a', textAlign: 'center', marginBottom: 4 }}>
                    {activePopup.titulo}
                  </Text>
                  <View style={{ backgroundColor: activePopup.tipo === 'urgente' ? '#fee2e2' : '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: activePopup.tipo === 'urgente' ? '#dc2626' : '#0284c7', textTransform: 'uppercase' }}>
                      {activePopup.tipo || 'COMUNICADO'}
                    </Text>
                  </View>
                </View>

                <ScrollView style={{ maxHeight: 220, marginBottom: 20 }}>
                  <Text style={{ fontSize: 13, color: '#475569', lineHeight: 20, textAlign: 'center' }}>
                    {activePopup.mensagem}
                  </Text>
                </ScrollView>

                <TouchableOpacity
                  style={{ backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
                  onPress={() => handleFecharPopup()}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 }}>
                    ENTENDI / FECHAR
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* Conteúdo Principal Centralizado */}
        <View style={styles.scroll}>
          {/* Cartão Principal de Preenchimento (Independente e Separado do Preview) */}
        <View style={styles.card} className="mms-card mms-form-card">
          {/* Header do Card com Botão Iniciar Novo Relatório à direita */}
          <View style={styles.cardHeader} className="mms-card__header">
            <TouchableOpacity onPress={limparTudo} style={styles.btnNovoRelatorio} className="mms-btn-novo-relatorio" activeOpacity={0.75}>
              <Text style={styles.btnNovoRelatorioIcon}>+</Text>
              <Text style={styles.btnNovoRelatorioText}>Iniciar Novo Relatório</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.mainTitle, isDesktop && styles.mainTitleDesktop]} className="mms-main-title">Preenchimento de Relatório</Text>
          {/* Banner de Modo Edição Ativo */}
          {editingReportId && (
            <View style={styles.editingBannerCard} className="mms-editing-banner">
              <View style={styles.editingBannerLeft}>
                <View style={styles.editingBannerBadge}>
                  <Text style={styles.editingBannerBadgeText}>✏️ MODO EDIÇÃO ATIVO</Text>
                </View>
                <Text style={styles.editingBannerTitle}>
                  Editando Relatório #{editingReportId} ({currentData.unidade || 'Sem Unidade'})
                </Text>
                <Text style={styles.editingBannerSub}>
                  Ao salvar, as alterações atualizarão o registro existente na nuvem sem duplicar.
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

          {/* Controle de Abas Simultâneas: Relatórios em Andamento */}
          <View style={styles.draftTabsSection} className="mms-draft-tabs-section">
            <View style={styles.draftTabsHeaderRow}>
              <Text style={styles.draftTabsSectionTitle} className="mms-draft-tabs-section-title">RELATÓRIOS EM ANDAMENTO</Text>

              <TouchableOpacity
                style={[
                  styles.btnAddDraftReport,
                  tabs.length >= 4 && styles.btnAddDraftReportDisabled,
                ]}
                onPress={adicionarNovoRelatorio}
                disabled={tabs.length >= 4}
                activeOpacity={tabs.length >= 4 ? 1 : 0.8}
                accessibilityLabel="Adicionar Relatório"
              >
                <Text
                  style={[
                    styles.btnAddDraftReportText,
                    tabs.length >= 4 && styles.btnAddDraftReportTextDisabled,
                  ]}
                >
                  + Adicionar Relatório
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.draftTabsContainer} className="mms-draft-tabs-container">
              {tabs.map((slotId) => renderDraftTabSlot(slotId))}
            </View>
          </View>

          {/* Formulário Principal (Bloqueado e Opaco após Gerar Relatório) */}
          <View
            nativeID="mms-form-fields"
            style={[styles.formContainer, pdfGenerated && styles.formContainerLocked]}
            className={`mms-form-container ${pdfGenerated ? 'mms-form-locked' : ''}`}
            pointerEvents={pdfGenerated ? 'none' : 'auto'}
          >
            {/* Empresa / Grupo (Select Dropdown) */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>EMPRESA / GRUPO:</Text>

              <TouchableOpacity
                style={styles.selectBoxContainer}
                onPress={() => setIsGrupoDropdownOpen(!isGrupoDropdownOpen)}
                activeOpacity={0.8}
              >
                <Text style={styles.selectBoxText}>{currentData.grupo || 'ALPHA OFFSHORE'}</Text>
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
            <View style={styles.inputGroup} className="mms-field-group">
              <Text style={styles.label} className="mms-field-label">DATA:</Text>
              {Platform.OS === 'web' ? (
                <View style={styles.dateInputContainer} className="mms-date-input-container">
                  <input
                    id="field-data"
                    name="data"
                    type={currentData.data || isDateInputFocused ? 'date' : 'text'}
                    value={currentData.data || ''}
                    placeholder="Selecione a data aqui 📅"
                    onChange={(e: any) => updateCurrentTab({ data: e.target.value })}
                    onFocus={(e: any) => {
                      setIsDateInputFocused(true);
                      try {
                        if (e.target.showPicker) e.target.showPicker();
                      } catch (err) { }
                    }}
                    onClick={(e: any) => {
                      setIsDateInputFocused(true);
                      try {
                        if (e.target.showPicker) e.target.showPicker();
                      } catch (err) { }
                    }}
                    onBlur={() => setIsDateInputFocused(false)}
                    className={`mms-date-input-field ${fieldErrors.data ? 'mms-date-input-error' : ''}`}
                  />
                </View>
              ) : (
                <TextInput
                  nativeID="field-data"
                  id="field-data"
                  style={[styles.input, fieldErrors.data && styles.inputError]}
                  value={currentData.data}
                  onChangeText={(val) => updateCurrentTab({ data: val })}
                  placeholder="Selecione a data aqui 📅"
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
                    ✏️ <Text style={{ fontWeight: 'bold' }}>Dica:</Text> O rótulo inicial <Text style={styles.dicaTag}>Previsto</Text> pode ser clicado e editado (Ex: Previsto Alpha, Previsto Nexus).
                  </Text>
                </View>

                {currentData.listaSaidas.map((item, idx) => (
                  <View key={item.id} style={styles.saidaRowContainer}>
                    <View style={styles.timeSectionBlock}>
                      <View style={styles.saidaLabelGroup}>
                        <TextInput
                          style={[
                            styles.saidaLabelInput,
                            { width: Math.max(70, (item.label1 || 'Previsto').length * 9.5) }
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

                    <View style={styles.saidaRealDivider} />

                    <View style={styles.timeSectionBlock}>
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

                <TouchableOpacity style={styles.checkboxRow} onPress={toggleSemSaida} activeOpacity={0.7}>
                  <View style={[styles.checkbox, currentData.semSaida && styles.checkboxChecked]}>
                    {currentData.semSaida && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>N/A SAÍDA DE HOTEL</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.btnNovaSaida} onPress={addSaidaLine} activeOpacity={0.7}>
                  <Text style={styles.btnNovaSaidaText}>+ ADICIONAR NOVA SAÍDA</Text>
                </TouchableOpacity>
              </View>

              {/* Card 2: Embarque */}
              <View style={styles.horarioCard}>
                <View style={styles.horarioBadgeWrapper}>
                  <Text style={styles.horarioBadge}>EMBARQUE</Text>
                </View>

                {/* Previsão Embarque */}
                <View style={styles.timeCardItem}>
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

                <TouchableOpacity style={styles.checkboxRow} onPress={toggleSemEmbarquePrev} activeOpacity={0.7}>
                  <View style={[styles.checkbox, currentData.semEmbarquePrev && styles.checkboxChecked]}>
                    {currentData.semEmbarquePrev && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>N/A EMBARQUE</Text>
                </TouchableOpacity>

                {/* Real Embarque */}
                <View style={styles.timeCardItem}>
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

                <TouchableOpacity style={styles.checkboxRow} onPress={toggleSemEmbarque} activeOpacity={0.7}>
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
                <View style={styles.timeCardItem}>
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

                {/* Fim Atendimento */}
                <View style={styles.timeCardItem}>
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
                  💡 Nos campos EMBARCANDO e DESEMBARCANDO colocar uma palavra entre *asteriscos* a deixará em <Text style={{ fontWeight: 'bold', color: colors.blue800 }}>Negrito</Text>.
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
          </View>

          {/* Área de Finalização do Formulário (Ações, Prévia e Botões) */}
          <View style={styles.formFooterActionsWrap}>
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

            {/* Sucesso do Relatório Gerado (Opção 1 DomPDF/Expo) */}
            {pdfGenerated && (
              <View style={styles.areaSucessoPdf} className="mms-area-sucesso-pdf">
                <View style={styles.sucessoPillHeader}>
                  <Text style={styles.sucessoPillCheck}>✅</Text>
                  <Text style={styles.sucessoPillTitle}>Relatório gerado com sucesso!</Text>
                </View>

                <View style={styles.sucessoActionsRow}>
                  <TouchableOpacity
                    style={styles.btnCompartilharPdf}
                    onPress={handleCompartilharRelatorio}
                    disabled={isExportingPdf}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnCompartilharPdfIcon}>🔗</Text>
                    <Text style={styles.btnCompartilharPdfText}>Compartilhar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnBaixarPdf}
                    onPress={handleBaixarPdf}
                    disabled={isExportingPdf}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnBaixarPdfIcon}>📥</Text>
                    <Text style={styles.btnBaixarPdfText}>{isExportingPdf ? 'Baixando...' : 'Baixar'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.btnEditarPdf}
                  onPress={handleEditarRelatorio}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnEditarPdfIcon}>✏️</Text>
                  <Text style={styles.btnEditarPdfText}>Editar Relatório</Text>
                </TouchableOpacity>
              </View>
            )}


            {/* Footer Personalizável */}
            <View style={[styles.appFooterContainer, !isDesktop && styles.appFooterContainerMobile]} className="mms-app-footer">
              {isDesktop && <View style={styles.appFooterSpacer} />}
              <Text style={[styles.appFooterText, !isDesktop && styles.appFooterTextMobile]}>
                {footerConfig.prefixo}
                <Text
                  style={[
                    styles.appFooterHighlight,
                    { color: footerConfig.corDestaque1 },
                    footerConfig.negrito1 && { fontWeight: '900' },
                  ]}
                >
                  {footerConfig.destaque1}
                </Text>
                {footerConfig.conector}
                <Text
                  style={[
                    styles.appFooterHighlight,
                    { color: footerConfig.corDestaque2 },
                    footerConfig.negrito2 && { fontWeight: '900' },
                  ]}
                >
                  {footerConfig.destaque2}
                </Text>
              </Text>
              <View style={[styles.appFooterVersionWrapper, !isDesktop && styles.appFooterVersionWrapperMobile]}>
                <View style={styles.appFooterVersionBadge} className="mms-app-footer__badge">
                  <Text style={styles.appFooterVersionIcon}>⬡</Text>
                  <Text style={styles.appFooterVersionText}>{appVersao || footerConfig.versao || 'V1.2.4'}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* PREVIEW COMPLETO DO DOCUMENTO (RESPONSIVO COM ESCALA VETORIAL PARA MOBILES) */}
        {(() => {
          const rawPax1 = (currentData.pax1 || '').replace(/\r/g, '');
          const rawPax2 = (currentData.pax2 || '').replace(/\r/g, '');
          const lines1 = rawPax1.trim() !== '' ? rawPax1.split('\n') : [];
          const lines2 = rawPax2.trim() !== '' ? rawPax2.split('\n') : [];
          const maxLines = Math.max(lines1.length, lines2.length);

          const LIMIT_PAGE_1 = 16;
          const LIMIT_CONT_PAGE = 28;

          const p1Lines1 = lines1.slice(0, LIMIT_PAGE_1).join('\n');
          const p1Lines2 = lines2.slice(0, LIMIT_PAGE_1).join('\n');

          const paxContinuationPages: Array<{ pax1: string; pax2: string }> = [];
          if (maxLines > LIMIT_PAGE_1) {
            let idx = LIMIT_PAGE_1;
            while (idx < maxLines) {
              paxContinuationPages.push({
                pax1: lines1.slice(idx, idx + LIMIT_CONT_PAGE).join('\n'),
                pax2: lines2.slice(idx, idx + LIMIT_CONT_PAGE).join('\n'),
              });
              idx += LIMIT_CONT_PAGE;
            }
          }

          const totalPages = 1 + paxContinuationPages.length + currentData.fotosAnexadas.length;

          return (
            <>
              <Text style={styles.previewTitleMain} className="mms-preview-title-main">PREVIEW DO DOCUMENTO</Text>

              <View
                className="mms-preview-wrap"
                style={[
                  styles.previewWrap,
                  previewScale < 1 && {
                    width: windowWidth < (a4BaseWidth + 24) ? windowWidth - 16 : a4BaseWidth,
                    height: (a4BaseHeight * totalPages + (totalPages - 1) * 24) * previewScale + 40,
                    overflow: 'hidden',
                    alignItems: 'center',
                  },
                ]}
              >
                <View
                  className="mms-preview-document"
                  style={[
                    styles.previewScaleContainer,
                    previewScale < 1 && {
                      transform: [{ scale: previewScale }],
                      transformOrigin: 'top center',
                    },
                  ]}
                >
                  <View style={styles.pageA4} className="mms-preview-page">
                    {/* Imagem de Fundo Geométrico / Marca D'água */}
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
                      <View style={[styles.a4Row, { marginBottom: 0, marginTop: 4 }]}>
                        <Text style={styles.a4Label}>Horário de Saída do Hotel (Previsto e Real):</Text>
                      </View>
                      {currentData.semSaida || !currentData.listaSaidas || currentData.listaSaidas.length === 0 ? (
                        <View style={styles.a4ContentBox}>
                          <Text style={styles.a4Value}>N/A</Text>
                        </View>
                      ) : (
                        <View style={{ marginBottom: 6, marginTop: 2 }}>
                          {currentData.listaSaidas.map((item, idx) => (
                            <View
                              key={item.id}
                              style={[
                                styles.a4ContentBox,
                                {
                                  flexWrap: 'wrap',
                                  marginTop: 0,
                                  marginBottom: idx === currentData.listaSaidas.length - 1 ? 0 : 2,
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
                          {currentData.semEmbarquePrev ? 'N/A' : fmtHoraA4(currentData.h3, currentData.m3)}
                        </Text>
                        <Text style={[styles.a4Label, { marginLeft: 16 }]}>Real: </Text>
                        <Text style={styles.a4Value}>
                          {currentData.semEmbarque ? 'N/A' : fmtHoraA4(currentData.h4, currentData.m4)}
                        </Text>
                      </View>

                      {/* Horário Inicial e de Finalização */}
                      <View style={[styles.a4Row, { marginBottom: 0, marginTop: 4 }]}>
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
                      <View style={[styles.a4Row, { marginTop: 4 }]}>
                        <Text style={styles.a4Label}>Nome do Preposto: </Text>
                        <Text style={styles.a4Value}>{currentData.preposto || 'N/A'}</Text>
                      </View>

                      {/* Informações sobre a troca */}
                      <View style={[styles.a4Row, { marginBottom: 0, marginTop: 4 }]}>
                        <Text style={styles.a4Label}>Informações sobre a troca de turma:</Text>
                      </View>
                      <View style={styles.a4InfoBox}>{renderFormattedText(currentData.info, currentData.alinhamentoInfo)}</View>

                      {/* Tabela de Passageiros */}
                      <View style={styles.a4PaxTable}>
                        <View style={styles.a4PaxColLeft}>
                          <Text style={styles.a4PaxTitle}>Nomes Passageiros Embarcando:</Text>
                          <View>{renderFormattedText(p1Lines1)}</View>
                        </View>
                        <View style={styles.a4PaxColRight}>
                          <Text style={styles.a4PaxTitle}>Nomes Passageiros Desembarcados:</Text>
                          <View>{renderFormattedText(p1Lines2)}</View>
                        </View>
                      </View>
                    </View>

                    {/* Footer Corporativo (fixo no rodapé da página) */}
                    <View style={styles.a4Footer}>
                      <Text style={styles.a4FooterText}>
                        Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072{'\n'}
                        E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
                      </Text>
                    </View>
                  </View>

                  {/* Páginas adicionais de passageiros em caso de quebra de página */}
                  {paxContinuationPages.map((chunk, idx) => (
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

                  {/* Páginas A4 adicionais para anexos fotográficos */}
                  {currentData.fotosAnexadas.map((foto) => (
                    <View key={foto.id} style={[styles.pageA4, { marginTop: 24 }]}>
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
                        <Text style={styles.a4DocumentTitle}>{foto.titulo || 'ANEXO FOTOGRÁFICO'}</Text>

                        <View style={styles.a4PhotoContainer}>
                          <Image source={{ uri: foto.uri }} style={styles.a4PhotoImage} resizeMode="contain" />
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
                </View>
              </View>
            </>
          );
        })()}
        </View>
      </ScrollView>

      {/* Modal Autenticação Central da Plataforma */}
      <Modal visible={isAuthModalVisible} transparent animationType="none">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View
            // @ts-ignore
            dataSet={{ modalOverlay: 'true' }}
            style={styles.modalOverlay}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: 24,
                paddingHorizontal: 16,
                width: '100%',
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ width: '100%' }}
            >
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
                  {authMode === 'login' ? 'ACESSO À PLATAFORMA' : 'CRIAR NOVA CONTA'}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal de Edição e Rotação de Imagem ("CONFIRMAR E ANEXAR") */}
      <Modal visible={imageEditorModal.visible} transparent animationType="none">
        <View
          // @ts-ignore
          dataSet={{ modalOverlay: 'true' }}
          style={styles.modalOverlay}
        >
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


      {/* Pop-up Flat & Elegante para Navegador de URL */}
      <Modal visible={isUrlModalVisible} transparent animationType="none">
        <View
          // @ts-ignore
          dataSet={{ modalOverlay: 'true' }}
          style={styles.modalOverlay}
        >
          <View style={styles.flatUrlCard}>
            <View style={styles.flatUrlIconWrapper}>
              <MaterialFlatIcon name="link" size={28} color="#0284c7" />
            </View>

            <Text style={styles.flatUrlTitle}>NAVEGADOR DE URL</Text>
            <Text style={styles.flatUrlSubtitle}>
              Digite ou altere o endereço que deseja acessar:
            </Text>

            <View style={styles.flatUrlInputContainer}>
              <TextInput
                style={styles.flatUrlInput}
                value={navUrl}
                onChangeText={setNavUrl}
                placeholder="https://exemplo.com"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                selectTextOnFocus
              />
              {navUrl.length > 0 && (
                <TouchableOpacity
                  onPress={() => setNavUrl('')}
                  style={styles.flatUrlClearBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.flatUrlClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.flatUrlButtonsRow}>
              <TouchableOpacity
                style={styles.btnFlatUrlCancel}
                onPress={() => setIsUrlModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.btnFlatUrlCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnFlatUrlGo}
                onPress={handleNavigateUrl}
                activeOpacity={0.8}
              >
                <Text style={styles.btnFlatUrlGoText}>Acessar URL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pop-up Flat e Elegante (Substitui Alerts Nativos com Design Moderno) */}
      <Modal visible={customDialog.visible} transparent animationType="none">
        <View
          // @ts-ignore
          dataSet={{ modalOverlay: 'true' }}
          style={styles.modalOverlay}
        >
          <View style={styles.flatAlertCard}>
            <View
              style={[
                styles.flatAlertIconWrapper,
                customDialog.type === 'confirm'
                  ? styles.flatAlertIconWrapperWarning
                  : styles.flatAlertIconWrapperInfo,
              ]}
            >
              <MaterialFlatIcon
                name={customDialog.type === 'confirm' ? 'warningTriangle' : 'alert'}
                size={34}
                color={customDialog.type === 'confirm' ? '#d97706' : '#2563eb'}
              />
            </View>

            <Text style={styles.flatAlertTitle}>{customDialog.title || 'AVISO'}</Text>
            <Text style={styles.flatAlertMessage}>{customDialog.message}</Text>

            <View style={styles.flatAlertButtonsRow}>
              {customDialog.type === 'confirm' && (
                <TouchableOpacity
                  style={styles.btnFlatCancel}
                  onPress={customDialog.onCancel}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnFlatCancelText}>
                    {customDialog.cancelText || 'Cancelar'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.btnFlatConfirm,
                  customDialog.type === 'confirm' && { flex: 1 },
                ]}
                onPress={customDialog.onConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.btnFlatConfirmText}>
                  {customDialog.confirmText || 'OK'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast Flutuante de Rascunho Salvo (idêntico ao index.php) */}
      {isDraftToastVisible && (
        <View style={styles.toastSaveContainer} pointerEvents="none" className="mms-toast-save">
          <View style={styles.toastSaveDot} />
          <Text style={styles.toastSaveText}>Rascunho Salvo</Text>
        </View>
      )}

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
    backgroundColor: '#0f172a',
  },
  navbar: {
    minHeight: 60,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: 'relative' as any,
    width: '100%',
    zIndex: 100,
  },
  navBrandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navBrandTextWrap: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  navBrandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBrandName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  navBrandBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  navBrandBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    fontFamily: modernFont,
  },
  navLeftGradientBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  navRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navNotifBtn: {
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifBadgeCircle: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#e11d48',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0f172a',
  },
  notifBadgeCircleText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  navMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  navMenuBtnActive: {
    backgroundColor: '#1e293b',
  },
  navMenuBtnText: {
    color: '#e2e8f0',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  menuAvatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuAvatarCircleText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
    fontFamily: modernFont,
  },
  navHamburgerLines: {
    width: 20,
    height: 14,
    justifyContent: 'space-between',
  },
  navHamburgerBar: {
    width: 20,
    height: 2,
    backgroundColor: '#e2e8f0',
    borderRadius: 1,
  },
  dropdownModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 16,
    ...(Platform.OS === 'web'
      ? ({
        backdropFilter: 'blur(1.5px)',
        WebkitBackdropFilter: 'blur(1.5px)',
      } as any)
      : {}),
  },
  dropdownMenuCard: {
    width: 240,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
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
    backgroundColor: '#0f172a',
    padding: 12,
    paddingBottom: 48,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 672,
    alignItems: 'stretch',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.white,
    marginBottom: 48,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 36, // quebra de 2 linhas para baixo do botão iniciar novo relatório
  },
  headerLogoImage: {
    height: 52,
    width: 140,
  },
  btnNovoRelatorio: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    paddingVertical: 10,
    paddingHorizontal: 16,
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
    fontWeight: '600',
    fontSize: 13,
    fontFamily: modernFont,
  },
  mainTitle: {
    fontSize: 20, // text-xl
    fontWeight: '900', // font-black
    textAlign: 'center', // text-center
    marginBottom: 20, // mb-5
    borderBottomWidth: 2, // border-b-2
    borderBottomColor: '#f1f5f9', // border-slate-100
    paddingBottom: 6, // junte mais à linha divisória
    paddingHorizontal: 4,
    color: '#1e293b', // text-slate-800
    textTransform: 'uppercase', // uppercase
    letterSpacing: -0.5, // tracking-tight
    fontFamily: corporateFont,
  },
  qrCodeToolContainer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    alignItems: 'center',
    width: '100%',
  },
  qrCodeToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  qrCodeToolIcon: {
    fontSize: 14,
    color: colors.slate600,
  },
  qrCodeToolText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.slate600,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  mainTitleDesktop: {
    fontSize: 24, // md:text-2xl
  },
  headerDivider: {
    height: 0,
    backgroundColor: 'transparent',
    marginBottom: 0,
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
  // ─── ESTILOS: RELATÓRIOS EM ANDAMENTO (ABAS DE RASCUNHO) ───
  draftTabsSection: {
    width: '100%',
    marginBottom: 16,
  },
  draftTabsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
    gap: 8,
  },
  draftTabsSectionTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    fontFamily: modernFont,
    flexShrink: 1,
  },
  btnAddDraftReport: {
    backgroundColor: '#eff6ff',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  btnAddDraftReportDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    opacity: 0.5,
  },
  btnAddDraftReportText: {
    color: '#2563eb',
    fontWeight: '900',
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    fontFamily: modernFont,
  },
  btnAddDraftReportTextDisabled: {
    color: '#94a3b8',
  },
  draftTabsContainer: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    alignItems: 'stretch',
  },
  draftTabSlot: {
    flex: 1,
    minWidth: 120,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    position: 'relative',
  },
  draftTabSlotActive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  draftTabSlotInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  draftTabRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  draftTabRemoveText: {
    color: '#e11d48',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 11,
  },
  draftTabSlotTitle: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#64748b',
    letterSpacing: 0.5,
    fontFamily: modernFont,
    textAlign: 'center',
  },
  draftTabSlotTitleActive: {
    color: '#2563eb',
    fontWeight: '900',
  },
  draftTabSlotTitleInactive: {
    color: '#64748b',
    fontWeight: '700',
  },
  draftTabSlotTitleEmpty: {
    color: '#94a3b8',
    fontWeight: '700',
  },
  draftTabSlotName: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 1,
    fontFamily: modernFont,
    textAlign: 'center',
  },
  draftTabSlotNameActive: {
    color: '#0f172a',
    fontWeight: '900',
  },
  draftTabSlotNameInactive: {
    color: '#334155',
    fontWeight: '700',
  },
  draftTabSlotNameEmpty: {
    color: '#94a3b8',
    fontWeight: '500',
  },
  formContainer: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 20, // Aumentado o espaçamento entre os grupos de campos
  },
  formContainerLocked: {
    opacity: 0.52,
  },
  formFooterActionsWrap: {
    width: '100%',
    alignSelf: 'stretch',
    marginTop: 16,
    gap: 16,
  },
  inputGroup: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'column',
    marginBottom: 4,
  },
  dateInputContainer: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
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
    width: '100%',
    height: 48,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 12,
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
    width: '100%',
    height: 48,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 0,
    fontSize: 13,
    fontWeight: '500',
    color: colors.slate800,
    backgroundColor: colors.slate50,
    fontFamily: corporateFont,
    justifyContent: 'center',
  },
  obsBox: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.indigo50,
    padding: 14,
    borderRadius: 12,
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
    width: '100%',
    height: 48,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.indigo200,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 0,
    fontSize: 13,
    fontWeight: '700',
    color: colors.indigo900,
    backgroundColor: colors.white,
    marginBottom: 6,
    fontFamily: corporateFont,
    justifyContent: 'center',
  },
  obsHint: {
    fontSize: 11,
    color: colors.indigo800,
    lineHeight: 16,
    fontFamily: corporateFont,
  },
  horariosBox: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
    marginVertical: 8,
  },
  horariosTitle: {
    fontWeight: '900',
    fontSize: 15,
    color: '#1e3a8a',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 10,
    marginBottom: 0,
    fontFamily: corporateFont,
  },
  horarioCard: {
    width: '100%',
    alignSelf: 'stretch',
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
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    position: 'relative',
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  timeCardItem: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  saidaRealDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
  },
  naDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 10,
    marginBottom: 4,
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
    gap: 6,
  },
  timeSectionBlockDesktop: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 6,
  },
  timeSectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    fontFamily: corporateFont,
  },
  timeSectionLabelDesktop: {
    textAlign: 'center',
  },
  saidaLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  saidaLabelGroupDesktop: {
    justifyContent: 'center',
  },
  saidaLabelInput: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1d4ed8',
    textAlign: 'center',
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: '#bfdbfe',
    fontFamily: corporateFont,
  },
  saidaRealLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    fontFamily: corporateFont,
  },
  saidaRealLabelDesktop: {
    textAlign: 'center',
  },
  colon: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#1d4ed8',
    marginLeft: 2,
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
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  timeRowLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    fontFamily: corporateFont,
  },
  timeInputsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timeInput: {
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    width: 68,
    height: 52,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontFamily: corporateFont,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  disabledInput: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
    borderColor: '#e2e8f0',
  },
  timeSufix: {
    color: '#94a3b8',
    fontWeight: '700',
    fontSize: 14,
    marginHorizontal: 3,
    textAlign: 'center',
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
    borderRadius: 3,
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
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
    alignItems: 'center',
    marginTop: 6,
  },
  btnNovaSaidaText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1e3a8a',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: corporateFont,
  },
  sectionHeaderBox: {
    width: '100%',
    alignSelf: 'stretch',
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
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    fontFamily: 'Tahoma',
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
    backgroundColor: 'rgba(236, 253, 245, 0.3)',
    borderWidth: 1,
    borderColor: '#d1fae5',
    borderRadius: 8,
    padding: 10,
    height: 500,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden',
  },
  paxHeaderBadgeEmbarque: {
    backgroundColor: 'rgba(209, 250, 229, 0.5)',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  paxTitleEmbarque: {
    fontSize: 16,
    fontWeight: '500',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: modernFont,
  },
  paxBoxDesembarque: {
    backgroundColor: 'rgba(255, 241, 242, 0.3)',
    borderWidth: 1,
    borderColor: '#ffe4e6',
    borderRadius: 8,
    padding: 10,
    height: 500,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden',
  },
  paxHeaderBadgeDesembarque: {
    backgroundColor: 'rgba(254, 205, 211, 0.5)',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  paxTitleDesembarque: {
    fontSize: 16,
    fontWeight: '500',
    color: '#be123c',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: modernFont,
  },
  paxTextInputEmbarque: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
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
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
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
    backgroundColor: '#e2e8f0',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    color: '#64748b',
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { cursor: 'not-allowed' } : {}),
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
  areaSucessoPdf: {
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
  btnCompartilharPdf: {
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
  btnCompartilharPdfIcon: {
    fontSize: 18,
    color: '#ffffff',
  },
  btnCompartilharPdfText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
    fontFamily: corporateFont,
  },
  btnBaixarPdf: {
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
  btnBaixarPdfIcon: {
    fontSize: 18,
    color: '#ffffff',
  },
  btnBaixarPdfText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
    fontFamily: corporateFont,
  },
  btnEditarPdf: {
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
  btnEditarPdfIcon: {
    fontSize: 18,
    color: '#1e293b',
  },
  btnEditarPdfText: {
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
  pingContainer: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pingPulse: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
  },
  pingCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 2,
  },
  sincronizadoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8da4c8',
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    fontFamily: corporateFont,
  },
  toastSaveContainer: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    bottom: (Platform.OS === 'web' ? 'calc(env(safe-area-inset-bottom, 0px) + 24px)' : 90) as any,
    right: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 99999,
  },
  toastSaveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34d399',
    shadowColor: '#34d399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  toastSaveText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  // ─── ESTILOS FABBAR (INSPIRADO NO REPOSITÓRIO RYANASHCRAFT/FABBAR) ───
  fabBarWrapper: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    bottom: 22,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    pointerEvents: 'box-none' as any,
  },
  fabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    maxWidth: '96%',
  },
  fabBarCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    gap: 4,
  },
  fabBarCapsuleLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
    ...(Platform.OS === 'web'
      ? ({
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
      } as any)
      : {}),
  },
  fabBarCapsuleDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 8,
    ...(Platform.OS === 'web'
      ? ({
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
      } as any)
      : {}),
  },
  fabBarTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    minWidth: 64,
    height: 50,
  },
  fabBarTabActiveLight: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  fabBarTabActiveDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  fabBarTabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: modernFont,
  },
  fabBarTabLabelLight: {
    color: '#64748b',
  },
  fabBarTabLabelDark: {
    color: '#94a3b8',
  },
  fabBarTabLabelActiveLight: {
    color: '#2563eb',
    fontWeight: '800',
  },
  fabBarTabLabelActiveDark: {
    color: '#60a5fa',
    fontWeight: '800',
  },
  fabButtonTouch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 9,
    ...(Platform.OS === 'web'
      ? ({
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(37, 99, 235, 0.42)',
      } as any)
      : {}),
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
    alignSelf: 'center',
  },
  previewScaleContainer: {
    width: 794,
    alignItems: 'center',
  },
  pageA4: {
    backgroundColor: colors.white,
    width: 794,
    height: 1123,
    minHeight: 1123,
    maxHeight: 1123,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.slate200,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
    position: 'relative',
    overflow: 'hidden',
    paddingTop: 114, // 30mm conforme index.php (.page-a4: padding: 30mm 15mm 18mm 15mm)
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
    top: 19, // 5mm conforme index.php (.fixed-logo: top: 5mm; left: 15mm;)
    left: 57, // 15mm conforme index.php
    width: 80, // 80px conforme index.php
    height: 80, // 80px conforme index.php
    zIndex: 5,
  },
  a4DocumentTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
    marginTop: -8, // -2mm conforme index.php (.titulo-pdf: margin-top: -2mm; margin-bottom: 5mm;)
    marginBottom: 19, // 5mm conforme index.php
    color: colors.black,
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
    color: colors.black,
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4Value: {
    fontSize: 14,
    color: colors.black,
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
    fontSize: 14,
    color: colors.black,
    lineHeight: 20,
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
    color: colors.black,
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, serif' : undefined,
  },
  a4Footer: {
    position: 'absolute',
    left: 57, // 15mm conforme index.php (.footer: bottom: 10mm; left: 15mm; right: 15mm;)
    right: 57, // 15mm conforme index.php
    bottom: 38, // 10mm conforme index.php
    alignItems: 'center',
    zIndex: 5,
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

  /* Modais e Pop-ups Flat & Elegantes */
  flatAlertCard: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  flatAlertIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  flatAlertIconWrapperInfo: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
  },
  flatAlertIconWrapperWarning: {
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#fef08a',
  },
  flatAlertTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: modernFont,
    textTransform: 'uppercase',
  },
  flatAlertMessage: {
    fontSize: 13.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
    fontFamily: modernFont,
  },
  flatAlertButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  btnFlatCancel: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFlatCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
    fontFamily: modernFont,
  },
  btnFlatConfirm: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  btnFlatConfirmText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
    fontFamily: modernFont,
  },

  /* Pop-up Flat Navegador de URL */
  flatUrlCard: {
    width: '92%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  flatUrlIconWrapper: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  flatUrlTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: modernFont,
    textTransform: 'uppercase',
  },
  flatUrlSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    fontFamily: modernFont,
  },
  flatUrlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    width: '100%',
    marginBottom: 20,
  },
  flatUrlInput: {
    flex: 1,
    height: 44,
    fontSize: 13.5,
    color: '#0f172a',
    fontFamily: modernFont,
  },
  flatUrlClearBtn: {
    padding: 6,
    marginLeft: 4,
  },
  flatUrlClearText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  flatUrlButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  btnFlatUrlCancel: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFlatUrlCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
    fontFamily: modernFont,
  },
  btnFlatUrlGo: {
    flex: 1.3,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  btnFlatUrlGoText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
    fontFamily: modernFont,
  },

  /* Rodapé do Documento / Formulário */
  appFooterContainer: {
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  appFooterContainerMobile: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  appFooterSpacer: {
    width: 80,
  },
  appFooterText: {
    flex: 1,
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
  appFooterTextMobile: {
    flex: 0,
    width: '100%',
    textAlign: 'center',
    alignSelf: 'center',
    lineHeight: 18,
  },
  appFooterHighlight: {
    letterSpacing: 0.8,
  },
  appFooterVersionWrapper: {
    width: 80,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  appFooterVersionWrapperMobile: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 4,
  },
  appFooterVersionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  appFooterVersionIcon: {
    fontSize: 11,
    color: '#94a3b8',
  },
  appFooterVersionText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: modernFont,
  },
});
