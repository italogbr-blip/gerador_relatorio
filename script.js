
        function toggleMobileMenu() {
            const menu = document.getElementById('mobile-menu');
            menu.classList.toggle('hidden');
        }

        function limparRascunho() {
            if(confirm("Apagar rascunho?")) { localStorage.clear(); location.reload(); }
        }
    
