import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function Layout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
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
          /* Desativa zoom e salto de escala por toque */
          html, body {
            touch-action: pan-x pan-y;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }

          /* Scrollbar Estilizado Customizado */
          ::-webkit-scrollbar {
            width: 14px;
            height: 14px;
          }
          ::-webkit-scrollbar-track {
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

          /* Modo Claro */
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

          /* Animação suave e gradativa de backdrop blur para todos os modais e pop-ups */
          @keyframes mmsBackdropFadeIn {
            0% {
              opacity: 0;
              backdrop-filter: blur(0px);
              -webkit-backdrop-filter: blur(0px);
            }
            100% {
              opacity: 1;
              backdrop-filter: blur(4px);
              -webkit-backdrop-filter: blur(4px);
            }
          }

          @keyframes mmsModalCardZoomIn {
            0% {
              opacity: 0;
              transform: scale(0.96) translateY(8px);
            }
            100% {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }

          /* Aplica transição gradativa no backdrop dos modais */
          div[role="dialog"],
          div[aria-modal="true"],
          div[data-modal-overlay="true"],
          .mms-modal-backdrop {
            animation: mmsBackdropFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
          }

          div[role="dialog"] > div,
          div[aria-modal="true"] > div,
          .mms-modal-card {
            animation: mmsModalCardZoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
