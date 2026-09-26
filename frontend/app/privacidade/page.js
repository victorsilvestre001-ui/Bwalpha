import LegalPage, { CompanyLine } from "@/components/legal/LegalPage";

export const metadata = { title: "Política de privacidade | TradeOn AI" };

export default function Privacidade() {
  return (
    <LegalPage title="Política de privacidade">
      <p>Esta política explica quais dados pessoais a TradeOn AI coleta, por que e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). <CompanyLine /></p>

      <h2>Dados que coletamos</h2>
      <ul>
        <li><strong>Cadastro:</strong> nome, e-mail e senha (guardada de forma criptografada).</li>
        <li><strong>Perfil (opcional):</strong> CPF e foto.</li>
        <li><strong>Uso da plataforma:</strong> análises geradas e seus resultados, mensagens enviadas ao assistente de IA.</li>
        <li><strong>Pagamento:</strong> o pagamento é processado pela Kiwify. Não recebemos nem guardamos dados do seu cartão; guardamos apenas o e-mail da compra e o status do pedido.</li>
        <li><strong>Navegação:</strong> dados técnicos (navegador, IP) e, somente se você aceitar, cookies de marketing.</li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li>Criar e manter sua conta e liberar os recursos do seu plano (execução de contrato).</li>
        <li>Processar a compra do VIP (execução de contrato).</li>
        <li>Mostrar seu histórico de análises e responder ao assistente de IA (execução de contrato).</li>
        <li>Enviar e-mails sobre a sua conta (execução de contrato).</li>
        <li>Medir o resultado dos nossos anúncios, apenas com o seu consentimento.</li>
        <li>Segurança e prevenção de fraude (legítimo interesse).</li>
      </ul>

      <h2>Com quem compartilhamos</h2>
      <p>Não vendemos seus dados. Compartilhamos apenas com fornecedores necessários para o serviço funcionar:</p>
      <ul>
        <li><strong>Vercel</strong> e <strong>Railway</strong>: hospedagem do site, do servidor e do banco de dados.</li>
        <li><strong>Kiwify</strong>: pagamentos.</li>
        <li><strong>Anthropic</strong>: processamento das mensagens enviadas ao assistente de IA.</li>
        <li><strong>Resend</strong>: envio de e-mails.</li>
        <li><strong>Meta</strong> e <strong>Google</strong>: medição de anúncios, somente se você aceitar os cookies de marketing.</li>
      </ul>
      <p>Alguns desses fornecedores ficam fora do Brasil (principalmente nos Estados Unidos). A transferência internacional é feita para executar o serviço que você contratou, com fornecedores que adotam medidas de proteção de dados.</p>

      <h2>Cookies</h2>
      <p>Usamos armazenamento essencial do navegador para manter você logado e lembrar suas preferências. Cookies de marketing (Meta Pixel e Google Ads) só são ativados se você clicar em "Aceitar todos" no aviso de cookies. Para mudar sua escolha, limpe os dados do site no navegador e escolha de novo.</p>

      <h2>Por quanto tempo guardamos</h2>
      <p>Enquanto sua conta existir. Se você pedir a exclusão, apagamos os dados em até 30 dias, exceto o que a lei nos obrigue a manter (por exemplo, registros de pagamento).</p>

      <h2>Seus direitos</h2>
      <p>Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade ou exclusão dos seus dados, informações sobre compartilhamento e revogar o consentimento (art. 18 da LGPD). Para isso, fale conosco: <CompanyLine /></p>

      <h2>Segurança</h2>
      <p>Usamos conexão criptografada (HTTPS), senhas com hash e acesso restrito ao banco de dados. Nenhum sistema é 100% seguro; se houver um incidente relevante, avisaremos os afetados e a ANPD conforme a lei.</p>
    </LegalPage>
  );
}
