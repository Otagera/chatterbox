// views/js/htmx-errors.js
document.body.addEventListener("htmx:responseError", function (evt) {
	const errorDetails = evt.detail.xhr;
	let errorMessage = "An unexpected error occurred. Please try again.";

	// Try to parse a more specific message from the server's response
	if (errorDetails.responseText) {
		try {
			const responseJson = JSON.parse(errorDetails.responseText);
			if (responseJson.message) {
				errorMessage = responseJson.message;
			}
		} catch (e) {
			// If response is not JSON, use the raw text (if it's not too long)
			// This can catch HTML error pages.
			if (
				typeof errorDetails.responseText === "string" &&
				errorDetails.responseText.length < 300
			) {
				// Crude way to find a message in an HTML error response.
				const match = errorDetails.responseText.match(/<p>(.*?)<\/p>/);
				errorMessage = match ? match[1] : "Server returned an error.";
			}
		}
	}

	showToast(errorMessage, "error");
});

function showToast(message, type = "info") {
	const container = document.getElementById("toast-container");
	if (!container) return;

	const toast = document.createElement("div");
	const baseClasses =
		"px-4 py-3 rounded-md shadow-lg text-white font-medium animate-fade-in-out";
	const typeClasses = type === "error" ? "bg-red-500" : "bg-green-500";

	toast.className = `${baseClasses} ${typeClasses}`;
	toast.textContent = message;

	container.appendChild(toast);

	// Remove the toast after a few seconds
	setTimeout(() => {
		toast.remove();
	}, 5000);
}
