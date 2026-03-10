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
	subtitle: string;
};

const C = {
	bg: '#0B0B0C',
	panel: 'rgba(255,255,255,0.06)',
	stroke: 'rgba(255,255,255,0.12)',
	fg: '#FFFFFF',
	muted: 'rgba(255,255,255,0.76)',
	cyan: '#00D4FF',
	green: '#76FF5A',
	shadow: 'rgba(0,0,0,0.6)',
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const Background: React.FC = () => {
	const frame = useCurrentFrame();
	const sweep = interpolate(frame, [0, 450], [-900, 2600]);
	const driftX = interpolate(frame, [0, 450], [0, -70]);
	const driftY = interpolate(frame, [0, 450], [0, 28]);
	return (
		<AbsoluteFill>
			<AbsoluteFill
				style={{
					background: `radial-gradient(1200px 700px at 18% 40%, rgba(0,212,255,0.14), transparent 60%),
					radial-gradient(900px 600px at 72% 62%, rgba(118,255,90,0.10), transparent 62%),
					linear-gradient(180deg, ${C.bg}, #070A10)`,
				}}
			/>
			<AbsoluteFill
				style={{
					transform: `translate(${driftX}px, ${driftY}px)`,
					backgroundImage:
						'repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 64px)',
					opacity: 0.22,
					mixBlendMode: 'screen',
				}}
			/>
			<AbsoluteFill
				style={{
					background:
						'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 48%, transparent 62%)',
					transform: `translateX(${sweep}px) skewX(-18deg)`,
					filter: 'blur(10px)',
					opacity: 0.55,
				}}
			/>
			<AbsoluteFill
				style={{
					background:
						'radial-gradient(1200px 700px at 50% 45%, transparent 55%, rgba(0,0,0,0.72) 100%)',
				}}
			/>
		</AbsoluteFill>
	);
};

const TopTitle: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = clamp01(interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }));
	const pop = spring({ frame, fps, config: { damping: 18, stiffness: 170, mass: 0.9 } });
	return (
		<div
			style={{
				position: 'absolute',
				left: 70,
				top: 54,
				opacity: t,
				transform: `translateY(${(1 - t) * 10}px) scale(${0.985 + 0.015 * pop})`,
			}}
		>
			<div
				style={{
					color: C.fg,
					fontSize: 48,
					fontWeight: 900,
					letterSpacing: -1.1,
					textShadow: `0 18px 55px ${C.shadow}`,
				}}
			>
				{title}
			</div>
			<div style={{ height: 8 }} />
			<div style={{ color: C.muted, fontSize: 24, fontWeight: 600 }}>{subtitle}</div>
		</div>
	);
};

const Panel: React.FC<{ x: number; y: number; w: number; h: number; children?: React.ReactNode }> = ({
	x,
	y,
	w,
	h,
	children,
}) => (
	<div
		style={{
			position: 'absolute',
			left: x,
			top: y,
			width: w,
			height: h,
			borderRadius: 18,
			background: C.panel,
			border: `1px solid ${C.stroke}`,
			backdropFilter: 'blur(10px)',
			overflow: 'hidden',
		}}
	>
		{children}
	</div>
);

const Cursor: React.FC<{ start: number; end: number; from: [number, number]; to: [number, number] }> = ({
	start,
	end,
	from,
	to,
}) => {
	const frame = useCurrentFrame();
	const t = clamp01(interpolate(frame, [start, end], [0, 1], { extrapolateRight: 'clamp' }));
	const x = from[0] + (to[0] - from[0]) * t;
	const y = from[1] + (to[1] - from[1]) * t;
	const a = clamp01(interpolate(frame, [start, start + 8], [0, 1], { extrapolateRight: 'clamp' }));
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				opacity: a,
				width: 0,
				height: 0,
				borderLeft: '14px solid transparent',
				borderRight: '14px solid transparent',
				borderTop: `22px solid ${C.fg}`,
				filter: `drop-shadow(0 10px 18px ${C.shadow})`,
				transform: 'rotate(-20deg)',
			}}
		/>
	);
};

const StepLabel: React.FC<{ text: string; start: number; end: number }> = ({ text, start, end }) => {
	const frame = useCurrentFrame();
	const tIn = clamp01(interpolate(frame, [start, start + 10], [0, 1], { extrapolateRight: 'clamp' }));
	const tOut = clamp01(interpolate(frame, [end - 10, end], [0, 1], { extrapolateLeft: 'clamp' }));
	const opacity = tIn * (1 - tOut);
	return (
		<div
			style={{
				position: 'absolute',
				left: 70,
				bottom: 70,
				opacity,
				transform: `translateY(${(1 - tIn) * 8 - tOut * 10}px)`,
			}}
		>
			<div style={{ color: C.muted, fontSize: 18, letterSpacing: 2.2, fontWeight: 800 }}>
				WALKTHROUGH
			</div>
			<div style={{ height: 10 }} />
			<div
				style={{
					color: C.fg,
					fontSize: 44,
					fontWeight: 900,
					letterSpacing: -0.8,
					textShadow: `0 18px 55px ${C.shadow}`,
				}}
			>
				{text}
			</div>
			<div style={{ height: 12 }} />
			<div
				style={{
					height: 2,
					width: 520,
					background: `linear-gradient(90deg, ${C.cyan}, ${C.green})`,
					borderRadius: 2,
					opacity: 0.85,
				}}
			/>
		</div>
	);
};

const DashboardScene: React.FC = () => {
	return (
		<>
			<Panel x={70} y={150} w={1780} h={740}>
				<div style={{ padding: 26 }}>
					<div style={{ display: 'flex', gap: 16 }}>
						<div style={{ flex: 1, height: 160, borderRadius: 16, background: 'rgba(255,255,255,0.05)' }} />
						<div style={{ flex: 1, height: 160, borderRadius: 16, background: 'rgba(255,255,255,0.05)' }} />
						<div style={{ flex: 1, height: 160, borderRadius: 16, background: 'rgba(255,255,255,0.05)' }} />
					</div>
					<div style={{ height: 18 }} />
					<div style={{ display: 'flex', gap: 16 }}>
						<div style={{ width: 520, height: 510, borderRadius: 16, background: 'rgba(255,255,255,0.04)' }} />
						<div style={{ flex: 1, height: 510, borderRadius: 16, background: 'rgba(255,255,255,0.04)' }} />
					</div>
				</div>
			</Panel>
			<Cursor start={10} end={55} from={[960, 520]} to={[1460, 360]} />
		</>
	);
};

const ProcessScene: React.FC<{ mode: 'agents' | 'handoffs' | 'video' }> = ({ mode }) => {
	const label =
		mode === 'agents'
			? 'AI Agents'
			: mode === 'handoffs'
				? 'Seamless Handoffs'
				: 'Video Production';
	const accent = mode === 'agents' ? C.cyan : mode === 'handoffs' ? '#7C8CFF' : '#B07CFF';

	return (
		<>
			<Panel x={70} y={150} w={1780} h={740}>
				<div style={{ padding: 26, display: 'flex', gap: 18 }}>
					<div style={{ width: 520, borderRadius: 16, background: 'rgba(255,255,255,0.04)', padding: 18 }}>
						<div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 16, letterSpacing: 2.0, fontWeight: 800 }}>
							PIPELINE
						</div>
						<div style={{ height: 14 }} />
						{['Intake', 'Plan', 'Execute', 'Verify', 'Ship'].map((s, i) => (
							<div
								key={s}
								style={{
									padding: '12px 14px',
									borderRadius: 14,
									border: '1px solid rgba(255,255,255,0.10)',
									background: i === 2 ? 'rgba(0,212,255,0.10)' : 'rgba(255,255,255,0.03)',
									marginBottom: 12,
									color: 'rgba(255,255,255,0.86)',
									fontWeight: 750,
								}}
							>
								{s}
							</div>
						))}
					</div>

					<div style={{ flex: 1, borderRadius: 16, background: 'rgba(255,255,255,0.04)', padding: 22 }}>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
							<div style={{ color: C.fg, fontSize: 30, fontWeight: 900, letterSpacing: -0.6 }}>
								{label}
							</div>
							<div
								style={{
									width: 220,
									height: 10,
									borderRadius: 999,
									background: 'rgba(255,255,255,0.10)',
									overflow: 'hidden',
								}}
							>
								<div
									style={{
										height: '100%',
										width: '76%',
										background: `linear-gradient(90deg, ${accent}, ${C.green})`,
									}}
								/>
							</div>
						</div>

						<div style={{ height: 18 }} />
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
							<div style={{ height: 220, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
							<div style={{ height: 220, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
							<div style={{ height: 220, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
							<div style={{ height: 220, borderRadius: 16, background: 'rgba(255,255,255,0.03)' }} />
						</div>
						<div style={{ height: 18 }} />
						<div style={{ color: C.muted, fontSize: 20, fontWeight: 600 }}>
							{mode === 'agents'
								? 'Spin up specialized agents. Route by skill. Verify outputs.'
								: mode === 'handoffs'
									? 'Hand off context cleanly. Keep artifacts, logs, and state aligned.'
									: 'Generate, render, and ship videos from the same control plane.'}
						</div>
					</div>
				</div>
			</Panel>
			<Cursor start={8} end={70} from={[980, 520]} to={[1260, 260]} />
		</>
	);
};

export const WalkthroughVideo: React.FC<Props> = ({ title, subtitle }) => {
	return (
		<AbsoluteFill style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
			<Background />
			<TopTitle title={title} subtitle={subtitle} />

			{/* 0–3s dashboard */}
			<Sequence from={0} durationInFrames={90}>
				<DashboardScene />
				<StepLabel text="Dashboard overview" start={0} end={90} />
			</Sequence>

			{/* 3–6s agents */}
			<Sequence from={90} durationInFrames={90}>
				<ProcessScene mode="agents" />
				<StepLabel text="AI Agents" start={90} end={180} />
			</Sequence>

			{/* 6–8s handoffs */}
			<Sequence from={180} durationInFrames={60}>
				<ProcessScene mode="handoffs" />
				<StepLabel text="Seamless handoffs" start={180} end={240} />
			</Sequence>

			{/* 8–10s video */}
			<Sequence from={240} durationInFrames={60}>
				<ProcessScene mode="video" />
				<StepLabel text="Video production" start={240} end={300} />
			</Sequence>
		</AbsoluteFill>
	);
};
