// @hutch cli=0.29.0 cottontail=0.7.3
export default {
	packageManager: "npm",
	scripts: {
		install: ["hutch", "pm", "install"],
		start: ["hutch", "electrobun", "dev"],
		build: ["hutch", "electrobun", "build", "--env=stable"],
	},
};
