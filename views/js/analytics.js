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
			scales: {
				y: {
					beginAtZero: true,
				},
			},
		},
	});
}
if (errorRateChart) {
	new Chart(errorRateChart, {
		type: "bar",
		data: chartData.errorRate,
		options: {
			scales: {
				y: {
					beginAtZero: true,
				},
			},
		},
	});
}
