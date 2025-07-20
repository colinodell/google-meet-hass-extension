import { Config } from "./config";

async function setEntityStateAPI(config: Config, newValue: boolean) {
    await fetch(config.host + "/api/states/" + config.entity_id, {
        method: "POST",
        headers: {
            Authorization: "Bearer " + config.token,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            state: newValue ? "on" : "off",
        }),
    });
}

async function setEntityStateWebhook(config: Config, newValue: boolean) {
    await fetch(config.webhook_url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            value: newValue ? "on" : "off",
        }),
    });
}

export async function setEntityState(config: Config, newValue: boolean) {
    if (config.method === "webhook") {
        return await setEntityStateWebhook(config, newValue);
    } else {
        return await setEntityStateAPI(config, newValue);
    }
}

export interface TestResult {
    success: boolean;
    message: string;
}

async function testConnectionAPI(config: Config): Promise<TestResult> {
    try {
        const { status } = await fetch(
            config.host + "/api/states/" + config.entity_id,
            {
                method: "GET",
                headers: {
                    Authorization: "Bearer " + config.token,
                    "Content-Type": "application/json",
                },
            }
        );

        switch (status) {
            case 200:
                return {
                    success: true,
                    message: "API configuration is valid",
                };
            case 401:
                return {
                    success: false,
                    message: "Invalid auth token",
                };
            case 404:
                return {
                    success: false,
                    message: "Entity not found, or incorrect base URL",
                };
            default:
                return {
                    success: false,
                    message: "Unexpected error: HTTP " + status,
                };
        }
    } catch (error) {
        return {
            success: false,
            message: "Unexpected error: " + error,
        };
    }
}

async function testConnectionWebhook(config: Config): Promise<TestResult> {
    try {
        const response = await fetch(config.webhook_url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                value: "on",
            }),
        });

        if (response.status === 200) {
            return {
                success: true,
                message: "Webhook configuration is valid",
            };
        } else {
            return {
                success: false,
                message: "Webhook test failed: HTTP " + response.status,
            };
        }
    } catch (error) {
        return {
            success: false,
            message: "Webhook test failed: " + error,
        };
    }
}

export async function testConnection(config: Config): Promise<TestResult> {
    if (config.method === "webhook") {
        return await testConnectionWebhook(config);
    } else {
        return await testConnectionAPI(config);
    }
}
