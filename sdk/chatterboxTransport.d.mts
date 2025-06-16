/**
 * Creates a writable stream for Pino to transport logs.
 * This transport intelligently filters out success logs from its own API endpoints
 * to prevent feedback loops, while still allowing error logs from those same endpoints
 * to be captured.
 *
 * @param {object} opts - Options passed by Pino.
 * @returns {Promise<Writable>} A Promise that resolves to our custom Writable stream.
 */
export default function _default(opts: object): Promise<Writable>;
import { Writable } from "stream";
