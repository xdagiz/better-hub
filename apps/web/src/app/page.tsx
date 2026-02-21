import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import Image from "next/image";
import { HalftoneBackground } from "@/components/ui/halftone-background";
import { LoginButton } from "@/components/login-button";

export default async function HomePage() {
	const session = await getServerSession();

	if (session) {
		redirect("/dashboard");
	}

	return (
		<div className="min-h-screen bg-background flex">
			<div
				className="hidden lg:flex flex-1 relative overflow-hidden"
				style={{ background: "var(--shader-bg)" }}
			>
				<HalftoneBackground />

				<div className="relative z-10 flex flex-col justify-end p-10 w-full h-full gap-8">
					<div className="absolute top-5 left-10 flex items-center gap-3">
						<span className="text-xl tracking-tight text-foreground">
							BETTER-HUB.
						</span>
					</div>

					<div className="max-w-md">
						<h1 className="text-4xl font-medium tracking-tight text-foreground leading-[1.15]">
							Re-imagining code
							<br />
							collaboration.
						</h1>

						<p className="text-foreground/55 text-sm leading-relaxed mt-4 max-w-sm">
							A better place to collaborate on code — for
							humans and agents
						</p>
					</div>

					<div className="relative w-full max-w-2xl h-72 xl:h-80">
						<div className="absolute inset-0 -rotate-2 -translate-x-6 -translate-y-2 origin-bottom-right">
							<div className="rounded-lg border border-foreground/6 overflow-hidden shadow-xl shadow-black/10 opacity-70">
								<Image
									src="/dash2.webp"
									alt="Repository view"
									width={1508}
									height={852}
									priority
									className="w-full h-auto"
								/>
							</div>
						</div>

						<div className="absolute inset-0 rotate-1 origin-bottom-right z-10">
							<div className="rounded-lg border border-foreground/8 overflow-hidden shadow-2xl shadow-black/20">
								<Image
									src="/dash1.webp"
									alt="Dashboard preview"
									width={1508}
									height={854}
									priority
									className="w-full h-auto"
								/>
							</div>
						</div>

						<div
							className="absolute inset-x-0 -bottom-10 h-1/3 pointer-events-none z-20"
							style={{
								background: "linear-gradient(to top, var(--shader-bg) 0%, transparent 100%)",
							}}
						/>
					</div>
				</div>
			</div>

			<div
				className="flex-1 flex items-center justify-center p-8 lg:max-w-xl"
				style={{ borderLeft: "1px solid var(--hero-border)" }}
			>
				<div className="w-full max-w-sm">
					<div className="lg:hidden mb-12">
						<Image
							src="/logo.svg"
							alt="Better Hub"
							width={28}
							height={28}
							className="rounded-md dark:invert"
						/>
					</div>

					<div className="mb-5">
						<h2 className="text-lg font-medium tracking-tight text-foreground lg:text-xl">
							Sign in to continue
						</h2>
						<p className="text-foreground/55 text-sm mt-1">
							Connect your GitHub account to get started.
						</p>
					</div>

					<LoginButton />

					<p className="text-[11px] text-foreground/50 mt-2">
						We&apos;ll request access to read and write to your
						repositories and other resources. Your access token
						is encrypted and stored securely.
					</p>
				</div>
			</div>
		</div>
	);
}
