const logVolumeChart = document.getElementById("logVolumeChart");
const logLevelDistributionChart = document.getElementById(
	"logLevelDistributionChart"
);
const topKeysChart = document.getElementById("topKeysChart");
const errorRateChart = document.getElementById("errorRateChart");
if (logVolumeChart) {
	new Chart(logVolumeChart, {
		type: "bar",
		data: chartData.logVolume,
		options: {
			scales: {
				y: {
					beginAtZero: true,
				},
			},
		},
	});
}
if (logLevelDistributionChart) {
	new Chart(logLevelDistributionChart, {
		type: "pie",
		data: chartData.logLevel,
	});
}
if (topKeysChart) {
	new Chart(topKeysChart, {
		type: "bar",
		data: chartData.topKeys,
		options: {
			indexAxis: "y",
			scales: {
				x: {
					title: {
						display: true,
						text: "Occurrences",
						color: "#333",
						font: {
							size: 14,
							weight: "bold",
						},
						padding: { top: 2, bottom: 0 },
					},
					beginAtZero: true,
				},
			},
		},
	});
}
if (errorRateChart) {
	new Chart(errorRateChart, {
		type: "line",
		data: chartData.errorRate,
		options: {
			// Add responsive and maintainAspectRatio if needed
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				y: {
					beginAtZero: true, // Ensures the Y-axis starts at 0
					// Recommended: Set a suggestedMax based on typical data
					suggestedMax: 10, // Adjust this value based on your typical highest error rates (e.g., 10, 15, 20)
					// Alternatively, you could dynamically calculate a max based on your 'data' array
					// For full dynamism, you could remove suggestedMax and let Chart.js auto-scale
					title: {
						display: true,
						text: "Error Rate (%)",
					},
				},
				x: {
					title: {
						display: true,
						text: "Date",
					},
				},
			},
			plugins: {
				tooltip: {
					callbacks: {
						label: function (context) {
							let label = context.dataset.label || "";
							if (label) {
								label += ": ";
							}
							if (context.parsed.y !== null) {
								label += context.parsed.y.toFixed(2) + "%";
							}
							return label;
						},
					},
				},
				annotation: {
					annotations: {
						thresholdLine: {
							type: "line", // Defines the annotation type as a line
							mode: "horizontal", // Makes it a horizontal line
							scaleID: "y", // Connects it to the Y-axis
							value: 5, // The Y-axis value where the line will be (e.g., 5% error rate)
							borderColor: "red", // Color of the line
							borderWidth: 2, // Thickness of the line
							borderDash: [6, 6], // Makes the line dashed
							label: {
								display: true,
								content: "Acceptable Threshold (5%)", // Label text for the line
								position: "start", // Position of the label (e.g., 'start', 'end', 'center')
								color: "red", // Color of the label
							},
						},
					},
				},
			},
		},
	});
}
