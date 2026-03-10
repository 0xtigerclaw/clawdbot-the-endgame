import React from 'react';
import {
	AbsoluteFill,
	Sequence,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type PromoProps = {
	title: string;
	subtitle: string;
	url?: string;
};

const COLORS = {
	bg: '#0B0F17',
	fg: '#EAF0FF',
	muted: 'rgba(234, 240, 255, 0.72)',
	accent: '#55FF9A',
	accent2: '#6AA6FF',
	shadow: 'rgba(0,0,0,0.55)',
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const TitleCard: React.FC<PromoProps> = ({ title, subtitle }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const t = clamp01(interpolate(frame, [0, 26], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({
		frame,
		fps,
		config: { damping: 18, mass: 0.9, stiffness: 140 },
	});

	const y = interpolate(t, [0, 1], [22, 0]);
	const opacity = interpolate(t, [0, 1], [0, 1]);
	const underlineW = interpolate(t, [0, 1], [0, 720]);

	// A very Nolan-esque wipe: animated clip-path on a highlight layer.
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
							fontSize: 92,
							fontWeight: 800,
							letterSpacing: -1.5,
							lineHeight: 1.02,
							textShadow: `0 18px 55px ${COLORS.shadow}`,
						}}
					>
						{title}
					</h1>
				</div>

				<div style={{ height: 18 }} />

				<p
					style={{
						margin: 0,
						color: COLORS.muted,
						fontSize: 34,
						fontWeight: 520,
						letterSpacing: 0.2,
					}}
				>
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
	const outT = clamp01(interpolate(local, [52, 66], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
	const appear = spring({ frame: local, fps, config: { damping: 20, stiffness: 160, mass: 0.8 } });

	const opacity = (1 - outT) * interpolate(inT, [0, 1], [0, 1]);
	const y = interpolate(inT, [0, 1], [14, 0]) + outT * -12;
	const lineW = interpolate(inT, [0, 1], [0, 520]);

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
						fontSize: 44,
						fontWeight: 780,
						letterSpacing: -0.8,
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
			<div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
				<Beat label="Deploy" emphasis="Agents" start={0} />
				<Beat label="Orchestrate" emphasis="Workflows" start={24} />
				<Beat label="Observe" emphasis="Everything" start={48} />
			</div>
		</AbsoluteFill>
	);
};

const EndCard: React.FC<PromoProps> = ({ url }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const t = clamp01(interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame, fps, config: { damping: 16, stiffness: 180, mass: 0.85 } });

	const opacity = interpolate(t, [0, 1], [0, 1]);
	const y = interpolate(t, [0, 1], [18, 0]);
	const glow = interpolate(t, [0, 1], [0, 1]);

	return (
		<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
			<div style={{ textAlign: 'center', opacity, transform: `translateY(${y}px) scale(${0.98 + 0.02 * pop})` }}>
				<div style={{
					fontSize: 56,
					fontWeight: 850,
					letterSpacing: -1.0,
					color: COLORS.fg,
					textShadow: `0 18px 55px ${COLORS.shadow}`,
				}}>
					Launch Clawdbot the Endgame
				</div>

				<div style={{ height: 18 }} />

				<div style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 10,
					padding: '12px 18px',
					borderRadius: 999,
					border: '1px solid rgba(255,255,255,0.14)',
					background: 'rgba(10, 14, 24, 0.55)',
					backdropFilter: 'blur(10px)',
					boxShadow: `0 0 ${22 + 18 * glow}px rgba(85,255,154,0.18)`,
				}}>
					<span style={{
						width: 10,
						height: 10,
						borderRadius: 999,
						background: `linear-gradient(180deg, ${COLORS.accent2}, ${COLORS.accent})`,
					}} />
					<span style={{ color: COLORS.muted, fontSize: 22, letterSpacing: 0.2 }}>
						{url ?? 'clawdbot-endgame.yourdomain.com'}
					</span>
				</div>
			</div>
		</AbsoluteFill>
	);
};

const Background: React.FC = () => {
	const frame = useCurrentFrame();

	// Slow parallax grid + light sweep for depth.
	const driftX = interpolate(frame, [0, 150], [0, -40]);
	const driftY = interpolate(frame, [0, 150], [0, 18]);
	const sweep = interpolate(frame, [0, 150], [-700, 2200]);
	const vignette = interpolate(frame, [0, 25], [0.85, 1], { extrapolateRight: 'clamp' });

	return (
		<AbsoluteFill>
			{/* Base gradient */}
			<AbsoluteFill
				style={{
					background: `radial-gradient(1200px 700px at 18% 40%, rgba(106,166,255,0.16), transparent 60%),
					radial-gradient(900px 600px at 70% 60%, rgba(85,255,154,0.12), transparent 62%),
					linear-gradient(180deg, ${COLORS.bg}, #070A10)`,
				}}
			/>

			{/* Grid */}
			<AbsoluteFill
				style={{
					transform: `translate(${driftX}px, ${driftY}px)`,
					backgroundImage:
						'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 64px)',
					opacity: 0.22,
					mixBlendMode: 'screen',
				}}
			/>

			{/* Light sweep */}
			<AbsoluteFill
				style={{
					background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 48%, transparent 62%)`,
					transform: `translateX(${sweep}px) skewX(-18deg)`,
					filter: 'blur(10px)',
					opacity: 0.55,
				}}
			/>

			{/* Vignette */}
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

export const PromoVideo: React.FC<PromoProps> = ({ title, subtitle, url }) => {
	return (
		<AbsoluteFill style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
			<Background />

			{/* Scene 1: Title */}
			<Sequence from={0} durationInFrames={46}>
				<TitleCard title={title} subtitle={subtitle} url={url} />
			</Sequence>

			{/* Scene 2: Feature beats */}
			<Sequence from={46} durationInFrames={74}>
				<FeatureStack />
			</Sequence>

			{/* Scene 3: End card / CTA */}
			<Sequence from={120} durationInFrames={30}>
				<EndCard title={title} subtitle={subtitle} url={url} />
			</Sequence>
		</AbsoluteFill>
	);
};
