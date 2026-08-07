// Árvore de perguntas do Onboarding (OPS Forms) da agência.
// Client-safe: usada pelo wizard público (/o) e pelo viewer interno.
// A árvore é DINÂMICA: showIf decide a pergunta pela resposta anterior
// (ex.: negócio local → pede regiões/bairros das campanhas).

export type ObAnswers = Record<string, string>;

export type ObQuestion = {
  key: string;
  title: string;
  hint?: string;
  type: "text" | "textarea" | "choice" | "upload";
  optional?: boolean;
  placeholder?: string;
  options?: { value: string; label: string; desc?: string }[];
  showIf?: (a: ObAnswers) => boolean;
};

export const OB_QUESTIONS: ObQuestion[] = [
  {
    key: "empresa",
    title: "Qual é o nome da empresa?",
    type: "text",
    placeholder: "Ex.: Marx Solar",
  },
  {
    key: "instagram",
    title: "Qual o @ do Instagram?",
    hint: "Se ainda não tiver, pode pular.",
    type: "text",
    optional: true,
    placeholder: "@suaempresa",
  },
  {
    key: "segmento",
    title: "Qual o segmento do negócio?",
    type: "text",
    placeholder: "Ex.: energia solar, estética, imobiliária...",
  },
  {
    key: "alcance",
    title: "Onde estão os seus clientes?",
    hint: "Isso muda como montamos as campanhas.",
    type: "choice",
    options: [
      {
        value: "local",
        label: "Na minha região",
        desc: "Negócio local: bairro, cidade ou redondezas",
      },
      {
        value: "online",
        label: "No Brasil todo",
        desc: "Vendo/atendo online, sem limite de região",
      },
      { value: "ambos", label: "Os dois", desc: "Local e online" },
    ],
  },
  {
    key: "regiao",
    title: "Quais regiões as campanhas devem alcançar?",
    hint: "Cidades, bairros ou CEPs — quanto mais exato, melhor a segmentação.",
    type: "textarea",
    placeholder: "Ex.: Goiânia (Setor Bueno, Marista), Aparecida de Goiânia...",
    showIf: (a) => a.alcance === "local" || a.alcance === "ambos",
  },
  {
    key: "objetivo",
    title: "Qual o principal objetivo com a gente?",
    type: "choice",
    options: [
      { value: "leads", label: "Gerar leads", desc: "Contatos interessados chegando todo dia" },
      { value: "vendas", label: "Vender mais", desc: "Conversão direta em vendas" },
      { value: "agendamentos", label: "Lotar a agenda", desc: "Agendamentos e atendimentos" },
      { value: "marca", label: "Fortalecer a marca", desc: "Autoridade e reconhecimento" },
    ],
  },
  {
    key: "publico",
    title: "Quem é o seu cliente ideal?",
    hint: "Idade, o que faz, o que procura, o que dói.",
    type: "textarea",
    placeholder: "Ex.: donos de casa 30-55 anos querendo reduzir conta de luz...",
  },
  {
    key: "diferenciais",
    title: "O que faz vocês serem diferentes dos concorrentes?",
    type: "textarea",
    placeholder: "Preço? Prazo? Qualidade? Atendimento? Garantia?",
  },
  {
    key: "verba",
    title: "Quanto pretende investir em anúncios por mês?",
    hint: "Verba de mídia (vai pro Meta/Google), fora o nosso serviço.",
    type: "choice",
    options: [
      { value: "ate_1k", label: "Até R$ 1.000" },
      { value: "1k_3k", label: "R$ 1.000 a R$ 3.000" },
      { value: "3k_10k", label: "R$ 3.000 a R$ 10.000" },
      { value: "10k_mais", label: "Acima de R$ 10.000" },
    ],
  },
  {
    key: "concorrentes",
    title: "Quais concorrentes você admira (ou quer superar)?",
    hint: "Nome ou @ deles. Pode pular se não souber.",
    type: "textarea",
    optional: true,
    placeholder: "Ex.: @concorrente1, Empresa X...",
  },
  {
    key: "tom",
    title: "Qual o tom de voz da marca?",
    type: "choice",
    options: [
      { value: "descontraido", label: "Descontraído", desc: "Leve, próximo, com humor" },
      { value: "profissional", label: "Profissional", desc: "Sério e confiável" },
      { value: "premium", label: "Premium", desc: "Sofisticado, exclusivo" },
      { value: "popular", label: "Popular", desc: "Direto, acessível, sem rodeio" },
    ],
  },
  {
    key: "assets",
    title: "Manda os materiais da marca",
    hint: "Logo, manual da marca, fotos de produtos/serviços. Pode enviar vários.",
    type: "upload",
    optional: true,
  },
  {
    key: "obs",
    title: "Algo mais que a gente precisa saber?",
    type: "textarea",
    optional: true,
    placeholder: "Promoções, sazonalidade, restrições, o que quiser...",
  },
];

/** Perguntas visíveis pra este conjunto de respostas (árvore dinâmica). */
export function visibleQuestions(a: ObAnswers): ObQuestion[] {
  return OB_QUESTIONS.filter((q) => !q.showIf || q.showIf(a));
}

/** Rótulo humano de uma resposta de múltipla escolha (pro viewer interno). */
export function obAnswerLabel(key: string, value: string): string {
  const q = OB_QUESTIONS.find((x) => x.key === key);
  return q?.options?.find((o) => o.value === value)?.label ?? value;
}
