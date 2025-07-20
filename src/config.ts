export type UpdateMethod = "api" | "webhook";

export interface Config {
    host: string;
    token: string;
    entity_id: string;
    method: UpdateMethod;
    webhook_url: string;
}

export const defaultConfig: Config = {
    host: "http://homeassistant.local",
    token: "xxxxxxx",
    entity_id: "input_boolean.in_meeting",
    method: "api",
    webhook_url: "",
};

export async function loadConfig(): Promise<Config> {
    return (await chrome.storage.sync.get(defaultConfig)) as Config;
}

export async function saveConfig(config: Config) {
    await chrome.storage.sync.set(config);
}
