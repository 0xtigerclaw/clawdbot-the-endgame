import React from 'react';
import {
	AbsoluteFill,
	Sequence,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type DemoProps = {
	title: string;
	subtitle: string;
	url?: string;
};

const COLORS = {
	bg: '#0B0F17',
	fg: '#EAF0FF',
	muted: 'rgba(234, 240, 255, 0.72)',
	muted2: 'rgba(234, 240, 255, 0.55)',
	accent: '#55FF9A',
	accent2: '#6AA6FF',
	shadow: 'rgba(0,0,0,0.55)',
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const Background: React.FC = () => {
	const frame = useCurrentFrame();

	const driftX = interpolate(frame, [0, 300], [0, -62]);
	const driftY = interpolate(frame, [0, 300], [0, 24]);
	const sweep = interpolate(frame, [0, 300], [-900, 2400]);
	const vignette = interpolate(frame, [0, 25], [0.85, 1], { extrapolateRight: 'clamp' });

	return (
		<AbsoluteFill>
			<AbsoluteFill
				style={{
					background: `radial-gradient(1200px 700px at 18% 40%, rgba(106,166,255,0.16), transparent 60%),
					radial-gradient(900px 600px at 70% 60%, rgba(85,255,154,0.12), transparent 62%),
					linear-gradient(180deg, ${COLORS.bg}, #070A10)`,
				}}
			/>

			<AbsoluteFill
				style={{
					transform: `translate(${driftX}px, ${driftY}px)`,
					backgroundImage:
						'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 64px)',
					opacity: 0.22,
					mixBlendMode: 'screen',
				}}
			/>

			<AbsoluteFill
				style={{
					background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 48%, transparent 62%)`,
					transform: `translateX(${sweep}px) skewX(-18deg)`,
					filter: 'blur(10px)',
					opacity: 0.55,
				}}
			/>

			<AbsoluteFill
				style={{
					background:
						'radial-gradient(1200px 700px at 50% 45%, transparent 55%, rgba(0,0,0,0.72) 100%)',
					opacity: vignette,
				}}
			/>
		</AbsoluteFill>
	);
};

const TitleCard: React.FC<DemoProps> = ({ title, subtitle }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const t = clamp01(interpolate(frame, [0, 28], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame, fps, config: { damping: 18, mass: 0.95, stiffness: 135 } });

	const y = interpolate(t, [0, 1], [20, 0]);
	const opacity = interpolate(t, [0, 1], [0, 1]);
	const underlineW = interpolate(t, [0, 1], [0, 760]);
	const wipe = interpolate(t, [0, 1], [0, 1]);

	return (
		<AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 160 }}>
			<div style={{ transform: `translateY(${y}px) scale(${0.985 + 0.015 * pop})`, opacity }}>
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
							fontSize: 96,
							fontWeight: 850,
							letterSpacing: -1.8,
							lineHeight: 1.02,
							textShadow: `0 18px 55px ${COLORS.shadow}`,
						}}
					>
						{title}
					</h1>
				</div>

				<div style={{ height: 16 }} />
				<p style={{ margin: 0, color: COLORS.muted, fontSize: 34, fontWeight: 540 }}>
					{subtitle}
				</p>

				<div style={{ height: 26 }} />
				<div
					style={{
						height: 2,
						width: underlineW,
						background: `linear-gradient(90deg, ${COLORS.accent2}, ${COLORS.accent})`,
						opacity: 0.9,
						borderRadius: 2,
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};

const Beat: React.FC<{ label: string; emphasis: string; start: number }> = ({
	label,
	emphasis,
	start,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const local = frame - start;

	const inT = clamp01(interpolate(local, [0, 14], [0, 1], { extrapolateRight: 'clamp' }));
	const outT = clamp01(
		interpolate(local, [62, 78], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
	);
	const appear = spring({
		frame: local,
		fps,
		config: { damping: 20, stiffness: 160, mass: 0.8 },
	});

	const opacity = (1 - outT) * interpolate(inT, [0, 1], [0, 1]);
	const y = interpolate(inT, [0, 1], [14, 0]) + outT * -10;
	const lineW = interpolate(inT, [0, 1], [0, 560]);

	return (
		<div style={{ opacity, transform: `translateY(${y}px)` }}>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
				<span
					style={{
						color: COLORS.muted,
						fontSize: 22,
						letterSpacing: 2.2,
						fontWeight: 650,
						textTransform: 'uppercase',
					}}
				>
					{label}
				</span>
				<span
					style={{
						color: COLORS.fg,
						fontSize: 46,
						fontWeight: 820,
						letterSpacing: -0.9,
						transform: `translateY(${(1 - appear) * 6}px)`,
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
					opacity: 0.85,
					borderRadius: 2,
				}}
			/>
		</div>
	);
};

const FeatureStack: React.FC = () => {
	return (
		<AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 160 }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 46 }}>
				<Beat label="Deploy" emphasis="Agents" start={0} />
				<Beat label="Orchestrate" emphasis="Workflows" start={32} />
				<Beat label="Observe" emphasis="Everything" start={64} />
				<Beat label="Ship" emphasis="Faster" start={96} />
			</div>
		</AbsoluteFill>
	);
};

const Panel: React.FC<{ title: string; lines: string[]; x: number; y: number; w: number; h: number; tint: 'blue' | 'green' }> = ({
	title,
	lines,
	x,
	y,
	w,
	h,
	tint,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const t = spring({ frame, fps, config: { damping: 18, stiffness: 140, mass: 0.9 } });
	const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
	const glow = interpolate(t, [0, 1], [0, 1]);
	const accent = tint === 'blue' ? COLORS.accent2 : COLORS.accent;

	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width: w,
				height: h,
				borderRadius: 18,
				border: '1px solid rgba(255,255,255,0.14)',
				background: 'rgba(10, 14, 24, 0.55)',
				backdropFilter: 'blur(10px)',
				boxShadow: `0 0 ${18 + 24 * glow}px rgba(85,255,154,0.10)`,
				opacity,
				transform: `translateY(${(1 - t) * 16}px)`,
			}}
		>
			<div style={{ padding: 18 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<span
						style={{
							width: 9,
							height: 9,
							borderRadius: 999,
							background: `linear-gradient(180deg, ${COLORS.accent2}, ${COLORS.accent})`,
						}}
					/>
					<div style={{ color: COLORS.fg, fontSize: 18, fontWeight: 760, letterSpacing: 0.2 }}>
						{title}
					</div>
				</div>

				<div style={{ height: 14 }} />

				{lines.map((line, i) => {
					const reveal = clamp01(interpolate(frame - i * 6, [10, 26], [0, 1], { extrapolateRight: 'clamp' }));
					return (
						<div key={line} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, opacity: reveal }}>
							<div
								style={{
									width: 6,
									height: 6,
									borderRadius: 99,
									background: accent,
									opacity: 0.85,
								}}
							/>
							<div style={{ color: COLORS.muted, fontSize: 18, fontWeight: 520 }}>{line}</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

const DemoUI: React.FC = () => {
	const frame = useCurrentFrame();

	// A slow camera push to sell depth.
	const push = interpolate(frame, [0, 75], [1.0, 1.04]);
	const panX = interpolate(frame, [0, 75], [0, -24]);

	return (
		<AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					transform: `scale(${push}) translateX(${panX}px)`,
					transformOrigin: '50% 50%',
				}}
			>
				<Panel
					title="Live Runs"
					lines={["agent: ingest → running", "agent: triage → queued", "agent: ship → completed"]}
					x={140}
					y={170}
					w={620}
					h={300}
					tint="green"
				/>

				<Panel
					title="Workflow Graph"
					lines={["trigger: webhook", "route: policy", "tools: browser · code · api"]}
					x={820}
					y={230}
					w={860}
					h={360}
					tint="blue"
				/>

				<Panel
					title="Observability"
					lines={["latency p95: 220ms", "errors: 0.3%", "cost: predictable"]}
					x={200}
					y={520}
					w={720}
					h={360}
					tint="blue"
				/>
			</div>
		</AbsoluteFill>
	);
};

const EndCard: React.FC<DemoProps> = ({ url }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const t = clamp01(interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame, fps, config: { damping: 16, stiffness: 190, mass: 0.9 } });
	const opacity = interpolate(t, [0, 1], [0, 1]);
	const y = interpolate(t, [0, 1], [18, 0]);
	const glow = interpolate(t, [0, 1], [0, 1]);

	return (
		<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
			<div style={{ textAlign: 'center', opacity, transform: `translateY(${y}px) scale(${0.98 + 0.02 * pop})` }}>
				<div style={{ fontSize: 60, fontWeight: 900, letterSpacing: -1.1, color: COLORS.fg, textShadow: `0 18px 55px ${COLORS.shadow}` }}>
					Clawdbot the Endgame
				</div>

				<div style={{ height: 14 }} />
				<div style={{ color: COLORS.muted2, fontSize: 26, fontWeight: 560 }}>
					A demo that moves at the speed of your ops.
				</div>

				<div style={{ height: 22 }} />

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
					<span style={{ color: COLORS.muted, fontSize: 22, letterSpacing: 0.2 }}>
						{url ?? 'clawdbot-endgame.yourdomain.com'}
					</span>
				</div>
			</div>
		</AbsoluteFill>
	);
};

export const DemoVideo: React.FC<DemoProps> = ({ title, subtitle, url }) => {
	return (
		<AbsoluteFill style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
			<Background />

			{/* SCENE 1 — Title (0–2s) */}
			<Sequence from={0} durationInFrames={60}>
				<TitleCard title={title} subtitle={subtitle} url={url} />
			</Sequence>

			{/* SCENE 2 — Feature cadence (2–6s) */}
			<Sequence from={60} durationInFrames={120}>
				<FeatureStack />
			</Sequence>

			{/* SCENE 3 — Demo UI (6–8.5s) */}
			<Sequence from={180} durationInFrames={75}>
				<DemoUI />
			</Sequence>

			{/* SCENE 4 — CTA (8.5–10s) */}
			<Sequence from={255} durationInFrames={45}>
				<EndCard title={title} subtitle={subtitle} url={url} />
			</Sequence>
		</AbsoluteFill>
	);
};
