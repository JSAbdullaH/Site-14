import { Hero } from "./sections/Hero";
import { Why } from "./sections/Why";
import { How } from "./sections/How";
import { Features } from "./sections/Features";
import { Devices } from "./sections/Devices";
import { Faq } from "./sections/Faq";
import { Cta } from "./sections/Cta";
import { Footer } from "./sections/Footer";
import "./landing.css";

export default function Landing() {
  return (
    <div className="landing font-sans text-(--l-fg) bg-(--l-bg) min-h-screen">
      <Hero />
      <Why />
      <How />
      <Features />
      <Devices />
      <Faq />
      <Cta />
      <Footer />
    </div>
  );
}
