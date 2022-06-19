export interface Config {
    host: string;
    token: string;
    entity_id: string;
}

export const defaultConfig: Config = {
    host: "http://homeassistant.local",
    token: "xxxxxxx",
    entity_id: "input_boolean.in_meeting",
};

export function loadConfig(): Promise<Config> {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(defaultConfig, function (items) {
            // convert items to a Config
            resolve({
                host: items.host,
                token: items.token,
                entity_id: items.entity_id,
            });
        });
    });
}

export function saveConfig(config: Config): Promise<void> {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set(
            {
                host: config.host,
                token: config.token,
                entity_id: config.entity_id,
            },
            function () {
                resolve();
            }
        );
    });
}
