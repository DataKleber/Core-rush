# Core Rush

Jogo de arena 3D no navegador: quatro competidores disputam um núcleo de energia. Grátis, sem cadastro, no PC e no celular.

**Jogar:** https://datakleber.github.io/Core-rush/

Feito com Three.js. Versão 1.2 (prévia): arena de energia, eventos na partida e combate com mais impacto.

## v1.3 — Jogar com amigos (salas por link)
- Menu > JOGAR COM AMIGOS > CRIAR SALA > mandar o link. Até 4 pessoas; vagas vazias ficam com bots.
- O navegador de quem cria a sala roda a partida; os outros enviam comandos e recebem o estado (20x/s).
- Conexão: WebRTC via PeerJS 1.5.4 (MIT, js/vendor). Servidor de encontro gratuito da PeerJS (0.peerjs.com).
- Quem sai no meio vira bot. Se o anfitrião fechar a aba, a partida acaba. Online não tem pausa.
- Arquivos novos: js/rede.js, js/vendor/. Alterados: main.js, fighter.js, core.js, energia.js, index.html.
- Jogo solo continua igual à v1.2.
