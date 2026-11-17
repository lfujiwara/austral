const content = {
  estoque: {
    title: 'Cuidado em cada leitura.',
    copy: 'Temperatura e consumo acompanhados para cuidar dos seus produtos e orientar a próxima ação.',
  },
  energia: {
    title: 'Energia bem acompanhada.',
    copy: 'Conheça o consumo dos seus equipamentos e encontre oportunidades para usar energia com mais eficiência.',
  },
  manutencao: {
    title: 'O técnico já chega por dentro.',
    copy: 'Solicite manutenção com gráficos, modelo do equipamento e histórico de reparos, na mesma conversa.',
  },
};

const title = document.querySelector('#response-title');
const copy = document.querySelector('#response-copy');
const topics = document.querySelectorAll('[data-topic]');

topics.forEach((button) => {
  button.addEventListener('click', () => {
    const selected = content[button.dataset.topic];
    title.textContent = selected.title;
    copy.textContent = selected.copy;
    topics.forEach((topic) => {
      const active = topic === button;
      topic.classList.toggle('active', active);
      topic.setAttribute('aria-pressed', String(active));
    });
  });
});
