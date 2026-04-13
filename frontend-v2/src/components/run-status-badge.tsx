import { Badge } from '@/components/ui/badge';
import type { RunBadgeVariant } from '@/types/runs';

type RunStatusBadgeProps = {
	label: string;
	variant: RunBadgeVariant;
};

export function RunStatusBadge({ label, variant }: RunStatusBadgeProps) {
	return <Badge variant={variant}>{label}</Badge>;
}
