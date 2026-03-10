"use client";

import { Player } from "@remotion/player";
import { DemoVideo } from "../remotion/compositions/DemoVideo";

export default function RemotionPreviewPage() {
    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-10">
            <h1 className="text-white text-2xl mb-6">Clawdbot the Endgame Studio Preview</h1>
            <div className="border-4 border-gray-800 rounded-lg overflow-hidden shadow-2xl">
                <Player
                    component={DemoVideo}
                    inputProps={{
                        title: "Clawdbot the Endgame",
                        subtitle: "Agentic AI at Scale",
                        url: "localhost:3000",
                    }}
                    durationInFrames={300}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    fps={30}
                    acknowledgeRemotionLicense
                    style={{
                        width: 960,
                        height: 540,
                    }}
                    controls
                />
            </div>
        </div>
    );
}
