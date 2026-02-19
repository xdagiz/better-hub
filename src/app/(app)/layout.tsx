import { Suspense } from "react";
import { headers } from "next/headers";
import { AppNavbar } from "@/components/layout/navbar";
import { GlobalChatProvider } from "@/components/shared/global-chat-provider";
import { GlobalChatPanel } from "@/components/shared/global-chat-panel";
import { auth } from "@/lib/auth";
import { getGhostTabState, type GhostTabState } from "@/lib/chat-store";
import { ThemeSync } from "@/components/theme/theme-sync";
import { GitHubLinkInterceptor } from "@/components/shared/github-link-interceptor";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let initialTabState: GhostTabState = {
    tabs: [{ id: "default", label: "Thread 1" }],
    activeTabId: "default",
    counter: 1,
  };

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id) {
      initialTabState = getGhostTabState(session.user.id);
    }
  } catch {}

  return (
    <GlobalChatProvider initialTabState={initialTabState}>
      <ThemeSync />
      <GitHubLinkInterceptor>
        <div className="flex flex-col h-dvh overflow-y-auto lg:overflow-hidden">
          <AppNavbar />
          <div className="mt-10 lg:h-[calc(100dvh-var(--spacing)*10)] flex flex-col px-4 pt-2 lg:overflow-auto">
            {children}
          </div>
          <Suspense>
            <GlobalChatPanel />
          </Suspense>
        </div>
      </GitHubLinkInterceptor>
    </GlobalChatProvider>
  );
}
