import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { generateThemeScript } from "@/lib/theme-script";
import { listThemes } from "@/lib/themes";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-code",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Better Hub",
	description: "Re-imagining code collaboration for humans and agents.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: generateThemeScript(listThemes()),
					}}
				/>
			</head>
			<body
				className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} antialiased`}
				suppressHydrationWarning
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableColorScheme={false}
				>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
