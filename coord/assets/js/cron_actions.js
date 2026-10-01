// assets/js/cron_actions.js
// Função para acionar o cron de limpeza via AJAX e atualizar o log na página

document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('runCronBtn');
    const logOutput = document.getElementById('logOutput');
    if (!runBtn || !logOutput) return;

    const fetchLog = () => {
        fetch('logs/limpeza.log')
            .then(r => r.text())
            .then(text => {
                const lines = text.trim().split('\n').slice(-5000).join('\n');
                logOutput.textContent = lines;
            })
            .catch(() => { logOutput.textContent = 'Não foi possível ler o log.'; });
    };

    runBtn.addEventListener('click', () => {
        runBtn.disabled = true;
        runBtn.textContent = 'Executando...';
        fetch('limpeza_cron.php')
            .then(r => r.text())
            .then(msg => {
                console.log(msg);
                // Após execução, recarrega o log
                fetchLog();
            })
            .finally(() => {
                runBtn.disabled = false;
                runBtn.textContent = 'Executar Cron Agora';
            });
    });
});
