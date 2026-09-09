import {
  Hero,
  LandingNav,
  CoreSection,
  EcosystemSection,
  ModelsSection,
  RoutingSection,
} from '@/components/landing/Sections1';
import {
  AgentsSection,
  TeamsSection,
  SkillsSection,
  MemorySection,
  RagSection,
  ToolsSection,
} from '@/components/landing/Sections2';
import {
  McpSection,
  GithubSection,
  N8nSection,
  IdeSection,
  BrowserSection,
  AutonomousSection,
} from '@/components/landing/Sections3';
import {
  SecuritySection,
  EvaluationSection,
  ObservabilitySection,
  DeploymentSection,
  PuterSection,
  DesktopSection,
  MobileSection,
  MarketplaceSection,
  EnterpriseSection,
  PrivacySection,
  FinalSection,
  Footer,
} from '@/components/landing/Sections4';
import { IntroOverlay } from '@/components/landing/IntroOverlay';

// Animation order: particles → AI core → ecosystem → interfaces → connected system.
export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-clip">
      <div className="grid-floor absolute inset-x-0 top-0 h-[200vh] -z-10" />
      <div className="aurora-layer" />
      <IntroOverlay />
      <LandingNav />
      <Hero />
      <CoreSection />
      <EcosystemSection />
      <ModelsSection />
      <RoutingSection />
      <AgentsSection />
      <TeamsSection />
      <SkillsSection />
      <MemorySection />
      <RagSection />
      <ToolsSection />
      <McpSection />
      <GithubSection />
      <N8nSection />
      <IdeSection />
      <BrowserSection />
      <AutonomousSection />
      <SecuritySection />
      <EvaluationSection />
      <ObservabilitySection />
      <DeploymentSection />
      <PuterSection />
      <DesktopSection />
      <MobileSection />
      <MarketplaceSection />
      <EnterpriseSection />
      <PrivacySection />
      <FinalSection />
      <Footer />
    </main>
  );
}
