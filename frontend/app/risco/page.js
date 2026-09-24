import LegalPage from "@/components/legal/LegalPage";

export const metadata = { title: "Aviso de risco | TradeOn AI" };

export default function Risco() {
  return (
    <LegalPage title="Aviso de risco">
      <p><strong>Operar no mercado financeiro envolve risco elevado e pode resultar na perda total do capital investido.</strong> Só opere com dinheiro que você pode perder.</p>

      <h2>A TradeOn AI não é recomendação de investimento</h2>
      <p>As leituras exibidas são produzidas automaticamente a partir de indicadores técnicos e dados passados. Elas não consideram a sua situação financeira, seus objetivos ou seu perfil de risco e não constituem recomendação, consultoria ou oferta de investimento.</p>

      <h2>Sem garantia de resultado</h2>
      <p>Resultados passados, incluindo o histórico e o simulador de banca, não garantem resultados futuros. Mercados de curto prazo (1 e 5 minutos) são especialmente voláteis, e uma leitura pode estar errada mesmo com confiança "Alta".</p>

      <h2>Dados de mercado</h2>
      <p>Os preços vêm de fornecedores de dados e podem ter atraso ou diferença em relação aos preços da sua corretora.</p>

      <h2>Corretoras</h2>
      <p>A TradeOn AI não é corretora e não indica corretoras. Antes de operar, verifique se a instituição é autorizada pelo regulador do seu país; no Brasil, consulte a CVM e o Banco Central.</p>

      <h2>Gestão de risco</h2>
      <ul>
        <li>Defina um valor fixo por operação e um limite de perda diário.</li>
        <li>Não aumente o valor para recuperar perdas.</li>
        <li>Acompanhe sua taxa de acerto real antes de arriscar valores maiores.</li>
      </ul>
    </LegalPage>
  );
}
