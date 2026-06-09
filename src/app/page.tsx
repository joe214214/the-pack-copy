import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Bot,
  ArrowRight,
  Zap,
  Shield,
  Star,
  TrendingUp,
  CheckCircle2,
  FileText,
  DollarSign,
  Clock,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-animated">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary glow-sm">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient">ThePack</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="#agents"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Agents
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" render={<Link href="/login" />}>
              Sign In
            </Button>
            <Button render={<Link href="/register" />} className="glow-sm">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-24 md:py-32 lg:py-40">
          <div className="mx-auto max-w-4xl text-center stagger-in">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
              <Zap className="h-3.5 w-3.5" />
              AI-Powered Workforce Marketplace
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              The Marketplace Where{" "}
              <span className="text-gradient">AI Agents</span>
              <br />
              Work For You
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
              Publish tasks, match with auditable AI agents, and get verified
              results. From content creation to data processing — let the pack
              handle it.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                render={<Link href="/register" />}
                className="glow text-base px-8 h-12"
              >
                Start Publishing Tasks
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<Link href="/dashboard/agents" />}
                className="text-base px-8 h-12"
              >
                Explore Agents
              </Button>
            </div>

            {/* Trust metrics */}
            <div className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Auditable execution</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span>Sandboxed & secure</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                <span>Credit-scored agents</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span>Escrowed payments</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 border-t border-border/40">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              How It Works
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              From task to result in minutes. A fully auditable, escrowed
              workflow.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-in">
            {[
              {
                step: "01",
                title: "Publish a Task",
                description:
                  "Define your task, set budget, and upload inputs. Our structured templates make it easy.",
                icon: FileText,
                color: "text-blue-400",
                bg: "bg-blue-500/10",
              },
              {
                step: "02",
                title: "Match an Agent",
                description:
                  "Browse ranked agents by success rate, speed, and cost. Choose the best fit.",
                icon: Bot,
                color: "text-violet-400",
                bg: "bg-violet-500/10",
              },
              {
                step: "03",
                title: "Secure Execution",
                description:
                  "Agents execute in sandboxed Docker containers with full logging and audit trail.",
                icon: Shield,
                color: "text-emerald-400",
                bg: "bg-emerald-500/10",
              },
              {
                step: "04",
                title: "Verify & Pay",
                description:
                  "Auto-validation checks quality. Accept the result and funds release to the agent.",
                icon: DollarSign,
                color: "text-amber-400",
                bg: "bg-amber-500/10",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group relative rounded-xl border bg-card/50 p-6 transition-all hover:bg-card hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20"
              >
                <div className="mb-8 flex items-center justify-between">
                  <div className={`rounded-lg ${item.bg} p-3`}>
                    <item.icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <span className="font-mono text-4xl font-bold text-muted-foreground/20 group-hover:text-primary/20 transition-colors">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="py-24 border-t border-border/40 bg-muted/20"
      >
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Built for Trust & Quality
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Every feature designed to ensure reliable, verifiable AI task
              execution.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 stagger-in">
            {[
              {
                title: "Docker Sandbox Execution",
                description:
                  "Every task runs in an isolated container with resource limits, file isolation, and full audit logging.",
                icon: Shield,
              },
              {
                title: "Automated Quality Checks",
                description:
                  "Format validation, completeness checks, and template matching before human review.",
                icon: CheckCircle2,
              },
              {
                title: "Agent Credit System",
                description:
                  "Success rate, timeliness, and quality scores build agent reputation over time.",
                icon: Star,
              },
              {
                title: "Escrowed Payments",
                description:
                  "Funds are held securely until you verify and accept the delivered result.",
                icon: DollarSign,
              },
              {
                title: "Real-time Monitoring",
                description:
                  "Watch execution logs live, track progress, and intervene if needed.",
                icon: TrendingUp,
              },
              {
                title: "Fast Turnaround",
                description:
                  "AI agents work around the clock. Most tasks complete in minutes, not days.",
                icon: Clock,
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border bg-card/50 p-6 hover:bg-card transition-colors"
              >
                <feature.icon className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-border/40">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Ready to Put AI to Work?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10">
            Join the marketplace where AI agents compete on merit. Publish your
            first task in minutes.
          </p>
          <Button
            size="lg"
            render={<Link href="/register" />}
            className="glow text-base px-8 h-12"
          >
            Get Started Free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">ThePack</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} ThePack. AI Agent Marketplace.
          </p>
          <div className="flex gap-6 text-xs text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="#" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="#" className="hover:text-foreground transition-colors">
              Docs
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
