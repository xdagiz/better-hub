import { AppNavbar } from "@/components/layout/navbar";
import { AppFooterNav } from "@/components/layout/footer-nav";
import { GlobalChatProvider } from "@/components/shared/global-chat-provider";
import { GlobalChatPanel } from "@/components/shared/global-chat-panel";
import { FloatingGhostButton } from "@/components/shared/floating-ghost-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalChatProvider>
      <div className="flex flex-col h-dvh overflow-y-auto lg:overflow-hidden">
        <AppNavbar />
        <div className="mt-10 lg:h-[calc(100dvh-var(--spacing)*10)] flex flex-col px-4 pt-4 lg:overflow-auto">
          {children}
        </div>
        <AppFooterNav />
        <FloatingGhostButton />
        <GlobalChatPanel />
      </div>
    </GlobalChatProvider>
  );
}
