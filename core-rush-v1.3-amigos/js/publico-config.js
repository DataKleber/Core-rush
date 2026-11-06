// ===== CONFIGURAÇÃO DA VERSÃO PÚBLICA (editar só aqui) =====
// Nada aqui altera a jogabilidade. Campos vazios = recurso aparece como "em configuração" ou fica oculto.
export const PUBLICO = {
  // nome usado no Compartilhar e no Apoie (o título dentro do jogo continua o atual)
  nomeJogo: 'Core Rush',
  // link da página do jogo no itch.io (ex.: 'https://seunome.itch.io/core-rush') — usado no Compartilhar
  linkJogo: 'https://datakleber.github.io/Core-rush/',
  textoCompartilhar: '', // vazio = texto padrão abaixo
  // ex.: 'Joguei Core Rush, um jogo de arena no navegador (PC e celular, sem cadastro). Bora disputar o núcleo?'

  // Pix (use uma CHAVE ALEATÓRIA do seu banco; nome e cidade como aparecem na conta, sem acento, até 25/15 letras)
  pixChave: '',
  pixNome: '',
  pixCidade: '',

  // Pesquisa pós-partida: para GUARDAR as respostas, cole aqui um Formulário Google (opcional, ver LEIA-PUBLICACAO.txt).
  // Sem formulário, a pesquisa agradece e convida a comentar na página do jogo.
  formulario: {
    url: '',            // ex.: 'https://docs.google.com/forms/d/e/XXXX/formResponse'
    campoJogaria: '',   // ex.: 'entry.123456'
    campoComentario: '',// ex.: 'entry.654321'
    campoResultado: '', // opcional: vitória/derrota e pontos
  },
};
