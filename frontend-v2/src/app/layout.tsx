import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

/** DESIGN.md: system SF Pro stack in globals; JetBrains Mono substitutes SF Mono until hosted. */
const jetbrainsMono = JetBrains_Mono({
	subsets: ['latin'],
	variable: '--font-mono-technical',
	display: 'swap'
});

export const metadata: Metadata = {
	title: 'Quantum Gates Dashboard',
	description: 'Frontend workspace for the distributed quantum coordinator.'
};

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang='en'
			className={cn('h-full', 'antialiased', jetbrainsMono.variable, 'font-sans')}
		>
			<TooltipProvider>
				<body className='min-h-full flex flex-col'>
					{children}
					<Toaster />
				</body>
			</TooltipProvider>
		</html>
	);
}
