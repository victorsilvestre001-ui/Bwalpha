import LegalPage, { CompanyLine } from "@/components/legal/LegalPage";

export const metadata = { title: "Termos de uso | TradeOn AI" };

export default function Termos() {
  return (
    <LegalPage title="Termos de uso">
      <p>Estes termos regulam o uso do site e da plataforma TradeOn AI. Ao criar uma conta, você concorda com eles. <CompanyLine /></p>

      <h2>1. O que é a TradeOn AI</h2>
      <p>A TradeOn AI é uma ferramenta de análise de mercado e educação financeira. Ela combina indicadores técnicos e inteligência artificial para exibir leituras de mercado dos ativos EURUSD, EURJPY e XAUUSD. <strong>A TradeOn AI não é corretora, não executa operações, não custodia dinheiro e não faz recomendação de investimento.</strong></p>

      <h2>2. Sem garantia de resultado</h2>
      <p>As leituras exibidas são estimativas baseadas em dados passados e podem estar erradas. Nenhum resultado é garantido. Toda decisão de operar, e o risco dela, é exclusivamente sua. Leia o <a href="/risco" className="text-neon hover:underline">Aviso de risco</a>.</p>

      <h2>3. Conta</h2>
      <ul>
        <li>Você precisa ter 18 anos ou mais.</li>
        <li>Mantenha seus dados corretos e sua senha em segredo. Você responde pelo uso da sua conta.</li>
        <li>Podemos suspender contas usadas para fraude, abuso, revenda ou cópia automatizada do conteúdo.</li>
      </ul>

      <h2>4. Planos e pagamento</h2>
      <ul>
        <li>O plano Free é gratuito e tem recursos limitados.</li>
        <li>O plano VIP é um pagamento único, processado pela Kiwify, que libera o acesso completo à plataforma. Não há cobrança recorrente.</li>
        <li>O acesso é liberado automaticamente na conta com o mesmo e-mail usado na compra.</li>
        <li>Nas contratações feitas no Brasil, você pode desistir em até 7 dias após a compra e receber o valor de volta (art. 49 do Código de Defesa do Consumidor), pedindo pelo contato abaixo. Com o reembolso, a conta volta para o plano Free.</li>
      </ul>

      <h2>5. Uso permitido</h2>
      <p>O conteúdo da plataforma é para uso pessoal. Não é permitido revender, redistribuir ou publicar as leituras como serviço próprio, nem tentar acessar áreas ou dados de outros usuários.</p>

      <h2>6. Disponibilidade</h2>
      <p>O serviço depende de fornecedores de dados e de infraestrutura e pode ficar indisponível ou com dados atrasados. Não respondemos por perdas decorrentes de indisponibilidade, atraso ou erro nas leituras.</p>

      <h2>7. Alterações</h2>
      <p>Podemos atualizar estes termos. Mudanças relevantes serão avisadas no site. O uso continuado após a atualização significa concordância.</p>

      <h2>8. Contato e foro</h2>
      <p>Dúvidas e pedidos: <CompanyLine /> Estes termos seguem a lei brasileira.</p>
    </LegalPage>
  );
}
