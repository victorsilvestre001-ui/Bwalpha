import Reveal from "@/components/Reveal";
import Stars from "@/components/landing/Stars";

// Frase de impacto com os "+" lilás (visual de referência: "ter +presença, +valor e +autoridade.").
export default function Manifesto() {
  const mais = (t) => <span className="whitespace-nowrap"><span className="text-lilac">+</span>{t}</span>;
  return (
    <section className="relative overflow-hidden py-24 md:py-36">
      <Stars density={0.00006} className="opacity-70" />
      <div className="relative mx-auto max-w-[1400px] px-4 md:px-8">
        <Reveal>
          <p className="soft-italic text-2xl text-white/50 md:text-4xl">A TradeOn existe pra você operar com</p>
          <h2 className="mega mt-4 text-[3rem] text-white sm:text-7xl md:text-[7.5rem]">
            {mais("critério")}, {mais("calma")}<br className="hidden md:block" /> e {mais("histórico")}.
          </h2>
        </Reveal>
      </div>
    </section>
  );
}
