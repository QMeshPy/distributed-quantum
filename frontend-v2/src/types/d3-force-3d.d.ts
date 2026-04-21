declare module 'd3-force-3d' {
	export type ForceCollideInstance<NodeDatum> = {
		(alpha: number): void;
		iterations(value: number): ForceCollideInstance<NodeDatum>;
		radius(value: number | ((node: NodeDatum) => number)): ForceCollideInstance<NodeDatum>;
		strength(value: number): ForceCollideInstance<NodeDatum>;
	};

	export function forceCollide<NodeDatum = unknown>(
		radius?: number | ((node: NodeDatum) => number)
	): ForceCollideInstance<NodeDatum>;
}
