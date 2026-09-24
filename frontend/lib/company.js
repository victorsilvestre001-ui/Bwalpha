// Dados públicos da empresa. Preenchidos por variáveis de ambiente na Vercel
// (NEXT_PUBLIC_COMPANY_NAME, NEXT_PUBLIC_COMPANY_DOC, NEXT_PUBLIC_CONTACT_EMAIL).
// Campos vazios simplesmente não aparecem nas páginas.
export const COMPANY = {
  brand: "TradeOn AI",
  name: process.env.NEXT_PUBLIC_COMPANY_NAME || "",
  document: process.env.NEXT_PUBLIC_COMPANY_DOC || "",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
  updatedAt: "24 de setembro de 2026"
};
