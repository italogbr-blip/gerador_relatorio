// assets/js/notifications.js
// Script de polling para buscar notificações em tempo real e exibir toasts.

document.addEventListener('DOMContentLoaded', function () {
  const badge = document.getElementById('notifCount');
  const bell = document.getElementById('notificationBell');
  const seenIds = new Set(); // IDs já mostrados nesta sessão

  // Função para criar um toast simples
  function createToast(title, message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div class="title">${title}</div><div class="msg">${message}</div>`;
    document.body.appendChild(toast);
    // Remove após 5s
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  async function fetchNotifications() {
    try {
      const resp = await fetch('notificacoes_ajax.php');
      if (!resp.ok) throw new Error('Erro ao buscar notificações');
      const data = await resp.json();
      if (data.status !== 'ok') throw new Error(data.message || 'Status inesperado');
      const notifs = data.data || [];
      // Atualiza badge
      const unseen = notifs.filter(n => !seenIds.has(n.id));
      if (unseen.length > 0) {
        badge.textContent = notifs.length;
        badge.classList.remove('hidden');
        // Exibe toast para cada nova notificação
        unseen.forEach(n => {
          createToast(n.titulo, n.mensagem);
          seenIds.add(n.id);
        });
      } else {
        // Nenhuma nova – ainda mostra contagem total ou esconde se zero
        if (notifs.length === 0) {
          badge.classList.add('hidden');
        } else {
          badge.textContent = notifs.length;
          badge.classList.remove('hidden');
        }
      }
    } catch (e) {
      console.error('Notificações:', e);
    }
  }

  // Primeira chamada imediata
  fetchNotifications();
  // Poll a cada 30 segundos
  setInterval(fetchNotifications, 30000);

  // Ao clicar no sino, alterna painel de notificações
  if (bell) {
    const panel = document.getElementById('notifPanel');
    bell.addEventListener('click', async () => {
      // Toggle visibility
      const isHidden = panel.classList.contains('hidden');
      if (isHidden) {
        // Carrega lista de notificações
        try {
          const resp = await fetch('notificacoes_ajax.php');
          const data = await resp.json();
          if (data.status === 'ok') {
            const notifs = data.data || [];
            panel.innerHTML = '<div class="notif-header">Notificações</div>' +
              (notifs.length ? '<ul class="notif-list">' + notifs.map(n => `<li class="notif-item"><strong>${n.titulo}</strong><br>${n.mensagem}</li>`).join('') + '</ul>' : '<p class="notif-empty">Nenhuma notificação.</p>');
          } else {
            panel.innerHTML = '<p class="notif-error">Erro ao carregar.</p>';
          }
        } catch (e) {
          console.error('Erro ao buscar notificações', e);
          panel.innerHTML = '<p class="notif-error">Erro ao buscar.</p>';
        }
      }
      panel.classList.toggle('hidden');
      // Limpa badge quando abre
      if (!panel.classList.contains('hidden')) badge.classList.add('hidden');
    });
  }
});
