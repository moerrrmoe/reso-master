import { TelegramClient } from "teleproto";
import { StoreSession } from "teleproto/sessions";
import dotenv from "dotenv";

dotenv.config();

const sessionPath = process.env.SESSION_PATH || "bot_session";
const session = new StoreSession(sessionPath);

const client = new TelegramClient(session, Number(process.env.API_ID), process.env.API_HASH, {
    connectionRetries: 5,
    requestRetries: 5,
    retryDelay: 1000,
    retryDelayMax: 10000,
});

export { client, session };
export default client;
