import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { registerUser } from '../lib/auth';

const modernFont = Platform.OS === 'web'
  ? "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
  : undefined;

const corporateFont = Platform.OS === 'web'
  ? '"Times New Roman", Times, serif'
  : undefined;

export default function CadastroScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [nome, setNome] = useState('');
  const [username, setUsername] = useState('');
  const [usernameConfirm, setUsernameConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaConfirm, setSenhaConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'erro' | 'sucesso';
    text: string;
    details?: string;
  } | null>(null);

  const handleRegister = async () => {
    setFeedback(null);

    const cleanNome = nome.trim();
    const cleanUser = username.trim().toLowerCase();
    const cleanUserConfirm = usernameConfirm.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanEmailConfirm = emailConfirm.trim().toLowerCase();
    const cleanPass = senha;
    const cleanPassConfirm = senhaConfirm;

    if (!cleanNome || !cleanUser || !cleanUserConfirm || !cleanEmail || !cleanEmailConfirm || !cleanPass || !cleanPassConfirm) {
      setFeedback({
        type: 'erro',
        text: 'Preencha todos os campos obrigatórios do formulário.',
      });
      return;
    }

    if (cleanNome.length < 3) {
      setFeedback({
        type: 'erro',
        text: 'O nome completo deve conter ao menos 3 caracteres.',
      });
      return;
    }

    if (cleanUser !== cleanUserConfirm) {
      setFeedback({
        type: 'erro',
        text: 'Os nomes de usuário não coincidem!',
        details: 'Verifique a digitação no campo Usuário e Confirmar Usuário.',
      });
      return;
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(cleanUser)) {
      setFeedback({
        type: 'erro',
        text: 'Nome de usuário inválido.',
        details: 'Utilize apenas letras, números, ponto (.), underline (_) ou hífen (-).',
      });
      return;
    }

    if (cleanEmail !== cleanEmailConfirm) {
      setFeedback({
        type: 'erro',
        text: 'Os e-mails informados não coincidem!',
        details: 'Confira se os dois campos de e-mail foram digitados exatamente iguais.',
      });
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setFeedback({
        type: 'erro',
        text: 'Por favor, informe um endereço de e-mail válido.',
      });
      return;
    }

    if (cleanPass.length < 6) {
      setFeedback({
        type: 'erro',
        text: 'A senha de acesso deve possuir no mínimo 6 caracteres.',
      });
      return;
    }

    if (cleanPass !== cleanPassConfirm) {
      setFeedback({
        type: 'erro',
        text: 'As senhas digitadas não coincidem!',
        details: 'Certifique-se de que a confirmação de senha é idêntica à senha.',
      });
      return;
    }

    setLoading(true);

    try {
      const res = await registerUser({
        nome: cleanNome,
        username: cleanUser,
        usernameConfirm: cleanUserConfirm,
        email: cleanEmail,
        emailConfirm: cleanEmailConfirm,
        senha: cleanPass,
        senhaConfirm: cleanPassConfirm,
      });

      if (res.success) {
        setFeedback({
          type: 'sucesso',
          text: res.message || 'Cadastro realizado com sucesso!',
          details: 'Você já pode acessar o sistema com seu usuário ou aguardar a liberação da coordenação.',
        });
        setNome('');
        setUsername('');
        setUsernameConfirm('');
        setEmail('');
        setEmailConfirm('');
        setSenha('');
        setSenhaConfirm('');
      } else {
        setFeedback({
          type: 'erro',
          text: res.message || 'Falha ao processar o cadastro.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'erro',
        text: err?.message || 'Erro inesperado de comunicação com o servidor.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/?auth=login';
    } else {
      router.push('/');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Barra Superior / Header de Navegação */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/';
              } else {
                router.push('/');
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonArrow}>←</Text>
            <Text style={styles.backButtonText}>Voltar ao Início</Text>
          </TouchableOpacity>

          <View style={styles.brandBadge}>
            <Text style={styles.brandTitle}>MMS</Text>
            <Text style={styles.brandSubtitle}>RELATÓRIOS</Text>
          </View>
        </View>

        {/* Card Principal de Cadastro Confortável */}
        <View style={[styles.mainCard, isMobile ? styles.mainCardMobile : null]}>
          {/* Cabeçalho do Card */}
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <Text style={{ fontSize: 24 }}>👤</Text>
            </View>
            <Text style={styles.cardTitle}>CRIAR NOVA CONTA</Text>
            <Text style={styles.cardSubtitle}>
              Preencha os campos abaixo com tranquilidade para solicitar seu acesso à plataforma de relatórios operacionais.
            </Text>
          </View>

          {/* Feedback de Erro ou Sucesso */}
          {feedback && (
            <View
              style={[
                styles.feedbackBox,
                feedback.type === 'erro' ? styles.feedbackErro : styles.feedbackSucesso,
              ]}
            >
              <Text
                style={[
                  styles.feedbackTitle,
                  feedback.type === 'erro' ? styles.feedbackTitleErro : styles.feedbackTitleSucesso,
                ]}
              >
                {feedback.type === 'erro' ? '⚠️ Atenção' : '🎉 Sucesso!'}
              </Text>
              <Text
                style={[
                  styles.feedbackText,
                  feedback.type === 'erro' ? styles.feedbackTextErro : styles.feedbackTextSucesso,
                ]}
              >
                {feedback.text}
              </Text>
              {feedback.details ? (
                <Text
                  style={[
                    styles.feedbackDetails,
                    feedback.type === 'erro' ? styles.feedbackDetailsErro : styles.feedbackDetailsSucesso,
                  ]}
                >
                  {feedback.details}
                </Text>
              ) : null}

              {feedback.type === 'sucesso' && (
                <TouchableOpacity
                  style={styles.btnSuccessAction}
                  onPress={handleGoToLogin}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnSuccessActionText}>Acessar Minha Conta (Fazer Login) →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Formulário de Cadastro Amplo e Confortável */}
          <View style={styles.formContainer}>
            {/* Campo: Nome Completo */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOME COMPLETO *</Text>
              <TextInput
                style={styles.input}
                value={nome}
                onChangeText={setNome}
                placeholder="Ex: João da Silva"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
                autoCorrect={false}
              />
              <Text style={styles.helperText}>Informe seu nome e sobrenome completo para identificação nos relatórios.</Text>
            </View>

            {/* Linha dupla: Usuário e Confirmar Usuário */}
            <View style={[styles.rowGroup, isMobile ? styles.rowGroupMobile : null]}>
              <View style={[styles.inputGroup, styles.colHalf]}>
                <Text style={styles.label}>NOME DE USUÁRIO (LOGIN) *</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Ex: joao.silva"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={[styles.inputGroup, styles.colHalf]}>
                <Text style={styles.label}>CONFIRMAR USUÁRIO *</Text>
                <TextInput
                  style={styles.input}
                  value={usernameConfirm}
                  onChangeText={setUsernameConfirm}
                  placeholder="Repita o usuário"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Linha dupla: E-mail e Confirmar E-mail */}
            <View style={[styles.rowGroup, isMobile ? styles.rowGroupMobile : null]}>
              <View style={[styles.inputGroup, styles.colHalf]}>
                <Text style={styles.label}>E-MAIL CORPORATIVO *</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="seu.email@empresa.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={[styles.inputGroup, styles.colHalf]}>
                <Text style={styles.label}>CONFIRMAR E-MAIL *</Text>
                <TextInput
                  style={styles.input}
                  value={emailConfirm}
                  onChangeText={setEmailConfirm}
                  placeholder="Repita o seu e-mail"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Linha dupla: Senha e Confirmar Senha */}
            <View style={[styles.rowGroup, isMobile ? styles.rowGroupMobile : null]}>
              <View style={[styles.inputGroup, styles.colHalf]}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>SENHA DE ACESSO *</Text>
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.togglePasswordText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={senha}
                  onChangeText={setSenha}
                  placeholder="Mínimo de 6 dígitos"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>

              <View style={[styles.inputGroup, styles.colHalf]}>
                <Text style={styles.label}>CONFIRMAR SENHA *</Text>
                <TextInput
                  style={styles.input}
                  value={senhaConfirm}
                  onChangeText={setSenhaConfirm}
                  placeholder="Repita a sua senha"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Nota de Segurança e Boas Práticas */}
            <View style={styles.securityNotice}>
              <Text style={styles.securityNoticeIcon}>🛡️</Text>
              <Text style={styles.securityNoticeText}>
                Seus dados serão analisados com segurança. Caso o sistema esteja em modo de aprovação restrita pela coordenação do MMS, você receberá a liberação assim que aprovado.
              </Text>
            </View>

            {/* Botão de Enviar Cadastro */}
            <TouchableOpacity
              style={[styles.btnSubmit, loading && styles.btnSubmitDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <View style={styles.btnLoadingRow}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.btnSubmitText}>PROCESSANDO CADASTRO...</Text>
                </View>
              ) : (
                <Text style={styles.btnSubmitText}>FINALIZAR CADASTRO</Text>
              )}
            </TouchableOpacity>

            {/* Rodapé do Card com Atalho para Login */}
            <View style={styles.cardFooter}>
              <Text style={styles.footerPrompt}>Já possui uma conta ativa?</Text>
              <TouchableOpacity onPress={handleGoToLogin} activeOpacity={0.7}>
                <Text style={styles.footerLink}>Fazer Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Rodapé Institucional */}
        <View style={styles.pageFooter}>
          <Text style={styles.pageFooterText}>MMS LOGÍSTICA &bull; GERADOR DE RELATÓRIOS SEGURO</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    width: '100%',
    maxWidth: 580,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 8,
  },
  backButtonArrow: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  backButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: modernFont,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: modernFont,
  },
  brandSubtitle: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: modernFont,
  },
  mainCard: {
    width: '100%',
    maxWidth: 580,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  mainCardMobile: {
    padding: 20,
    borderRadius: 16,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.5,
    marginBottom: 8,
    fontFamily: modernFont,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: modernFont,
  },
  feedbackBox: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
  },
  feedbackErro: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  feedbackSucesso: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  feedbackTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
    fontFamily: modernFont,
  },
  feedbackTitleErro: {
    color: '#991b1b',
  },
  feedbackTitleSucesso: {
    color: '#166534',
  },
  feedbackText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    fontFamily: modernFont,
  },
  feedbackTextErro: {
    color: '#b91c1c',
  },
  feedbackTextSucesso: {
    color: '#15803d',
  },
  feedbackDetails: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: modernFont,
  },
  feedbackDetailsErro: {
    color: '#dc2626',
  },
  feedbackDetailsSucesso: {
    color: '#16a34a',
  },
  btnSuccessAction: {
    marginTop: 12,
    backgroundColor: '#16a34a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSuccessActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: modernFont,
  },
  formContainer: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 16,
    width: '100%',
  },
  rowGroup: {
    flexDirection: 'row',
    gap: 14,
  },
  rowGroupMobile: {
    flexDirection: 'column',
    gap: 0,
  },
  colHalf: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
    marginBottom: 6,
    fontFamily: modernFont,
  },
  togglePasswordText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    fontFamily: modernFont,
  },
  input: {
    width: '100%',
    height: 46,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    fontFamily: modernFont,
  },
  helperText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
    fontFamily: modernFont,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginTop: 4,
    marginBottom: 20,
  },
  securityNoticeIcon: {
    fontSize: 18,
  },
  securityNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
    fontFamily: modernFont,
  },
  btnSubmit: {
    width: '100%',
    height: 50,
    backgroundColor: '#059669',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnSubmitDisabled: {
    opacity: 0.65,
  },
  btnLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnSubmitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    fontFamily: modernFont,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footerPrompt: {
    fontSize: 13,
    color: '#64748b',
    fontFamily: modernFont,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563eb',
    fontFamily: modernFont,
  },
  pageFooter: {
    marginTop: 24,
    alignItems: 'center',
  },
  pageFooterText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    fontFamily: modernFont,
  },
});
