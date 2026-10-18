import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import '../css/painel_coord.css';
import '../css/estilo.css';

export default function Layout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'MMS Relatórios | Gerador de Relatórios';

      // 1. Desativar Zoom via Viewport Meta Tag
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        document.head.appendChild(meta);
      }
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, shrink-to-fit=no'
      );

      // 2. Desativar Zoom por Gestos (Pinch-to-zoom / Touch)
      const preventGesture = (e: Event) => e.preventDefault();
      document.addEventListener('gesturestart', preventGesture, { passive: false });
      document.addEventListener('gesturechange', preventGesture, { passive: false });
      document.addEventListener('gestureend', preventGesture, { passive: false });

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches && e.touches.length > 1) {
          e.preventDefault();
        }
      };
      document.addEventListener('touchmove', handleTouchMove, { passive: false });

      let lastTouchEnd = 0;
      const handleTouchEnd = (e: TouchEvent) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
        }
        lastTouchEnd = now;
      };
      document.addEventListener('touchend', handleTouchEnd, { passive: false });

      // 3. Desativar Zoom por Teclado e Roda do Mouse (Ctrl + Scroll / Ctrl + +/-)
      const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
        }
      };
      window.addEventListener('wheel', handleWheel, { passive: false });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          (e.ctrlKey || e.metaKey) &&
          (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0' || e.key === 'Add' || e.key === 'Subtract')
        ) {
          e.preventDefault();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      // Sincronização Imediata Anti-FOUC (Previne qualquer Flash de Modo Escuro)
      try {
        const savedTheme = localStorage.getItem('app_theme_dark');
        const isDark = savedTheme === 'true';
        if (isDark) {
          document.documentElement.classList.add('dark-theme');
          document.documentElement.classList.remove('light-theme');
          document.body.classList.add('dark-theme');
          document.body.classList.remove('light-theme');
        } else {
          document.documentElement.classList.add('light-theme');
          document.documentElement.classList.remove('dark-theme');
          document.body.classList.add('light-theme');
          document.body.classList.remove('dark-theme');
        }
      } catch (e) {}

      if (!document.getElementById('inter-font-link')) {
        const link = document.createElement('link');
        link.id = 'inter-font-link';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap';
        document.head.appendChild(link);
      }

      if (!document.getElementById('custom-scrollbar-style')) {
        const style = document.createElement('style');
        style.id = 'custom-scrollbar-style';
        style.innerHTML = `
          /* Reset e Fundo Padrão Idêntico ao index.php */
          html, body {
            touch-action: pan-x pan-y;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
            background-color: #0f172a;
            margin: 0;
            min-height: 100vh;
          }

          /* Scrollbar Estilizado Customizado (#0f172a Padrão) */
          ::-webkit-scrollbar {
            width: 14px;
            height: 14px;
          }
          ::-webkit-scrollbar-track,
          ::-webkit-scrollbar-button {
            background-color: #0f172a;
          }
          ::-webkit-scrollbar-thumb {
            background-color: #64748b;
            border-radius: 7px;
            border: 3px solid #0f172a;
          }
          ::-webkit-scrollbar-thumb:hover {
            background-color: #94a3b8;
          }
          ::-webkit-scrollbar-button:single-button:vertical:decrement {
            height: 14px;
            background: #0f172a url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%2394a3b8'><polygon points='50,20 20,80 80,80'/></svg>") no-repeat center center;
            background-size: 8px 8px;
          }
          ::-webkit-scrollbar-button:single-button:vertical:increment {
            height: 14px;
            background: #0f172a url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%2394a3b8'><polygon points='50,80 20,20 80,20'/></svg>") no-repeat center center;
            background-size: 8px 8px;
          }

          /* Modo Claro (Utilizado no Painel de Coordenação) */
          body.light-theme {
            background-color: #f1f5f9;
          }
          body.light-theme ::-webkit-scrollbar-track,
          body.light-theme ::-webkit-scrollbar-button {
            background-color: #f1f5f9;
          }
          body.light-theme ::-webkit-scrollbar-thumb {
            background-color: #94a3b8;
            border: 3px solid #f1f5f9;
          }
          body.light-theme ::-webkit-scrollbar-thumb:hover {
            background-color: #475569;
          }
          body.light-theme ::-webkit-scrollbar-button:single-button:vertical:decrement {
            background: #f1f5f9 url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%2364748b'><polygon points='50,20 20,80 80,80'/></svg>") no-repeat center center;
            background-size: 8px 8px;
          }
          body.light-theme ::-webkit-scrollbar-button:single-button:vertical:increment {
            background: #f1f5f9 url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%2364748b'><polygon points='50,80 20,20 80,20'/></svg>") no-repeat center center;
            background-size: 8px 8px;
          }

          /* Animação suave, gradativa e natural de backdrop blur para todos os modais e pop-ups (blur suave reduzido e sem escurecer) */
          @keyframes mmsNaturalBlurIn {
            0% {
              backdrop-filter: blur(0px);
              -webkit-backdrop-filter: blur(0px);
              background-color: transparent;
            }
            50% {
              backdrop-filter: blur(1px);
              -webkit-backdrop-filter: blur(1px);
              background-color: rgba(15, 23, 42, 0.04);
            }
            100% {
              backdrop-filter: blur(2px);
              -webkit-backdrop-filter: blur(2px);
              background-color: rgba(15, 23, 42, 0.08);
            }
          }

          @keyframes mmsModalCardRise {
            0% {
              opacity: 0;
              transform: scale(0.96) translateY(14px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }

          /* Aplica transição gradativa e natural no backdrop dos modais */
          [data-modal-overlay="true"],
          .mms-modal-overlay {
            animation: mmsNaturalBlurIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
            will-change: backdrop-filter, background-color !important;
          }

          [data-modal-overlay="true"] > div,
          .mms-modal-overlay > div {
            animation: mmsModalCardRise 0.36s cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
            will-change: transform, opacity !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="meus_relatorios" />
      <Stack.Screen name="painel_coord" />
    </Stack>
  );
}
