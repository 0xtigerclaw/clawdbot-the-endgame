import { mutation } from "./_generated/server";

export const seedMissions = mutation({
    args: {},
    handler: async (ctx) => {
        // Clear existing tasks first for a clean slate
        const tasks = await ctx.db.query("tasks").collect();
        for (const task of tasks) {
            await ctx.db.delete(task._id);
        }

        // Mission 1: Assigned (New app launch)
        await ctx.db.insert("tasks", {
            title: "Launch Mobile App Beta",
            description: "Coordinate the launch of the iOS beta. Need landing page, email sequence, and social announcements.",
            priority: "high",
            status: "assigned",
            assignedTo: "Tesla",
            workflow: ["Tesla", "Ogilvy", "Carnegie", "Ive"],
            currentStep: 0,
        });

        // Mission 2: In Progress - Market Research (Curie)
        await ctx.db.insert("tasks", {
            title: "Competitor Analysis: Acme Corp",
            description: "Deep dive into Acme's new pricing strategy and feature set.",
            priority: "medium",
            status: "in_progress",
            assignedTo: "Curie",
            workflow: ["Curie", "Porter"],
            currentStep: 0,
        });

        // Mission 3: In Progress - Parallel Swarm (Content Blitz)
        await ctx.db.insert("tasks", {
            title: "Q1 Content Blitz",
            description: "Generate 5 blog posts and 20 social tweets for the Q1 campaign.",
            priority: "high",
            status: "in_progress",
            assignedTo: ["Ogilvy", "Kotler", "Porter"], // Parallel assignment
            workflow: [["Ogilvy", "Kotler", "Porter"], "Tigerclaw"],
            currentStep: 0,
        });

        // Mission 4: Review (Tigerclaw)
        await ctx.db.insert("tasks", {
            title: "Fix Login Bug",
            description: "Users reporting issues with OAuth login on Safari.",
            priority: "critical",
            status: "review",
            assignedTo: "Tigerclaw",
            workflow: ["Torvalds", "Tigerclaw"],
            currentStep: 1,
            output: "Root cause identified: Cookie serialization issue. Patch applied in #402. Ready for review.",
        });

        // Mission 5: Done (Website Redesign)
        const doneHeader = `
---
# 🏆 MISSION COMPLETE
> **Status:** ✅ APPROVED  
> **Reviewed by:** Tigerclaw  
> **Completed:** ${new Date().toISOString().split('T')[0]}
---
## 📋 Final Deliverable
The following is the consolidated output from all agents who worked on this mission:
---
`;
        await ctx.db.insert("tasks", {
            title: "Website Redesign",
            description: "Overhaul the homepage with new branding.",
            priority: "high",
            status: "done",
            assignedTo: "Tigerclaw",
            workflow: ["Ive", "Tigerclaw"],
            currentStep: 1,
            output: doneHeader + "\n## ✅ Tigerclaw's Review\n\nStunning work. The new typography is perfect. Deployed to prod.",
            feedback: "Approved by Tigerclaw ✅"
        });

        console.log("Seeded 5 dummy missions.");
    },
});
