import { RunDetailPageClient } from '@/components/run-detail-page-client';

type PageProps = {
	params: Promise<{ runId: string }>;
};

export default async function RunDetailPage({ params }: PageProps) {
	const { runId } = await params;

	return <RunDetailPageClient runId={runId} />;
}
