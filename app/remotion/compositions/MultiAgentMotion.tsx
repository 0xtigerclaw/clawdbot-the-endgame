import React from 'react';
import {
	AbsoluteFill,
	Sequence,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type MultiAgentProps = {
	title?: string;
	subtitle?: string;
	cta?: string;
	url?: string;
};

const COLORS = {
	bg0: '#070A10',
	bg1: '#0B1020',
	fg: '#EAF0FF',
	muted: 'rgba(234,240,255,0.72)',
	muted2: 'rgba(234,240,255,0.52)',
	accent: '#55FF9A',
	accent2: '#6AA6FF',
	dim: 'rgba(255,255,255,0.10)',
	shadow: 'rgba(0,0,0,0.60)',
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const Background: React.FC = () => {
	const frame = useCurrentFrame();
	const driftX = interpolate(frame, [0, 300], [0, -70]);
	const driftY = interpolate(frame, [0, 300], [0, 26]);
	const sweep = interpolate(frame, [0, 300], [-900, 2400]);

	return (
		<AbsoluteFill>
			<AbsoluteFill
				style={{
					background: `radial-gradient(1200px 700px at 18% 40%, rgba(106,166,255,0.16), transparent 60%),
					radial-gradient(900px 600px at 72% 62%, rgba(85,255,154,0.12), transparent 62%),
					linear-gradient(180deg, ${COLORS.bg1}, ${COLORS.bg0})`,
				}}
			/>

			{/* Grid */}
			<AbsoluteFill
				style={{
					transform: `translate(${driftX}px, ${driftY}px)`,
					backgroundImage:
						'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 64px)',
					opacity: 0.20,
					mixBlendMode: 'screen',
				}}
			/>

			{/* Light sweep */}
			<AbsoluteFill
				style={{
					background:
						'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 48%, transparent 62%)',
					transform: `translateX(${sweep}px) skewX(-18deg)`,
					filter: 'blur(10px)',
					opacity: 0.55,
				}}
			/>

			{/* Vignette */}
			<AbsoluteFill
				style={{
					background:
						'radial-gradient(1200px 700px at 50% 45%, transparent 55%, rgba(0,0,0,0.74) 100%)',
				}}
			/>
		</AbsoluteFill>
	);
};

const Header: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const t = clamp01(interpolate(frame, [0, 26], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame, fps, config: { damping: 18, stiffness: 140, mass: 0.9 } });
	const y = interpolate(t, [0, 1], [18, 0]);
	const opacity = interpolate(t, [0, 1], [0, 1]);
	const wipe = interpolate(t, [0, 1], [0, 1]);

	return (
		<AbsoluteFill style={{ paddingLeft: 140, paddingTop: 120 }}>
			<div style={{ opacity, transform: `translateY(${y}px) scale(${0.985 + 0.015 * pop})` }}>
				<div style={{ position: 'relative', display: 'inline-block' }}>
					<div
						style={{
							position: 'absolute',
							inset: 0,
							transform: 'translateY(10px)',
							background: `linear-gradient(90deg, ${COLORS.accent2}, ${COLORS.accent})`,
							filter: 'blur(18px)',
							opacity: 0.55,
							clipPath: `inset(0 ${100 - wipe * 100}% 0 0)`,
						}}
					/>
					<h1
						style={{
							margin: 0,
							color: COLORS.fg,
							fontSize: 86,
							fontWeight: 880,
							letterSpacing: -1.6,
							lineHeight: 1.03,
							textShadow: `0 18px 55px ${COLORS.shadow}`,
						}}
					>
						{title}
					</h1>
				</div>
				<div style={{ height: 14 }} />
				<div style={{ color: COLORS.muted, fontSize: 30, fontWeight: 560, letterSpacing: 0.2 }}>
					{subtitle}
				</div>
			</div>
		</AbsoluteFill>
	);
};

type NodeSpec = {
	id: string;
	x: number;
	y: number;
	label: string;
	role: string;
	accent: 'blue' | 'green';
};

type EdgeSpec = {
	from: string;
	to: string;
};

const NODE_R = 18;

const AgentNode: React.FC<{ spec: NodeSpec; appearAt: number; pulse: number }> = ({
	spec,
	appearAt,
	pulse,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const local = frame - appearAt;

	const on = clamp01(interpolate(local, [0, 18], [0, 1], { extrapolateRight: 'clamp' }));
	const settle = spring({ frame: local, fps, config: { damping: 18, stiffness: 170, mass: 0.8 } });
	const opacity = on;
	const y = interpolate(on, [0, 1], [10, 0]);

	const accent = spec.accent === 'blue' ? COLORS.accent2 : COLORS.accent;
	const pulseGlow = 0.18 + 0.32 * pulse;
	const pulseRing = 0.55 + 0.55 * pulse;

	return (
		<div
			style={{
				position: 'absolute',
				left: spec.x,
				top: spec.y,
				opacity,
				transform: `translateY(${y}px) scale(${0.96 + 0.04 * settle})`,
			}}
		>
			{/* Node */}
			<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
				<div
					style={{
						width: NODE_R * 2,
						height: NODE_R * 2,
						borderRadius: 999,
						border: '1px solid rgba(255,255,255,0.18)',
						background: 'rgba(10, 14, 24, 0.60)',
						boxShadow: `0 0 ${18 + 26 * pulseGlow}px rgba(85,255,154,0.14)`,
						position: 'relative',
					}}
				>
					{/* Inner dot */}
					<div
						style={{
							position: 'absolute',
							left: '50%',
							top: '50%',
							transform: 'translate(-50%, -50%)',
							width: 10,
							height: 10,
							borderRadius: 999,
							background: `linear-gradient(180deg, ${COLORS.accent2}, ${COLORS.accent})`,
							opacity: 0.95,
						}}
					/>

					{/* Pulse ring */}
					<div
						style={{
							position: 'absolute',
							left: '50%',
							top: '50%',
							transform: `translate(-50%, -50%) scale(${1 + 0.9 * pulse})`,
							width: NODE_R * 2,
							height: NODE_R * 2,
							borderRadius: 999,
							border: `1px solid rgba(255,255,255,${0.26 * (1 - pulse)})`,
							opacity: pulseRing,
						}}
					/>
				</div>

				{/* Labels */}
				<div>
					<div
						style={{
							color: COLORS.fg,
							fontSize: 26,
							fontWeight: 820,
							letterSpacing: -0.4,
							textShadow: `0 18px 55px ${COLORS.shadow}`,
						}}
					>
						{spec.label}
					</div>
					<div style={{ color: COLORS.muted2, fontSize: 18, letterSpacing: 1.6, textTransform: 'uppercase' }}>
						{spec.role}
					</div>
					<div style={{ height: 10 }} />
					<div style={{ height: 2, width: 220, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
				</div>
			</div>
		</div>
	);
};

const Graph: React.FC = () => {
	const frame = useCurrentFrame();

	const nodes: NodeSpec[] = [
		{ id: 'director', x: 160, y: 420, label: 'Director', role: 'Planner', accent: 'blue' },
		{ id: 'agentA', x: 620, y: 280, label: 'Agent 01', role: 'Research', accent: 'green' },
		{ id: 'agentB', x: 980, y: 560, label: 'Agent 02', role: 'Build', accent: 'blue' },
		{ id: 'agentC', x: 1320, y: 300, label: 'Agent 03', role: 'Deploy', accent: 'green' },
		{ id: 'observer', x: 1500, y: 650, label: 'Observer', role: 'Telemetry', accent: 'blue' },
	];

	const edges: EdgeSpec[] = [
		{ from: 'director', to: 'agentA' },
		{ from: 'director', to: 'agentB' },
		{ from: 'director', to: 'agentC' },
		{ from: 'agentB', to: 'observer' },
		{ from: 'agentC', to: 'observer' },
	];

	const byId = new Map(nodes.map((n) => [n.id, n]));

	// Two packets traversing the graph at different times.
	const packet1 = clamp01(interpolate(frame, [60, 170], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
	const packet2 = clamp01(interpolate(frame, [150, 255], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

	const nodePulse = (id: string) => {
		const n1 = clamp01(interpolate(frame, [72, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
		const n2 = clamp01(interpolate(frame, [176, 192], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
		const n3 = clamp01(interpolate(frame, [220, 238], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

		if (id === 'director') return 0.35 * n1 + 0.35 * n2;
		if (id === 'agentA') return 0.55 * clamp01(interpolate(frame, [96, 114], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
		if (id === 'agentB') return 0.55 * clamp01(interpolate(frame, [112, 130], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
		if (id === 'agentC') return 0.55 * clamp01(interpolate(frame, [128, 146], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
		if (id === 'observer') return 0.55 * n3;
		return 0;
	};

	const drawPacket = (fromId: string, toId: string, t: number, color: string) => {
		const a = byId.get(fromId)!;
		const b = byId.get(toId)!;

		const ax = a.x + NODE_R;
		const ay = a.y + NODE_R;
		const bx = b.x + NODE_R;
		const by = b.y + NODE_R;

		const x = ax + (bx - ax) * t;
		const y = ay + (by - ay) * t;

		return (
			<div
				key={`${fromId}-${toId}-${color}`}
				style={{
					position: 'absolute',
					left: x - 5,
					top: y - 5,
					width: 10,
					height: 10,
					borderRadius: 999,
					background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), ${color})`,
					boxShadow: `0 0 20px ${color}`,
					opacity: 0.95,
				}}
			/>
		);
	};

	return (
		<AbsoluteFill>
			{/* Edges (SVG for crisp lines) */}
			<svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
				<defs>
					<linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stopColor={COLORS.accent2} stopOpacity={0.55} />
						<stop offset="60%" stopColor={COLORS.accent} stopOpacity={0.55} />
						<stop offset="100%" stopColor={COLORS.accent} stopOpacity={0.0} />
					</linearGradient>
				</defs>
				{edges.map((e) => {
					const a = byId.get(e.from)!;
					const b = byId.get(e.to)!;
					const ax = a.x + NODE_R;
					const ay = a.y + NODE_R;
					const bx = b.x + NODE_R;
					const by = b.y + NODE_R;
					return (
						<line
							key={`${e.from}-${e.to}`}
							x1={ax}
							y1={ay}
							x2={bx}
							y2={by}
							stroke="url(#edgeGrad)"
							strokeWidth={2}
							opacity={0.55}
						/>
					);
				})}
			</svg>

			{/* Packets */}
			{drawPacket('director', 'agentA', packet1, COLORS.accent2)}
			{drawPacket('director', 'agentB', packet1, COLORS.accent)}
			{drawPacket('director', 'agentC', packet1, COLORS.accent2)}
			{drawPacket('agentB', 'observer', packet2, COLORS.accent)}
			{drawPacket('agentC', 'observer', packet2, COLORS.accent2)}

			{/* Nodes */}
			{nodes.map((n, idx) => (
				<AgentNode key={n.id} spec={n} appearAt={54 + idx * 10} pulse={nodePulse(n.id)} />
			))}
		</AbsoluteFill>
	);
};

const BeatLine: React.FC<{ label: string; emphasis: string; from: number }> = ({
	label,
	emphasis,
	from,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const local = frame - from;

	const tIn = clamp01(interpolate(local, [0, 14], [0, 1], { extrapolateRight: 'clamp' }));
	const tOut = clamp01(interpolate(local, [62, 78], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
	const settle = spring({ frame: local, fps, config: { damping: 20, stiffness: 165, mass: 0.82 } });

	const opacity = (1 - tOut) * tIn;
	const y = interpolate(tIn, [0, 1], [10, 0]) + tOut * -10;
	const lineW = interpolate(tIn, [0, 1], [0, 520]);

	return (
		<div style={{ opacity, transform: `translateY(${y}px)` }}>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
				<span
					style={{
						color: COLORS.muted2,
						fontSize: 20,
						letterSpacing: 2.2,
						fontWeight: 720,
						textTransform: 'uppercase',
					}}
				>
					{label}
				</span>
				<span
					style={{
						color: COLORS.fg,
						fontSize: 44,
						fontWeight: 860,
						letterSpacing: -0.9,
						transform: `translateY(${(1 - settle) * 6}px)`,
						textShadow: `0 18px 55px ${COLORS.shadow}`,
					}}
				>
					{emphasis}
				</span>
			</div>
			<div style={{ height: 14 }} />
			<div
				style={{
					height: 2,
					width: lineW,
					background: `linear-gradient(90deg, ${COLORS.accent2}, ${COLORS.accent})`,
					opacity: 0.9,
					borderRadius: 2,
				}}
			/>
		</div>
	);
};

const BeatStack: React.FC = () => {
	return (
		<AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 140 }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
				<BeatLine label="Plan" emphasis="Decompose the goal" from={0} />
				<BeatLine label="Delegate" emphasis="Parallel agents" from={26} />
				<BeatLine label="Execute" emphasis="Tools + code" from={52} />
				<BeatLine label="Verify" emphasis="Observability" from={78} />
			</div>
		</AbsoluteFill>
	);
};

const EndCard: React.FC<{ cta: string; url: string }> = ({ cta, url }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const t = clamp01(interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame, fps, config: { damping: 16, stiffness: 190, mass: 0.9 } });
	const opacity = interpolate(t, [0, 1], [0, 1]);
	const y = interpolate(t, [0, 1], [16, 0]);
	const glow = interpolate(t, [0, 1], [0, 1]);

	return (
		<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
			<div style={{ textAlign: 'center', opacity, transform: `translateY(${y}px) scale(${0.98 + 0.02 * pop})` }}>
				<div
					style={{
						color: COLORS.fg,
						fontSize: 58,
						fontWeight: 900,
						letterSpacing: -1.1,
						textShadow: `0 18px 55px ${COLORS.shadow}`,
					}}
				>
					{cta}
				</div>
				<div style={{ height: 18 }} />
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 10,
						padding: '12px 18px',
						borderRadius: 999,
						border: '1px solid rgba(255,255,255,0.14)',
						background: 'rgba(10, 14, 24, 0.55)',
						backdropFilter: 'blur(10px)',
						boxShadow: `0 0 ${22 + 18 * glow}px rgba(85,255,154,0.18)`,
					}}
				>
					<span
						style={{
							width: 10,
							height: 10,
							borderRadius: 999,
							background: `linear-gradient(180deg, ${COLORS.accent2}, ${COLORS.accent})`,
						}}
					/>
					<span style={{ color: COLORS.muted, fontSize: 22, letterSpacing: 0.2 }}>{url}</span>
				</div>
			</div>
		</AbsoluteFill>
	);
};

export const MultiAgentMotion: React.FC<MultiAgentProps> = ({
	title = 'Multi-Agent System',
	subtitle = 'Orchestrate. Parallelize. Verify.',
	cta = 'Ship with confidence',
	url = 'clawdbot-endgame.yourdomain.com',
}) => {
	return (
		<AbsoluteFill style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
			<Background />

			{/* SCENE 1 — Establishing (0–2s) */}
			<Sequence from={0} durationInFrames={60}>
				<Header title={title} subtitle={subtitle} />
			</Sequence>

			{/* SCENE 2 — Agent graph (2–6s) */}
			<Sequence from={60} durationInFrames={120}>
				<Graph />
			</Sequence>

			{/* SCENE 3 — Beat stack (6–8.5s) */}
			<Sequence from={180} durationInFrames={75}>
				<BeatStack />
			</Sequence>

			{/* SCENE 4 — End card (8.5–10s) */}
			<Sequence from={255} durationInFrames={45}>
				<EndCard cta={cta} url={url} />
			</Sequence>
		</AbsoluteFill>
	);
};
