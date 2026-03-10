import React from 'react';
import {
	AbsoluteFill,
	Sequence,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type Props = {
	title: string;
};

const COLORS = {
	bg: '#0B0B0C',
	fg: '#FFFFFF',
	muted: 'rgba(255,255,255,0.78)',
	cyan: '#00D4FF',
	green: '#76FF5A',
	shadow: 'rgba(0,0,0,0.55)',
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const Background: React.FC = () => {
	const frame = useCurrentFrame();
	const sweep = interpolate(frame, [0, 300], [-900, 2600]);
	const driftX = interpolate(frame, [0, 300], [0, -60]);
	const driftY = interpolate(frame, [0, 300], [0, 24]);

	return (
		<AbsoluteFill>
			<AbsoluteFill
				style={{
					background: `radial-gradient(1200px 700px at 18% 40%, rgba(0,212,255,0.14), transparent 60%),
					radial-gradient(900px 600px at 72% 62%, rgba(118,255,90,0.10), transparent 62%),
					linear-gradient(180deg, ${COLORS.bg}, #070A10)`,
				}}
			/>

			{/* Subtle grid */}
			<AbsoluteFill
				style={{
					transform: `translate(${driftX}px, ${driftY}px)`,
					backgroundImage:
						'repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 64px)',
					opacity: 0.22,
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
						'radial-gradient(1200px 700px at 50% 45%, transparent 55%, rgba(0,0,0,0.72) 100%)',
				}}
			/>
		</AbsoluteFill>
	);
};

const Title: React.FC<Props> = ({ title }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = clamp01(interpolate(frame, [0, 22], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame, fps, config: { damping: 18, stiffness: 160, mass: 0.9 } });
	const y = interpolate(t, [0, 1], [18, 0]);
	const opacity = interpolate(t, [0, 1], [0, 1]);
	const underlineW = interpolate(t, [0, 1], [0, 620]);
	return (
		<AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 170 }}>
			<div style={{ opacity, transform: `translateY(${y}px) scale(${0.985 + 0.015 * pop})` }}>
				<h1
					style={{
						margin: 0,
						color: COLORS.fg,
						fontSize: 92,
						fontWeight: 850,
						letterSpacing: -1.5,
						lineHeight: 1.02,
						textShadow: `0 18px 55px ${COLORS.shadow}`,
					}}
				>
					{title}
				</h1>
				<div style={{ height: 16 }} />
				<p style={{ margin: 0, color: COLORS.muted, fontSize: 34, fontWeight: 520 }}>
					Modern ops for agentic work.
				</p>
				<div style={{ height: 26 }} />
				<div
					style={{
						height: 2,
						width: underlineW,
						background: `linear-gradient(90deg, ${COLORS.cyan}, ${COLORS.green})`,
						opacity: 0.9,
						borderRadius: 2,
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};

const FeatureBeat: React.FC<{ k: string; v: string; accent: string; start: number }> = ({
	k,
	v,
	accent,
	start,
}) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const local = frame - start;
	const inT = clamp01(interpolate(local, [0, 14], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame: local, fps, config: { damping: 18, stiffness: 170, mass: 0.85 } });
	const opacity = interpolate(inT, [0, 1], [0, 1]);
	const y = interpolate(inT, [0, 1], [14, 0]);
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
					{k}
				</span>
				<span
					style={{
						color: COLORS.fg,
						fontSize: 50,
						fontWeight: 850,
						letterSpacing: -1.0,
						transform: `translateY(${(1 - pop) * 6}px)`,
						textShadow: `0 18px 55px ${COLORS.shadow}`,
					}}
				>
					{v}
				</span>
			</div>
			<div style={{ height: 14 }} />
			<div
				style={{
					height: 2,
					width: lineW,
					background: `linear-gradient(90deg, ${accent}, ${COLORS.green})`,
					opacity: 0.85,
					borderRadius: 2,
				}}
			/>
		</div>
	);
};

const FeatureSection: React.FC = () => {
	return (
		<AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 170 }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 46 }}>
				<FeatureBeat k="1" v="AI Agents" accent={COLORS.cyan} start={0} />
				<FeatureBeat k="2" v="Seamless Handoffs" accent={'#5BA3FF'} start={34} />
				<FeatureBeat k="3" v="Video Production" accent={'#9B7CFF'} start={68} />
			</div>
		</AbsoluteFill>
	);
};

const CTA: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = clamp01(interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame, fps, config: { damping: 16, stiffness: 180, mass: 0.85 } });
	return (
		<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
			<div style={{ textAlign: 'center', opacity: t, transform: `scale(${0.98 + 0.02 * pop})` }}>
				<div
					style={{
						fontSize: 64,
						fontWeight: 900,
						letterSpacing: -1.2,
						color: COLORS.fg,
						textShadow: `0 18px 55px ${COLORS.shadow}`,
					}}
				>
					Clawdbot the Endgame
				</div>
				<div style={{ height: 16 }} />
				<div style={{ fontSize: 34, color: COLORS.muted, fontWeight: 600 }}>
					Ship agentic work at scale.
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
						boxShadow: '0 0 36px rgba(0,212,255,0.14)',
					}}
				>
					<span
						style={{
							width: 10,
							height: 10,
							borderRadius: 999,
							background: `linear-gradient(180deg, ${COLORS.cyan}, ${COLORS.green})`,
						}}
					/>
					<span style={{ color: COLORS.muted, fontSize: 22 }}>
						clawdbot-endgame.yourdomain.com
					</span>
				</div>
			</div>
		</AbsoluteFill>
	);
};

export const DemoVideo10s: React.FC<Props> = ({ title }) => {
	return (
		<AbsoluteFill style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
			<Background />

			{/* 0s–2s */}
			<Sequence from={0} durationInFrames={60}>
				<Title title={title} />
			</Sequence>

			{/* 2s–8s */}
			<Sequence from={60} durationInFrames={180}>
				<FeatureSection />
			</Sequence>

			{/* 8s–10s */}
			<Sequence from={240} durationInFrames={60}>
				<CTA />
			</Sequence>
		</AbsoluteFill>
	);
};
