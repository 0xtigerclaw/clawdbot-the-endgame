import { Composition } from 'remotion';
import { PromoVideo } from './compositions/PromoVideo';
import { DemoVideo } from './compositions/DemoVideo';
import { MultiAgentMotion } from './compositions/MultiAgentMotion';
import { WalkthroughVideo } from './compositions/WalkthroughVideo';

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="MultiAgentMotion"
                component={MultiAgentMotion}
                durationInFrames={300} // 10 seconds at 30fps
                fps={30}
                width={1920}
                height={1080}
                defaultProps={{
                    title: "Multi-Agent System",
                    subtitle: "Orchestrate. Parallelize. Verify.",
                    cta: "Ship with confidence",
                    url: "clawdbot-endgame.yourdomain.com"
                }}
            />

            <Composition
                id="DemoVideo"
                component={DemoVideo}
                durationInFrames={300} // 10 seconds at 30fps
                fps={30}
                width={1920}
                height={1080}
                defaultProps={{
                    title: "Clawdbot the Endgame",
                    subtitle: "Agentic AI at Scale",
                    url: "clawdbot-endgame.yourdomain.com"
                }}
            />

            <Composition
                id="PromoVideo"
                component={PromoVideo}
                durationInFrames={150} // 5 seconds at 30fps
                fps={30}
                width={1920}
                height={1080}
                defaultProps={{
                    title: "Clawdbot the Endgame",
                    subtitle: "Agentic AI at Scale",
                    url: "clawdbot-endgame.yourdomain.com"
                }}
            />

            <Composition
                id="WalkthroughVideo"
                component={WalkthroughVideo}
                durationInFrames={300} // 10 seconds at 30fps
                fps={30}
                width={1920}
                height={1080}
                defaultProps={{
                    title: "Clawdbot the Endgame",
                    subtitle: "Multi-agent walkthrough"
                }}
            />
        </>
    );
};
