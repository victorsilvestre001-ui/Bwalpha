import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import AoVivo from "@/components/landing/AoVivo";
import Manifesto from "@/components/landing/Manifesto";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import Combinado from "@/components/landing/Combinado";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-ink font-tight text-white">
      <Nav />
      <Hero />
      <AoVivo />
      <Manifesto />
      <Features />
      <HowItWorks />
      <Combinado />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
