export type LogLevelConfigItem = {
	label: "Info" | "Warning" | "Error" | "Debug" | "Trace" | "Fatal";
	color: string;
};

export const LOG_LEVEL_CONFIG: Record<string, LogLevelConfigItem> = {
	info: { label: "Info", color: "rgba(54, 162, 235, 0.7)" },
	warning: { label: "Warning", color: "rgba(255, 159, 64, 0.4)" },
	error: { label: "Error", color: "rgba(255, 99, 132, 0.7)" },
	debug: { label: "Debug", color: "rgba(75, 192, 192, 0.7)" },
	trace: { label: "Trace", color: "rgba(100, 100, 255, 0.7)" },
	fatal: { label: "Fatal", color: "rgba(255, 159, 64, 0.8)" },
	// Add other levels if needed
};

export const KNOWN_LEVEL_KEYS = Object.keys(LOG_LEVEL_CONFIG);

export type LevelKey = keyof typeof LOG_LEVEL_CONFIG; // "info" | "warning" | ...

export type LogVolumeAggregate = {
	day: Date;
	level: LevelKey;
	logVolume: number;
};

export type ChartDataset = {
	label: LogLevelConfigItem["label"] | string; // Allow specific level labels or general labels like "Error Rate (%)"
	data: number[];
	backgroundColor?: string | string[];
	borderColor?: string;
	tension?: number;
	borderWidth?: number;
	axis?: "x" | "y"; // For bar charts if needed
	fill?: boolean; // For line charts if needed
	hoverOffset?: number;
};

export type ChartData = {
	labels: string[];
	datasets: ChartDataset[];
};

export type ChatterboxConfigType = {
	appName: string;
	level?: ChatterboxKey;
	messageKey?: string;
	enableConsoleLogs?: boolean;
};
export type ChatterboxKey = keyof typeof LOG_LEVEL_CONFIG; // "info" | "warning" | ...
