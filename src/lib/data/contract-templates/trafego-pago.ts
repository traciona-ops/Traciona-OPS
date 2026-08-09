import {
  numeroPorExtenso,
  valorPorExtenso,
  dataPorExtenso,
  mesAno,
  moedaBR,
} from "@/lib/utils/extenso";

// Modelo oficial da Traciona: Contrato de Gestão de Tráfego Pago
// (importado do Traciona_Modelo_Contrato_Trafego_Pago.docx do Adriano).
// Linhas "[[ASSINATURA]]Nome|Papel" viram bloco de assinatura no PDF.

export type TrafegoPagoInput = {
  /** PF: nome da pessoa · PJ: razão social da empresa */
  contratanteNome: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  rg: string;
  /** PF: CPF do contratante · PJ: CPF de quem assina pela empresa */
  cpf: string;
  endereco: string;
  telefone: string;
  email: string;
  empresa: string;
  prazoMeses: number;
  dataInicio: Date;
  valorMensal: number;
  diaVencimento: number;
  comarca: string;
  /** pessoa física (padrão) ou jurídica */
  tipo?: "pf" | "pj";
  cnpj?: string;
  /** PJ: nome de quem assina pela empresa */
  representante?: string;
};

const EMAIL_CONTRATADO = "adrianottksa@gmail.com";

export const TRAFEGO_PAGO_LABEL = "Contrato de Gestão de Tráfego Pago";

export function renderTrafegoPago(i: TrafegoPagoInput): string {
  const fim = new Date(i.dataInicio);
  fim.setMonth(fim.getMonth() + i.prazoMeses);
  fim.setDate(fim.getDate() - 1);

  const empresaTrecho = i.empresa.trim()
    ? `, na qualidade de titular/representante da empresa ${i.empresa.trim()}`
    : "";

  // Qualificação por tipo: PJ = empresa no CNPJ representada por quem assina;
  // PF = pessoa no CPF. Só entra o que existir (nome+documento+endereço+e-mail
  // são o essencial; o resto é opcional).
  const qualificacao =
    i.tipo === "pj"
      ? [
          i.contratanteNome,
          "pessoa jurídica de direito privado",
          i.cnpj?.trim() ? `inscrita no CNPJ sob nº ${i.cnpj.trim()}` : "",
          `com sede na ${i.endereco}`,
          i.representante?.trim()
            ? `neste ato representada por ${i.representante.trim()}`
            : "",
          i.cpf.trim() ? `inscrito(a) no CPF sob nº ${i.cpf.trim()}` : "",
          i.telefone.trim() ? `telefone ${i.telefone.trim()}` : "",
          `e-mail ${i.email}`,
        ]
          .filter(Boolean)
          .join(", ")
      : [
          i.contratanteNome,
          i.nacionalidade.trim(),
          i.estadoCivil.trim(),
          i.profissao.trim(),
          i.rg.trim()
            ? `portador(a) da cédula de identidade nº ${i.rg.trim()}`
            : "",
          `inscrito(a) no CPF sob nº ${i.cpf}`,
          `residente e domiciliado(a) na ${i.endereco}`,
          i.telefone.trim() ? `telefone ${i.telefone.trim()}` : "",
          `e-mail ${i.email}`,
        ]
          .filter(Boolean)
          .join(", ");

  return `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GESTÃO DE TRÁFEGO PAGO
Entre:
CONTRATADO: Adriano Alves Ribeiro, brasileiro, solteiro, gestor de tráfego pago, portador da cédula de identidade nº 7.640.252, inscrito no CPF sob nº 083.944.961-56, residente e domiciliado na Rua 03, Qd 03, Lt 06, Bairro Jardim Vila Rica, Acreúna – Goiás, CEP 75960-000, e-mail ${EMAIL_CONTRATADO}.
CONTRATANTE: ${qualificacao}${empresaTrecho}.
As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços de Gestão de Tráfego Pago, que se regerá pelas cláusulas seguintes e pelas condições descritas neste instrumento.

1. OBJETO DO CONTRATO
1.1 O presente contrato tem como objeto a prestação, pelo CONTRATADO, dos seguintes serviços:
a) Gestão de tráfego pago em plataformas de mídia digital; b) Criação, configuração e otimização de campanhas de anúncios; c) Monitoramento de métricas e desempenho das campanhas; d) Ajustes estratégicos com base na análise de dados.

2. PRAZO
2.1 O prazo de vigência do presente contrato é de ${i.prazoMeses} (${numeroPorExtenso(i.prazoMeses)}) ${i.prazoMeses === 1 ? "mês" : "meses"}, iniciando-se na data de sua assinatura, em ${dataPorExtenso(i.dataInicio)}, encerrando-se em ${dataPorExtenso(fim)}.
2.2 Ao término do prazo de vigência, o contrato poderá ser renovado mediante acordo entre as partes, formalizado por escrito.

3. VALOR E FORMA DE PAGAMENTO
3.1 Pelos serviços prestados, o CONTRATANTE pagará ao CONTRATADO o valor mensal de ${moedaBR(i.valorMensal)} (${valorPorExtenso(i.valorMensal)}).
3.2 O primeiro pagamento deverá ser efetuado no mês de ${mesAno(i.dataInicio)}.
3.3 Fica estabelecido o dia ${i.diaVencimento} (${numeroPorExtenso(i.diaVencimento)}) como data base para pagamento das mensalidades subsequentes.
3.4 O pagamento deverá ser realizado por transferência bancária, depósito ou PIX, em conta de titularidade do CONTRATADO.
3.5 Os valores destinados a investimento em anúncios não estão inclusos neste contrato e deverão ser pagos diretamente pelo CONTRATANTE às plataformas de mídia paga.
3.6 Em caso de atraso no pagamento, incidirá multa de 2% (dois por cento) sobre o valor devido, acrescida de juros de mora de 1% (um por cento) ao mês, sem prejuízo da suspensão dos serviços enquanto perdurar a inadimplência.

4. REAJUSTE
4.1 Caso a vigência seja prorrogada ou renovada por período que, somado, ultrapasse 12 (doze) meses, o valor mensal será reajustado pela variação acumulada do IPCA/IBGE no período, ou, na sua falta, por outro índice oficial que venha a substituí-lo.

5. OBRIGAÇÕES DO CONTRATADO
5.1 Realizar a gestão de tráfego pago conforme as estratégias alinhadas com o CONTRATANTE.
5.2 Configurar, monitorar e otimizar campanhas durante a vigência do contrato.
5.3 Manter o CONTRATANTE informado sobre o andamento e o desempenho dos serviços.
5.4 Respeitar as diretrizes das plataformas de anúncios e a legislação vigente.

6. OBRIGAÇÕES DO CONTRATANTE
6.1 Fornecer ao CONTRATADO todas as informações necessárias para a execução dos serviços.
6.2 Efetuar o pagamento conforme estabelecido na cláusula 3.
6.3 Arcar integralmente com os custos de veiculação dos anúncios.
6.4 Garantir acesso às contas de anúncios e ativos digitais necessários à execução do serviço.

7. ACESSO E PROPRIEDADE DAS CONTAS E ATIVOS
7.1 As contas de anúncio, Business Managers, perfis, pixels, públicos e demais ativos digitais utilizados são de titularidade exclusiva do CONTRATANTE.
7.2 Durante a vigência, o CONTRATANTE concederá ao CONTRATADO os acessos necessários à execução dos serviços, permanecendo responsável pela gestão de tais acessos.
7.3 Encerrado o contrato, por qualquer motivo, o CONTRATADO devolverá ou transferirá os acessos ao CONTRATANTE e não reterá ativos, dados ou campanhas que pertençam ao CONTRATANTE.

8. PROTEÇÃO DE DADOS (LGPD)
8.1 No tratamento de dados pessoais eventualmente coletados na execução dos serviços, as partes observarão a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados – LGPD).
8.2 O CONTRATADO tratará os dados pessoais exclusivamente para as finalidades deste contrato, adotará medidas de segurança adequadas e não os compartilhará com terceiros sem autorização, salvo por obrigação legal.
8.3 Encerrado o contrato, os dados pessoais sob responsabilidade do CONTRATADO serão eliminados ou devolvidos ao CONTRATANTE, conforme instrução deste, ressalvadas as hipóteses de guarda obrigatória previstas em lei.

9. CONFIDENCIALIDADE
9.1 As partes comprometem-se a manter sigilo absoluto sobre todas as informações, dados e estratégias a que tiverem acesso em razão deste contrato.
9.2 A obrigação de confidencialidade permanecerá em vigor mesmo após o término deste contrato.

10. RESCISÃO
10.1 Este contrato poderá ser rescindido por qualquer das partes, imotivadamente, mediante comunicação por escrito com antecedência mínima de 30 (trinta) dias.
10.2 Na rescisão antecipada imotivada, os serviços serão prestados e remunerados proporcionalmente até a data efetiva do encerramento, não sendo devida multa rescisória por qualquer das partes.
10.3 O contrato poderá ser rescindido de pleno direito, independentemente de aviso prévio, em caso de descumprimento de qualquer cláusula não sanado no prazo de 10 (dez) dias após notificação, ou em caso de insolvência, falência ou recuperação judicial de qualquer das partes.
10.4 A rescisão não exime as partes das obrigações vencidas até a data do encerramento, especialmente o pagamento dos serviços já prestados.

11. DISPOSIÇÕES GERAIS
11.1 O presente contrato não estabelece qualquer vínculo empregatício entre as partes.
11.2 Qualquer modificação deste contrato somente terá validade se realizada por escrito e assinada por ambas as partes.
11.3 O CONTRATADO não garante resultados específicos, uma vez que o desempenho das campanhas depende de fatores externos, inclusive de decisões e políticas das próprias plataformas de anúncio.
11.4 A tolerância de qualquer das partes quanto ao descumprimento de obrigação não implica novação nem renúncia de direitos.
11.5 As comunicações entre as partes poderão ser realizadas por e-mail ou por aplicativo de mensagens, nos contatos informados no preâmbulo deste instrumento.

12. FORO
12.1 Para dirimir quaisquer controvérsias oriundas do presente contrato, as partes elegem o foro da comarca de ${i.comarca}, renunciando a qualquer outro, por mais privilegiado que seja.

ASSINATURAS
Por estarem assim justos e contratados, firmam o presente instrumento em duas vias de igual teor.
${i.comarca}, ${dataPorExtenso(new Date(Date.now() - 3 * 3600_000))}.

[[ASSINATURA]]${
    i.tipo === "pj" && i.representante?.trim()
      ? `${i.contratanteNome}|CONTRATANTE — por ${i.representante.trim()}`
      : `${i.contratanteNome}|CONTRATANTE`
  }
[[ASSINATURA]]Adriano Alves Ribeiro|CONTRATADO`;
}
