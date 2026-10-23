import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';

export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Redireciona rotas de coordenação para a tela de coordenação
    if (pathname && (pathname.includes('coord') || pathname.includes('painel'))) {
      router.replace('/painel_coord');
    }
  }, [pathname, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🧭</Text>
      <Text style={styles.title}>PÁGINA NÃO ENCONTRADA</Text>
      <Text style={styles.subtitle}>
        O endereço solicitado não foi localizado ou foi movido.
      </Text>
      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={[styles.button, styles.btnCoord]}
          onPress={() => router.replace('/painel_coord')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>IR PARA COORDENAÇÃO ›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.btnHome]}
          onPress={() => router.replace('/')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>INÍCIO</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  icon: {
    fontSize: 52,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1.2,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 400,
    lineHeight: 20,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCoord: {
    backgroundColor: '#d97706',
  },
  btnHome: {
    backgroundColor: '#334155',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
