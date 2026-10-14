import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function Layout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
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
          /* Scrollbar Estilizado Conforme Anexo 1 */
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
