import * as net from "net";
import * as fs from "fs";
import ChatterboxSDK from "@chatterbox/chatterbox-sdk";

// A unix socket is faster than TCP for same-machine communication
const SOCKET_PATH = "/tmp/chatterbox-logger.sock";

export function startInternalLogServer() {
	// 1. Create the single, shared ChatterboxSDK instance
	const chatterbox = new ChatterboxSDK({
		apiSecret: process.env.CHATTERBOX_API_SECRET || "",
		appName: process.env.CHATTERBOX_APP_NAME || "",
		logFile: "chatterbox-queue.log", // Or from config
	});

	// 2. Create the internal server that will receive logs from the transport
	const server = net.createServer((socket) => {
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk.toString();
			let boundary = buffer.indexOf("\n");
			// Process all complete JSON objects received
			while (boundary !== -1) {
				const jsonString = buffer.substring(0, boundary);
				buffer = buffer.substring(boundary + 1);
				if (jsonString) {
					try {
						const logData = JSON.parse(jsonString);
						// Use the single SDK instance to process the log
						// We don't wait for the result, allowing the transport to be fast
						chatterbox.sendLog(logData).then((success) => {
							if (!success) {
								chatterbox.queueLog(logData);
							}
						});
					} catch (e) {
						console.error("[Internal Log Server] Failed to parse log JSON:", e);
					}
				}
				boundary = buffer.indexOf("\n");
			}
		});

		socket.on("error", (err) => {
			console.error("[Internal Log Server] Socket error:", err);
		});
	});

	server.on("error", (err) => {
		console.error("[Internal Log Server] Server error:", err);
	});

	// Clean up old socket file if it exists
	if (fs.existsSync(SOCKET_PATH)) {
		fs.unlinkSync(SOCKET_PATH);
	}

	// 3. Start listening on the socket
	server.listen(SOCKET_PATH, () => {
		console.log("Internal logging service started on", SOCKET_PATH);
	});

	// 4. Graceful shutdown
	const shutdown = () => {
		console.log("Shutting down internal logging service.");
		server.close();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}
